"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/core/audit";
import { can, requirePermission } from "@/core/auth/guard";
import { hashPassword } from "@/core/auth/password";
import { db } from "@/core/db";
import { checkbox, formObject, fromZod, stringList, type ActionState } from "@/core/forms";
import { getAllPermissions } from "@/modules/registry";
import { tinString } from "@/modules/sales/schemas";
import { P } from "./module";

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ─────────────── Users ───────────────

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().min(8, "At least 8 characters").optional()),
  isActive: checkbox,
  roleIds: stringList,
  branchIds: stringList,
});

export async function saveUser(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePermission(P.usersManage);
  const parsed = userSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { password, ...fields } = parsed.data;
  // Assigning roles is a role-management power; without it, role assignments are left untouched.
  const canAssignRoles = can(me, P.rolesManage);
  const { roleIds, branchIds, ...rest } = fields;
  const knownBranches = await db.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true } });

  if (!id && !password) return { fieldErrors: { password: ["Set a password for the new user"] } };
  if (id === me.id && !fields.isActive) return { fieldErrors: { isActive: ["You cannot deactivate yourself"] } };

  let userId = id;
  try {
    await db.$transaction(async (tx) => {
      const data = { ...rest, ...(password && { passwordHash: await hashPassword(password) }) };
      const roles = canAssignRoles ? { create: roleIds.map((roleId) => ({ roleId })) } : undefined;
      const branches = { create: knownBranches.map((b) => ({ branchId: b.id })) };
      // Never write the password hash into the audit log.
      const safe = {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          roles: { select: { roleId: true } },
          branches: { select: { branchId: true } },
        },
      };

      if (id) {
        const before = await tx.user.findUniqueOrThrow({ where: { id }, ...safe });
        if (canAssignRoles) await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userBranch.deleteMany({ where: { userId: id } });
        const after = await tx.user.update({ where: { id }, data: { ...data, roles, branches }, ...safe });
        await audit(
          {
            userId: me.id,
            action: "update",
            entity: "User",
            entityId: id,
            before,
            after: { ...after, passwordChanged: !!password },
          },
          tx,
        );
        // A deactivated user is signed out everywhere.
        if (!fields.isActive) await tx.session.deleteMany({ where: { userId: id } });
      } else {
        const created = await tx.user.create({
          data: { ...data, passwordHash: data.passwordHash!, roles, branches },
          ...safe,
        });
        userId = created.id;
        await audit({ userId: me.id, action: "create", entity: "User", entityId: created.id, after: created }, tx);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { email: ["This email is already used"] } };
    throw e;
  }

  revalidatePath("/admin/users");
  redirect(`/admin/users/${userId}`);
}

// ─────────────── Roles ───────────────

const roleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(500).default(""),
  permissions: stringList,
});

export async function saveRole(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePermission(P.rolesManage);
  const parsed = roleSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  // Only keep permission keys some installed module actually defines.
  const known = new Set(await getAllPermissions());
  const { permissions: requested, ...fields } = parsed.data;
  const permissions = requested.filter((p) => known.has(p));

  let roleId = id;
  try {
    const error = await db.$transaction(async (tx) => {
      const include = { permissions: { select: { permission: true } } };
      if (id) {
        const before = await tx.role.findUniqueOrThrow({ where: { id }, include });
        if (before.isSystem) return "System roles cannot be changed.";
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        const after = await tx.role.update({
          where: { id },
          data: { ...fields, permissions: { create: permissions.map((permission) => ({ permission })) } },
          include,
        });
        await audit({ userId: me.id, action: "update", entity: "Role", entityId: id, before, after }, tx);
      } else {
        const created = await tx.role.create({
          data: { ...fields, permissions: { create: permissions.map((permission) => ({ permission })) } },
          include,
        });
        roleId = created.id;
        await audit({ userId: me.id, action: "create", entity: "Role", entityId: created.id, after: created }, tx);
      }
      return null;
    });
    if (error) return { error };
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: ["A role with this name exists"] } };
    throw e;
  }

  revalidatePath("/", "layout");
  redirect(`/admin/roles/${roleId}`);
}

/**
 * Deletes roles nobody uses. All or nothing: if any selected role is the system role or is still
 * assigned to someone, nothing is deleted, so a delete can never silently take access away.
 */
