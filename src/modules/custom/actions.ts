"use server";

import { Prisma, type CustomEntity } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/core/audit";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { checkbox, formObject, fromZod, type ActionState } from "@/core/forms";
import { customSeriesType, ensureSeries, nextNumber } from "@/core/numbering";
import { P as ADMIN } from "@/modules/admin/module";
import { deleteAttachmentsOf } from "@/modules/attachments";
import { removeFile, saveFile } from "@/core/storage";
import {
  brokenRules,
  computeFormulas,
  conditionMet,
  isData,
  parseRules,
  ruleSchema,
  fieldListSchema,
  fileValue,
  parseData,
  parseFields,
  recordSchema,
  type CustomField,
  type RecordData,
} from "./fields";
import { checkFormula } from "./formula";
import { prepareLines, writeLines } from "./lines";
import { resolveLookups, uniqueErrors } from "./lookups";
import { MENU_HOSTS } from "@/modules/registry";
import { customPermission, customSeriesDefaults } from "./module";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** A line of an inline grid failed inside the save transaction; the message goes back to the form. */
class LineError extends Error {}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const slug = (what: string) =>
  z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, `${what} must start with a letter and use lowercase letters, digits and -`);

// ─────────────── Module builder ───────────────

const entityInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Every record type needs a name").max(100),
  slug: slug("Record type URL names"),
  fields: fieldListSchema.refine((f) => f.length > 0, "Every record type needs at least one field"),
  formLayout: z.enum(["sections", "tabs"]).default("sections"),
  approval: z.boolean().default(false),
  rules: z.array(ruleSchema).max(30, "At most 30 rules per record type").default([]),
}).superRefine((e, ctx) => {
  const known = new Set(e.fields.filter(isData).map((f) => f.key));
  e.rules.forEach((r, i) => {
    const problem = checkFormula(r.check, known);
    if (problem) ctx.addIssue({ code: "custom", path: ["rules", i], message: `${e.name}, rule "${r.message}": ${problem}` });
  });
});

/** The stored columns of a record type, from the builder's input. */
const entityData = (e: z.infer<typeof entityInput>, sortOrder: number) => ({
  name: e.name,
  slug: e.slug,
  sortOrder,
  fields: JSON.stringify(e.fields),
  formLayout: e.formLayout,
  approval: e.approval,
  rules: JSON.stringify(e.rules),
});

const moduleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  slug: slug("URL name").optional(),
  description: z.string().trim().max(500).default(""),
  // "" = own menu, or a built-in module id such as "inventory".
  menu: z
    .string()
    .default("")
    .refine((v) => v === "" || MENU_HOSTS.some((m) => m.value === v), "Choose a menu from the list"),
  // How the record types appear inside that menu: under the module name, a shared submenu name, or directly.
  menuLayout: z.enum(["module", "named", "flat"]).default("module"),
  menuGroup: z.string().trim().max(60, "At most 60 characters").default(""),
  isActive: checkbox,
  entities: z
    .string()
    .transform((json, ctx) => {
      try {
        return JSON.parse(json) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "The record types could not be read. Reload and try again." });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(entityInput)
        .min(1, "Add at least one record type")
        .max(20, "At most 20 record types per module")
        .superRefine((entities, ctx) => {
          const seen = new Set<string>();
          for (const e of entities) {
            if (seen.has(e.slug)) ctx.addIssue({ code: "custom", message: `Two record types share the URL name "${e.slug}"` });
            seen.add(e.slug);
          }
        }),
    ),
});

/** Record types with an Auto number field get a number series (editable under Setup → Document numbering). */
async function syncSeries(tx: Prisma.TransactionClient, moduleName: string, entities: CustomEntity[]) {
  for (const e of entities) {
    const docType = customSeriesType(e.id);
    const name = `${moduleName} / ${e.name}`;
    if (parseFields(e.fields).some((f) => f.type === "autonumber")) {
      await ensureSeries(tx, docType, customSeriesDefaults(name, e.slug));
      await tx.documentSeries.update({ where: { docType }, data: { name } });
    }
  }
}

