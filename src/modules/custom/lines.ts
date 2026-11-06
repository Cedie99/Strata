import "server-only";
import type { CustomEntity, CustomModule, Prisma } from "@prisma/client";
import { audit } from "@/core/audit";
import { can, type CurrentUser } from "@/core/auth/guard";
import { db } from "@/core/db";
import { customSeriesType, nextNumber } from "@/core/numbering";
import { deleteAttachmentsOf } from "@/modules/attachments";
import {
  brokenRules,
  computeFormulas,
  isData,
  parseData,
  parseFields,
  parseRules,
  recordSchema,
  type CustomField,
  type RecordData,
} from "./fields";
import { lookupChoices, resolveLookups, uniqueErrors } from "./lookups";
import { customPermission, customSeriesDefaults } from "./module";

// Lines: records of a child record type edited inside the parent's form, e.g. an item's U/M rows.
// A record type becomes lines of another when one of its Lookup fields to it has "Edit as lines" ticked.

/** Types a line grid can edit; other fields keep their stored values. */
export const LINE_TYPES = new Set([
  "text", "textarea", "number", "decimal", "money", "percent", "date", "datetime",
  "checkbox", "select", "lookup", "email", "phone", "url", "formula", "autonumber",
]);

export type LineGroup = {
  entity: CustomEntity & { module: CustomModule };
  fields: CustomField[];
  /** The child's lookup field that points at the parent record. */
  link: CustomField;
};

const inputName = (g: Pick<LineGroup, "entity" | "link">) => `__lines__${g.entity.id}__${g.link.key}`;

/** Record types edited as lines of `entityId`. */
export async function inlineGroups(entityId: string): Promise<LineGroup[]> {
  const entities = await db.customEntity.findMany({
    where: { module: { isActive: true } },
    include: { module: true },
    orderBy: [{ module: { name: "asc" } }, { sortOrder: "asc" }],
  });
  return entities.flatMap((entity) => {
    const fields = parseFields(entity.fields);
    return fields
      .filter((f) => f.type === "lookup" && f.inline && f.target === `custom:${entityId}`)
      .map((link) => ({ entity, fields, link }));
  });
}

/** Everything the parent form needs to show (and, with permission, edit) its line grids. */
export async function lineGridsFor(user: CurrentUser, entityId: string, recordId: string | null) {
  const groups = (await inlineGroups(entityId)).filter((g) => can(user, customPermission(g.entity.module.slug, "view")));
  return Promise.all(
    groups.map(async (g) => {
      const columns = g.fields.filter((f) => f !== g.link && isData(f) && LINE_TYPES.has(f.type));
      const rows = recordId
        ? (await db.customRecord.findMany({ where: { entityId: g.entity.id }, orderBy: { createdAt: "asc" } }))
            .map((r) => ({ id: r.id, values: parseData(r.data) }))
            .filter((r) => r.values[g.link.key] === recordId)
        : [];
      return {
        name: inputName(g),
        title: g.entity.name,
        href: `/m/${g.entity.module.slug}/${g.entity.slug}`,
        columns,
        allFields: g.fields,
        choices: await lookupChoices(columns),
        rows,
        canEdit: can(user, customPermission(g.entity.module.slug, "manage")),
      };
    }),
  );
}

export type LineGrid = Awaited<ReturnType<typeof lineGridsFor>>[number];

type PreparedLine = { id?: string; data: RecordData };
export type PreparedLines = { group: LineGroup; lines: PreparedLine[] }[];

/**
 * Reads and checks the line grids submitted with a parent form. Grids the user may not edit are
 * not sent by the form and are left alone here. Returns the first problem as a message.
 */