export async function deleteRoles(ids: string[]): Promise<ActionState> {
  const me = await requirePermission(P.rolesManage);

  const error = await db.$transaction(async (tx) => {
    const roles = await tx.role.findMany({
      where: { id: { in: ids } },
      include: { permissions: { select: { permission: true } }, _count: { select: { users: true } } },
    });
    const system = roles.find((r) => r.isSystem);
    if (system) return `"${system.name}" is the system role and cannot be deleted.`;
    const inUse = roles.filter((r) => r._count.users > 0);
    if (inUse.length)
      return inUse
        .map((r) => `"${r.name}" is assigned to ${r._count.users} user(s).`)
        .concat("Remove the role from those users first, then delete it.")
        .join(" ");

    for (const r of roles) {
      await tx.role.delete({ where: { id: r.id } });
      // The full role, with its permissions, so it can be recreated from the audit log if needed.
      const before = { name: r.name, description: r.description, createdAt: r.createdAt, permissions: r.permissions };
      await audit({ userId: me.id, action: "delete", entity: "Role", entityId: r.id, before }, tx);
    }
    return null;
  });
  if (error) return { error };

  revalidatePath("/", "layout");
  return undefined;
}

export async function deleteRole(id: string): Promise<ActionState> {
  const result = await deleteRoles([id]);
  if (result?.error) return result;
  redirect("/admin/roles");
}

// ─────────────── Branches ───────────────

const branchSchema = z.object({
  // The code is part of document numbers, so it is only set when the branch is created.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, "Use 1–10 letters or digits, e.g. MNL")
    .optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  address: z.string().trim().max(500).default(""),
  isActive: checkbox,
});

export async function saveBranch(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePermission(P.branchesManage);
  const parsed = branchSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { code, ...fields } = parsed.data;
  if (!id && !code) return { fieldErrors: { code: ["Code is required"] } };

  try {
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.branch.findUniqueOrThrow({ where: { id } });
        const after = await tx.branch.update({ where: { id }, data: fields });
        await audit({ userId: me.id, action: "update", entity: "Branch", entityId: id, before, after }, tx);
      } else {
        // The creator can work in the new branch straight away.
        const created = await tx.branch.create({
          data: { ...fields, code: code!, users: { create: { userId: me.id } } },
        });
        await audit({ userId: me.id, action: "create", entity: "Branch", entityId: created.id, after: created }, tx);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["Another branch already uses this code"] } };
    throw e;
  }

  revalidatePath("/", "layout");
  redirect("/admin/branches");
}

// ─────────────── Document numbering ───────────────

const seriesSchema = z.object({
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/, "Use 1–10 letters or digits, e.g. PO"),
  padding: z.coerce.number().int().min(3, "At least 3 digits").max(10, "At most 10 digits"),
  perBranch: checkbox,
  yearly: checkbox,
});

export async function saveSeries(docType: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePermission(P.numberingManage);
  const parsed = seriesSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  // Admin-built records have no branch, so their series cannot be per branch.
  const data = { ...parsed.data, perBranch: docType.startsWith("custom:") ? false : parsed.data.perBranch };

  await db.$transaction(async (tx) => {
    const before = await tx.documentSeries.findUniqueOrThrow({ where: { docType } });
    const after = await tx.documentSeries.update({ where: { docType }, data });
    await audit({ userId: me.id, action: "update", entity: "DocumentSeries", entityId: docType, before, after }, tx);
  });

  revalidatePath("/admin/numbering");
  return { ok: "Numbering saved. New documents use the new format; existing numbers do not change." };
}

// ─────────────── Settings ───────────────
// The system name ("app.name") is part of the brand and is edited under Setup → Branding.

const settingsSchema = z.object({
  "company.name": z.string().trim().min(1, "Company name is required").max(200),
  "company.currency": z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. PHP"),
  "company.address": z.string().trim().max(500).default(""),
  "company.tin": tinString.default(""),
  "company.rdo": z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{3}[A-Z]?$/.test(v), "RDO code is 3 digits, e.g. 050")
    .default(""),
  "company.phone": z.string().trim().max(50).default(""),
  "company.email": z.string().trim().max(200).default(""),
});

export async function saveSettings(_state: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePermission(P.settingsManage);
  const parsed = settingsSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  await db.$transaction(async (tx) => {
    const before = Object.fromEntries((await tx.setting.findMany()).map((s) => [s.key, s.value]));
    for (const [key, value] of Object.entries(parsed.data)) {
      await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    await audit({ userId: me.id, action: "update", entity: "Setting", before, after: parsed.data }, tx);
  });

  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}