export async function saveModule(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePermission(ADMIN.modulesManage);
  const parsed = moduleSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { entities, slug: moduleSlug, menuLayout, ...rest } = parsed.data;
  if (rest.menu && menuLayout === "named" && !rest.menuGroup)
    return { fieldErrors: { menuGroup: ["Enter the submenu name"] } };
  const fields = {
    ...rest,
    menuFlat: !!rest.menu && menuLayout === "flat",
    menuGroup: rest.menu && menuLayout === "named" ? rest.menuGroup : "",
  };
  if (!id && !moduleSlug) return { fieldErrors: { slug: ["URL name is required"] } };

  let moduleId = id;
  try {
    const error = await db.$transaction(async (tx) => {
      const include = { entities: { orderBy: { sortOrder: "asc" as const } } };

      if (!id) {
        const created = await tx.customModule.create({
          data: {
            ...fields,
            slug: moduleSlug!,
            entities: {
              create: entities.map((e, i) => entityData(e, i)),
            },
          },
          include,
        });
        moduleId = created.id;
        await syncSeries(tx, created.name, created.entities);
        await audit({ userId: me.id, action: "create", entity: "CustomModule", entityId: created.id, after: created }, tx);
        return null;
      }

      // The slug is part of URLs and permission keys, so it is never changed here.
      const before = await tx.customModule.findUniqueOrThrow({ where: { id }, include });
      const keep = new Set(entities.map((e) => e.id).filter(Boolean));
      const removed = before.entities.filter((e) => !keep.has(e.id));
      const withRecords = await tx.customEntity.findFirst({
        where: { id: { in: removed.map((e) => e.id) }, records: { some: {} } },
        include: { _count: { select: { records: true } } },
      });
      if (withRecords)
        return `"${withRecords.name}" still has ${withRecords._count.records} record(s). Delete them before removing it.`;

      await tx.customEntity.deleteMany({ where: { id: { in: removed.map((e) => e.id) } } });
      await tx.documentSeries.deleteMany({ where: { docType: { in: removed.map((e) => customSeriesType(e.id)) } } });
      // Park existing slugs first so renaming/swapping them cannot trip the unique index mid-way.
      for (const e of before.entities.filter((e) => keep.has(e.id)))
        await tx.customEntity.update({ where: { id: e.id }, data: { slug: `~${e.id}` } });
      for (const [i, e] of entities.entries()) {
        const data = entityData(e, i);
        if (e.id && before.entities.some((b) => b.id === e.id)) await tx.customEntity.update({ where: { id: e.id }, data });
        else await tx.customEntity.create({ data: { ...data, moduleId: id } });
      }
      const after = await tx.customModule.update({ where: { id }, data: fields, include });
      await syncSeries(tx, after.name, after.entities);
      await audit({ userId: me.id, action: "update", entity: "CustomModule", entityId: id, before, after }, tx);
      return null;
    });
    if (error) return { error };
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { slug: ["Another module already uses this URL name"] } };
    throw e;
  }

  revalidatePath("/", "layout");
  redirect(`/admin/modules/${moduleId}`);
}

/** Deletes empty modules. All or nothing: if any still has records, none are deleted. */
export async function deleteModules(ids: string[]): Promise<ActionState> {
  const me = await requirePermission(ADMIN.modulesManage);

  const error = await db.$transaction(async (tx) => {
    for (const id of ids) {
      const before = await tx.customModule.findUniqueOrThrow({ where: { id }, include: { entities: true } });
      const records = await tx.customRecord.count({ where: { entity: { moduleId: id } } });
      if (records > 0)
        return `"${before.name}" still has ${records} record(s). Deactivate it instead, or delete the records first.`;

      await tx.documentSeries.deleteMany({
        where: { docType: { in: before.entities.map((e) => customSeriesType(e.id)) } },
      });
      await tx.customModule.delete({ where: { id } });
      // Its permissions no longer exist, so take them off every role.
      await tx.rolePermission.deleteMany({ where: { permission: { startsWith: `custom.${before.slug}.` } } });
      await audit({ userId: me.id, action: "delete", entity: "CustomModule", entityId: id, before }, tx);
    }
    return null;
  });
  if (error) return { error };

  revalidatePath("/", "layout");
  return undefined;
}

export async function deleteModule(id: string): Promise<ActionState> {
  const result = await deleteModules([id]);
  if (result?.error) return result;
  redirect("/admin/modules");
}

// ─────────────── Records ───────────────

