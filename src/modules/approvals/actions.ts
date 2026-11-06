"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/core/audit";
import { requirePermission, requireUser } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { checkbox, decimalString, formObject, fromZod, type ActionState } from "@/core/forms";
import { decide, withdraw } from "./engine";
import { P, TRIGGERS } from "./module";

// ─────────────── Deciding ───────────────

export async function approveRequest(id: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await decide(id, user, await getBranchScope(), "APPROVE", String(formData.get("reason") ?? ""));
  revalidatePath("/", "layout");
  return result;
}

export async function rejectRequest(id: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const result = await decide(id, user, await getBranchScope(), "REJECT", String(formData.get("reason") ?? ""));
  revalidatePath("/", "layout");
  return result;
}

export async function withdrawRequest(id: string): Promise<ActionState> {
  const user = await requireUser();
  const result = await withdraw(id, user);
  revalidatePath("/", "layout");
  return result;
}

// ─────────────── Rules ───────────────

const ruleSchema = z.object({
  name: z.string().trim().min(1, "Give the rule a name").max(100),
  trigger: z.enum(TRIGGERS.map((t) => t.value) as [string, ...string[]]),
  threshold: z
    .string()
    .trim()
    .default("")
    .transform((v) => v || "0")
    .pipe(decimalString("Limit"))
    .refine((v) => !new Prisma.Decimal(v).isNegative(), "The limit cannot be negative"),
  isActive: checkbox,
  level1: z.string().min(1, "Choose who approves first"),
  level2: z.string().default(""),
  level3: z.string().default(""),
  level4: z.string().default(""),
});

export async function saveRule(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.rulesManage);
  const parsed = ruleSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { level1, level2, level3, level4, ...rule } = parsed.data;
  const roles = [level1, level2, level3, level4].filter(Boolean);
  if (new Set(roles).size !== roles.length) return { fieldErrors: { level2: ["Each level needs a different role"] } };
  const known = await db.role.count({ where: { id: { in: roles } } });
  if (known !== roles.length) return { error: "One of the roles no longer exists." };

  let ruleId = id;
  await db.$transaction(async (tx) => {
    const data = { ...rule, threshold: new Prisma.Decimal(rule.threshold) };
    const levels = { create: roles.map((roleId, i) => ({ level: i + 1, roleId })) };
    if (id) {
      const before = await tx.approvalRule.findUniqueOrThrow({ where: { id }, include: { levels: true } });
      await tx.approvalRuleLevel.deleteMany({ where: { ruleId: id } });
      const after = await tx.approvalRule.update({ where: { id }, data: { ...data, levels }, include: { levels: true } });
      await audit({ userId: user.id, action: "update", entity: "ApprovalRule", entityId: id, before, after }, tx);
    } else {
      const created = await tx.approvalRule.create({ data: { ...data, levels }, include: { levels: true } });
      ruleId = created.id;
      await audit({ userId: user.id, action: "create", entity: "ApprovalRule", entityId: created.id, after: created }, tx);
    }
  });
  revalidatePath("/approvals", "layout");
  redirect(`/approvals/rules?saved=${ruleId}`);
}

/** Rules can be deleted: requests keep a copy of the steps they were given. */
export async function deleteRule(id: string): Promise<ActionState> {
  const user = await requirePermission(P.rulesManage);
  await db.$transaction(async (tx) => {
    const before = await tx.approvalRule.findUniqueOrThrow({ where: { id }, include: { levels: true } });
    await tx.approvalRule.delete({ where: { id } });
    await audit({ userId: user.id, action: "delete", entity: "ApprovalRule", entityId: id, before }, tx);
  });
  revalidatePath("/approvals", "layout");
  redirect("/approvals/rules");
}