export async function prepareLines(
  user: CurrentUser,
  entityId: string,
  formData: FormData,
): Promise<{ error: string } | { prepared: PreparedLines }> {
  const prepared: PreparedLines = [];
  for (const group of await inlineGroups(entityId)) {
    const raw = formData.get(inputName(group));
    if (typeof raw !== "string") continue;
    if (!can(user, customPermission(group.entity.module.slug, "manage")))
      return { error: `You cannot change ${group.entity.name}.` };
    let rows: { id?: string; values: Record<string, string | boolean> }[];
    try {
      rows = JSON.parse(raw);
    } catch {
      return { error: `The ${group.entity.name} lines could not be read. Reload and try again.` };
    }
    const columns = group.fields.filter((f) => f !== group.link && LINE_TYPES.has(f.type));
    const choices = await lookupChoices(group.fields);
    const rules = parseRules(group.entity.rules);
    const lines: PreparedLine[] = [];
    for (const [i, row] of rows.entries()) {
      const where = `${group.entity.name}, line ${i + 1}`;
      // Checkboxes travel as true/false; the record schema expects them as present ("on") or absent.
      const input: Record<string, string | undefined> = {};
      for (const f of columns) {
        const v = row.values[f.key];
        input[f.key] = f.type === "checkbox" ? (v === true ? "on" : undefined) : v === undefined ? "" : String(v);
      }
      const others = new Set(group.fields.filter((f) => !columns.includes(f)).map((f) => f.key));
      const parsed = recordSchema(group.fields, others, input).safeParse(input);
      if (!parsed.success) {
        const [key, messages] = Object.entries(parsed.error.flatten().fieldErrors)[0] ?? [];
        return { error: `${where}: ${messages?.[0] ?? `check ${key}`}` };
      }
      const data: RecordData = { ...parsed.data };
      const bad = await resolveLookups(group.fields, data, choices);
      if (bad) return { error: `${where}: ${Object.values(bad)[0][0]}` };
      const computed = computeFormulas(group.fields, data);
      for (const f of group.fields) if (f.type === "formula") data[f.key] = computed[f.key];
      const broken = brokenRules(rules, group.fields, data);
      if (broken.length) return { error: `${where}: ${broken[0]}` };
      lines.push({ id: typeof row.id === "string" ? row.id : undefined, data });
    }
    prepared.push({ group, lines });
  }
  return { prepared };
}

/**
 * Makes the parent's lines match the submitted grid: updates kept lines, creates new ones and
 * deletes removed ones. Runs inside the parent's transaction; returns the files to remove afterwards.
 */
export async function writeLines(
  tx: Prisma.TransactionClient,
  userId: string,
  parentId: string,
  prepared: PreparedLines,
): Promise<{ error: string } | { removeFiles: () => Promise<unknown> }> {
  const cleanups: (() => Promise<unknown>)[] = [];
  for (const { group, lines } of prepared) {
    const { entity, fields, link } = group;
    const auditName = `${entity.module.name} / ${entity.name}`;
    const existing = (await tx.customRecord.findMany({ where: { entityId: entity.id } }))
      .map((r) => ({ ...r, values: parseData(r.data) }))
      .filter((r) => r.values[link.key] === parentId);
    const byId = new Map(existing.map((r) => [r.id, r]));
    const kept = new Set<string>();

    for (const [i, line] of lines.entries()) {
      const before = line.id ? byId.get(line.id) : undefined;
      // Fields the grid does not show keep their stored values.
      const data: RecordData = { ...(before?.values ?? {}), ...line.data, [link.key]: parentId };
      const dupes = await uniqueErrors(tx, entity.id, fields, data, before?.id);
      if (dupes) return { error: `${entity.name}, line ${i + 1}: ${Object.values(dupes)[0][0]}` };
      const status = entity.approval ? "PENDING" : (before?.status ?? "");
      if (before) {
        kept.add(before.id);
        if (JSON.stringify(before.values) === JSON.stringify(data)) continue;
        await tx.customRecord.update({ where: { id: before.id }, data: { data: JSON.stringify(data), status } });
        await audit({ userId, action: "update", entity: auditName, entityId: before.id, before: before.values, after: data }, tx);
      } else {
        const auto = fields.find((f) => f.type === "autonumber");
        if (auto)
          data[auto.key] = await nextNumber(tx, customSeriesType(entity.id), {
            defaults: customSeriesDefaults(auditName, entity.slug),
          });
        const created = await tx.customRecord.create({
          data: { entityId: entity.id, data: JSON.stringify(data), createdById: userId, status },
        });
        await audit({ userId, action: "create", entity: auditName, entityId: created.id, after: data }, tx);
      }
    }

    const removed = existing.filter((r) => !kept.has(r.id));
    for (const r of removed) {
      await tx.customRecord.delete({ where: { id: r.id } });
      await audit({ userId, action: "delete", entity: auditName, entityId: r.id, before: r.values }, tx);
    }
    if (removed.length) cleanups.push(await deleteAttachmentsOf(tx, "CustomRecord", removed.map((r) => r.id)));
  }
  return { removeFiles: () => Promise.all(cleanups.map((c) => c())) };
}