/** Loads an active module's record type and checks the user may manage its records. */
async function loadForManage(entityId: string) {
  const entity = await db.customEntity.findUnique({ where: { id: entityId }, include: { module: true } });
  if (!entity?.module.isActive) redirect("/forbidden");
  const user = await requirePermission(customPermission(entity.module.slug, "manage"));
  return { user, entity, auditName: `${entity.module.name} / ${entity.name}` };
}

export async function saveRecord(
  entityId: string,
  id: string | null,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, entity, auditName } = await loadForManage(entityId);
  const fields = parseFields(entity.fields);
  // Locked fields are only filled in on a new record; when editing they keep their stored value.
  const locked = new Set(id ? fields.filter((f) => f.locked).map((f) => f.key) : []);
  const before = id ? await db.customRecord.findFirst({ where: { id, entityId } }) : null;
  if (id && !before) return { error: "This record no longer exists." };
  const beforeData = before ? parseData(before.data) : {};

  // "Show only when" conditions are judged on the record as it will be: stored values (locked fields
  // are not sent) overlaid with what was submitted. Unticked boxes are absent from the form, hence false.
  const input = formObject(formData);
  const seen: Record<string, RecordData[string]> = { ...beforeData, ...input };
  for (const f of fields) if (f.type === "checkbox" && !locked.has(f.key)) seen[f.key] = f.key in input;
  const shown = (f: CustomField) => conditionMet(f, fields, (k) => seen[k]);
  const parsed = recordSchema(fields, locked, seen).safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const values: RecordData = { ...parsed.data };
  const badLookups = await resolveLookups(fields, values, undefined, { ...beforeData, ...values });
  if (badLookups) return { error: "Please fix the highlighted fields.", fieldErrors: badLookups };
  // Calculated fields are always worked out here, never taken from the form.
  const computed = computeFormulas(fields, { ...beforeData, ...values });
  for (const f of fields) if (f.type === "formula") values[f.key] = computed[f.key];
  const broken = brokenRules(parseRules(entity.rules), fields, { ...beforeData, ...values });
  if (broken.length) return { error: broken.join(" ") };
  const lines = await prepareLines(user, entityId, formData);
  if ("error" in lines) return { error: lines.error };
  // Maker-checker: with approval on, every new or changed record waits for someone else to approve it.
  const status = entity.approval ? "PENDING" : (before?.status ?? "");

  // File fields: a newly chosen file replaces the field's value (the old file stays under Attachments).
  const uploads = fields
    .filter((f) => f.type === "file" && !locked.has(f.key) && shown(f))
    .map((field) => ({ field, file: formData.get(field.key) }))
    .filter((u): u is { field: CustomField; file: File } => u.file instanceof File && u.file.size > 0);
  const tooBig = uploads.find((u) => u.file.size > MAX_FILE_BYTES);
  if (tooBig) return { fieldErrors: { [tooBig.field.key]: [`"${tooBig.file.name}" is larger than 10 MB`] } };
  const noFile = fields.find(
    (f) => f.type === "file" && f.required && shown(f) && !uploads.some((u) => u.field === f) && !fileValue(beforeData[f.key]),
  );
  if (noFile) return { fieldErrors: { [noFile.key]: [`${noFile.label} is required`] } };
  const stored = await Promise.all(
    uploads.map(async (u) => ({ ...u, storageKey: await saveFile(Buffer.from(await u.file.arrayBuffer())) })),
  );

  let recordId = id;
  let removeLineFiles: () => Promise<unknown> = async () => {};
  try {
    const dupes = await db.$transaction(async (tx) => {
      const dupes = await uniqueErrors(tx, entityId, fields, values, id);
      if (dupes) return dupes;

      // Keep values of fields that were removed from the record type since; re-adding the field brings them back.
      const data: RecordData = { ...beforeData, ...values };
      if (!id) {
        const auto = fields.find((f) => f.type === "autonumber");
        if (auto) {
          data[auto.key] = await nextNumber(tx, customSeriesType(entityId), {
            defaults: customSeriesDefaults(`${entity.module.name} / ${entity.name}`, entity.slug),
          });
        }
        recordId = (await tx.customRecord.create({ data: { entityId, data: "{}", createdById: user.id, status } })).id;
      }
      for (const { field, file, storageKey } of stored) {
        const attachment = await tx.attachment.create({
          data: {
            entity: "CustomRecord",
            entityId: recordId!,
            fileName: file.name.slice(0, 255) || "file",
            contentType: (file.type || "application/octet-stream").slice(0, 100),
            size: file.size,
            storageKey,
            uploadedById: user.id,
          },
        });
        data[field.key] = `${attachment.id}/${attachment.fileName}`;
      }
      await tx.customRecord.update({
        where: { id: recordId! },
        data: { data: JSON.stringify(data), status, ...(status === "PENDING" && { decidedById: null, decidedAt: null, decisionNote: "" }) },
      });
      await audit(
        id
          ? { userId: user.id, action: "update", entity: auditName, entityId: id, before: beforeData, after: data }
          : { userId: user.id, action: "create", entity: auditName, entityId: recordId, after: data },
        tx,
      );
      const written = await writeLines(tx, user.id, recordId!, lines.prepared);
      // Throwing rolls the whole save back, parent included.
      if ("error" in written) throw new LineError(written.error);
      removeLineFiles = written.removeFiles;
      return null;
    });
    if (dupes) {
      await Promise.all(stored.map((s) => removeFile(s.storageKey)));
      return { error: "Please fix the highlighted fields.", fieldErrors: dupes };
    }
  } catch (e) {
    await Promise.all(stored.map((s) => removeFile(s.storageKey)));
    if (e instanceof LineError) return { error: e.message };
    throw e;
  }
  await removeLineFiles();

  const base = `/m/${entity.module.slug}/${entity.slug}`;
  revalidatePath("/m", "layout");
  redirect(`${base}/${recordId}`);
}

export async function deleteRecords(entityId: string, ids: string[]): Promise<ActionState> {
  const { user, entity, auditName } = await loadForManage(entityId);

  const removeFiles = await db.$transaction(async (tx) => {
    for (const id of ids) {
      const before = await tx.customRecord.findFirstOrThrow({ where: { id, entityId } });
      await tx.customRecord.delete({ where: { id } });
      await audit({ userId: user.id, action: "delete", entity: auditName, entityId: id, before: parseData(before.data) }, tx);
    }
    return deleteAttachmentsOf(tx, "CustomRecord", ids);
  });
  await removeFiles();

  revalidatePath(`/m/${entity.module.slug}/${entity.slug}`, "layout");
  return undefined;
}

export async function deleteRecord(entityId: string, id: string): Promise<ActionState> {
  const { entity } = await loadForManage(entityId);
  await deleteRecords(entityId, [id]);
  redirect(`/m/${entity.module.slug}/${entity.slug}`);
}

// ─────────────── Approvals ───────────────

/**
 * Approves or rejects a record of a record type with approval switched on. Maker-checker: whoever
 * saved the record last cannot decide on it, so every approved record was seen by two people.
 */
export async function decideRecord(
  entityId: string,
  id: string,
  decision: "APPROVED" | "REJECTED",
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entity = await db.customEntity.findUnique({ where: { id: entityId }, include: { module: true } });
  if (!entity?.module.isActive || !entity.approval) redirect("/forbidden");
  const user = await requirePermission(customPermission(entity.module.slug, "approve"));
  const auditName = `${entity.module.name} / ${entity.name}`;
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (decision === "REJECTED" && !note) return { fieldErrors: { note: ["Say why it is rejected"] } };

  const error = await db.$transaction(async (tx) => {
    const record = await tx.customRecord.findFirst({ where: { id, entityId } });
    if (!record) return "This record no longer exists.";
    if (record.status !== "PENDING") return "This record is not waiting for approval any more.";
    const lastSave = await tx.auditLog.findFirst({
      where: { entity: auditName, entityId: id, action: { in: ["create", "update", "import"] } },
      orderBy: { seq: "desc" },
      select: { userId: true },
    });
    if ((lastSave?.userId ?? record.createdById) === user.id)
      return "You made the last change to this record, so someone else has to approve or reject it.";
    await tx.customRecord.update({
      where: { id },
      data: { status: decision, decidedById: user.id, decidedAt: new Date(), decisionNote: note },
    });
    await audit(
      { userId: user.id, action: decision === "APPROVED" ? "approve" : "reject", entity: auditName, entityId: id, after: { note } },
      tx,
    );
    return null;
  });
  if (error) return { error };

  revalidatePath("/m", "layout");
  return { ok: decision === "APPROVED" ? "Approved." : "Rejected." };
}
