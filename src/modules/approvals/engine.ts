import "server-only";
import { Prisma } from "@prisma/client";
import { audit } from "@/core/audit";
import type { CurrentUser } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatMoney } from "@/core/format";
import { fromZod, type ActionState } from "@/core/forms";
import { nextNumber } from "@/core/numbering";
import { PostingError, runPosting } from "@/core/posting";
import { getSettings } from "@/core/settings";
import { P as ADMIN } from "@/modules/admin/module";
import { KINDS, type Facts, type Raw } from "./kinds";
import { P, triggerOf, type Trigger } from "./module";

// The approval engine. Actions call submit() instead of posting directly: with no matching rule the document
// is posted at once, otherwise it waits as a request. decide() records approvals in order and posts the
// document after the last one, in the same transaction, so an approval that cannot be posted is not recorded.

type Tx = Prisma.TransactionClient;
type Scope = { mayUse: (branchId: string) => boolean };

/** Kinds of request, by which triggers apply to them. */
const KIND_TRIGGERS: Record<string, Trigger[]> = {
  PurchaseOrder: ["PO_AMOUNT"],
  SupplierPayment: ["SUPPLIER_PAYMENT_AMOUNT"],
  CashOut: ["CASH_OUT_AMOUNT"],
  ManualJournal: ["MANUAL_JOURNAL"],
  JournalReversal: ["MANUAL_JOURNAL"],
  InvoiceVoid: ["INVOICE_VOID"],
  BillVoid: ["BILL_VOID"],
  SalesInvoice: ["SALE_BELOW_COST", "SALE_DISCOUNT", "CREDIT_LIMIT"],
};

type RuleWithLevels = Prisma.ApprovalRuleGetPayload<{ include: { levels: { include: { role: true } } } }>;

/** Why a rule applies, in words, or null when it does not. */
function matchRule(rule: RuleWithLevels, facts: Facts, currency: string): string | null {
  const t = triggerOf(rule.trigger);
  const fact = facts[rule.trigger as Trigger];
  if (!t || fact === undefined || rule.levels.length === 0) return null;
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  if (t.unit === "amount") {
    const v = fact as Prisma.Decimal;
    if (v.lessThan(rule.threshold)) return null;
    return rule.threshold.isZero() ? `${t.label} (${money(v)})` : `${t.label} ${money(v)} is at least ${money(rule.threshold)}`;
  }
  if (t.unit === "percent") {
    const v = fact as number;
    return v > Number(rule.threshold) ? `${t.label}: up to ${v}% below list price (limit ${rule.threshold.toString()}%)` : null;
  }
  return fact === true ? t.label : null;
}

/** Branches a user may work in (the same rule as the branch picker), for posting on their behalf. */
async function branchAccess(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { branches: true, roles: { include: { role: { include: { permissions: true } } } } },
  });
  const perms = new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission)));
  if (perms.has("*") || perms.has(ADMIN.branchesAll)) return { mayUse: () => true, perms };
  const ids = new Set(user.branches.map((b) => b.branchId));
  return { mayUse: (b: string) => ids.has(b), perms };
}

export type SubmitResult = { state: ActionState } | { redirect: string; posted: boolean };

/**
 * Posts the document, or files it for approval when an active rule matches. The raw form is kept so it can
 * be validated and posted again, exactly as submitted, after the last approval.
 */
export async function submit(kind: string, raw: Raw, user: CurrentUser, scope: Scope): Promise<SubmitResult> {
  const def = KINDS[kind];
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) return { state: fromZod(parsed.error) };
  const settings = await getSettings();
  let described;
  try {
    described = await def.describe(parsed.data as never, settings["company.currency"]);
  } catch (e) {
    if (e instanceof PostingError) return { state: { error: e.message } };
    throw e;
  }
  if (!scope.mayUse(described.branchId)) return { state: { error: "That belongs to a branch you cannot use." } };

  const rules = await db.approvalRule.findMany({
    where: { isActive: true, trigger: { in: KIND_TRIGGERS[kind] } },
    include: { levels: { orderBy: { level: "asc" }, include: { role: true } } },
    orderBy: [{ threshold: "asc" }, { createdAt: "asc" }],
  });
  const matched = rules.flatMap((r) => {
    const why = matchRule(r, described.facts, settings["company.currency"]);
    return why ? [{ rule: r, why }] : [];
  });

  if (matched.length === 0) {
    const result = await runPosting((tx) => def.execute(tx, user.id, parsed.data as never, scope.mayUse));
    if ("error" in result) return { state: { error: result.error } };
    return { redirect: result.value.href, posted: true };
  }

  if (described.targetId) {
    const waiting = await db.approvalRequest.findFirst({ where: { kind, targetId: described.targetId, status: "PENDING" } });
    if (waiting) return { state: { error: `This is already waiting for approval (${waiting.number}).` } };
  }

  // Steps in order: every matched rule's levels, a role only once.
  const steps: { roleId: string; roleName: string; ruleName: string }[] = [];
  for (const { rule } of matched)
    for (const l of rule.levels) if (!steps.some((s) => s.roleId === l.roleId)) steps.push({ roleId: l.roleId, roleName: l.role.name, ruleName: rule.name });

  const result = await runPosting(async (tx) => {
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: described.branchId } });
    const number = await nextNumber(tx, "ApprovalRequest", { branchCode: branch.code, date: new Date() });
    const request = await tx.approvalRequest.create({
      data: {
        number,
        kind,
        targetId: described.targetId ?? null,
        branchId: described.branchId,
        amount: described.amount,
        title: described.title,
        details: JSON.stringify(described.details),
        reasons: JSON.stringify(matched.map((m) => `${m.rule.name}: ${m.why}`)),
        payload: JSON.stringify(raw),
        requestedById: user.id,
        steps: { create: steps.map((s, i) => ({ level: i + 1, ...s })) },
      },
    });
    await audit({ userId: user.id, action: "submit", entity: "ApprovalRequest", entityId: request.id, after: request }, tx);
    return request;
  });
  if ("error" in result) return { state: { error: result.error } };
  return { redirect: `/approvals/${result.value.id}?sent=1`, posted: false };
}

async function lockRequest(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT 1 FROM "ApprovalRequest" WHERE "id" = ${id} FOR UPDATE`;
  const request = await tx.approvalRequest.findUnique({ where: { id }, include: { steps: { orderBy: { level: "asc" } } } });
  if (!request) throw new PostingError("That approval request does not exist.");
  if (request.status !== "PENDING") throw new PostingError("This request has already been decided.");
  return request;
}

/** Why this user may not decide the request's current step, or null if they may. */
export async function cannotDecide(
  request: { requestedById: string; step: number; branchId: string; status: string; steps: { level: number; roleId: string; deciderId: string | null }[] },
  user: CurrentUser,
  scope: Scope,
) {
  if (request.status !== "PENDING") return "This request has already been decided.";
  if (request.requestedById === user.id) return "You asked for this approval, so someone else must decide it.";
  if (!scope.mayUse(request.branchId)) return "This request belongs to a branch you cannot use.";
  if (request.steps.some((s) => s.deciderId === user.id)) return "You already approved an earlier step; another person must approve this one.";
  const step = request.steps.find((s) => s.level === request.step);
  if (!step) return "This request has no step waiting.";
  const holds = await db.userRole.findUnique({ where: { userId_roleId: { userId: user.id, roleId: step.roleId } } });
  return holds ? null : "This step waits for someone with another role.";
}

/** Approves or rejects the current step. The last approval posts the document as the requester. */
export async function decide(id: string, user: CurrentUser, scope: Scope, decision: "APPROVE" | "REJECT", reason: string): Promise<ActionState> {
  if (decision === "REJECT" && !reason.trim()) return { fieldErrors: { reason: ["Say why it is rejected"] } };
  const result = await runPosting(async (tx) => {
    const request = await lockRequest(tx, id);
    const why = await cannotDecide(request, user, scope);
    if (why) throw new PostingError(why);
    const step = request.steps.find((s) => s.level === request.step)!;
    const now = new Date();
    await tx.approvalStep.update({
      where: { id: step.id },
      data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", deciderId: user.id, decidedAt: now, reason: reason.trim() },
    });

    if (decision === "REJECT") {
      const after = await tx.approvalRequest.update({ where: { id }, data: { status: "REJECTED", decidedAt: now } });
      await audit({ userId: user.id, action: "reject", entity: "ApprovalRequest", entityId: id, before: request, after }, tx);
      return `${request.number} is rejected; nothing was posted.`;
    }
    const last = request.step >= request.steps.length;
    if (!last) {
      const after = await tx.approvalRequest.update({ where: { id }, data: { step: request.step + 1 } });
      await audit({ userId: user.id, action: "approve", entity: "ApprovalRequest", entityId: id, before: request, after }, tx);
      return `Step ${request.step} approved. It now waits for ${request.steps[request.step].roleName}.`;
    }

    // Last approval: post the document exactly as it was submitted, on behalf of the requester.
    const def = KINDS[request.kind];
    const input = def.schema.parse(JSON.parse(request.payload));
    const requester = await branchAccess(request.requestedById);
    if (!requester.perms.has("*") && !requester.perms.has(def.permission))
      throw new PostingError("The person who asked no longer has the permission to post this; it cannot be approved.");
    const posted = await def.execute(tx, request.requestedById, input as never, requester.mayUse);
    const after = await tx.approvalRequest.update({
      where: { id },
      data: { status: "APPROVED", decidedAt: now, resultId: posted.id, resultNumber: posted.number, resultHref: posted.href },
    });
    await audit({ userId: user.id, action: "approve", entity: "ApprovalRequest", entityId: id, before: request, after }, tx);
    return `Approved and posted as ${posted.number}.`;
  });
  if ("error" in result) return { error: result.error };
  return { ok: result.value };
}

/** The requester takes a waiting request back; nothing is posted. */
export async function withdraw(id: string, user: CurrentUser): Promise<ActionState> {
  const result = await runPosting(async (tx) => {
    const request = await lockRequest(tx, id);
    if (request.requestedById !== user.id) throw new PostingError("Only the person who asked can withdraw a request.");
    const after = await tx.approvalRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } });
    await audit({ userId: user.id, action: "withdraw", entity: "ApprovalRequest", entityId: id, before: request, after }, tx);
    return request.number;
  });
  if ("error" in result) return { error: result.error };
  return { ok: `${result.value} is withdrawn; nothing was posted.` };
}

/** Requests whose current step this user can decide now. */
export async function waitingFor(user: CurrentUser, branchIds: string[]) {
  const roleIds = (await db.userRole.findMany({ where: { userId: user.id }, select: { roleId: true } })).map((r) => r.roleId);
  if (roleIds.length === 0) return [];
  const pending = await db.approvalRequest.findMany({
    where: { status: "PENDING", branchId: { in: branchIds }, requestedById: { not: user.id }, steps: { some: { roleId: { in: roleIds }, status: "WAITING" } } },
    include: { steps: { orderBy: { level: "asc" } }, requestedBy: { select: { name: true } }, branch: true },
    orderBy: { requestedAt: "asc" },
  });
  return pending.filter((r) => {
    const step = r.steps.find((s) => s.level === r.step);
    return step && roleIds.includes(step.roleId) && !r.steps.some((s) => s.deciderId === user.id);
  });
}

/** Whether this user may open a request: they asked, they are in its chain, or they may see every request. */
export async function mayView(request: { requestedById: string; branchId: string; steps: { roleId: string }[] }, user: CurrentUser, scope: Scope) {
  if (request.requestedById === user.id) return true;
  if (!scope.mayUse(request.branchId)) return false;
  if (user.permissions.has("*") || user.permissions.has(P.view)) return true;
  const roles = await db.userRole.findMany({ where: { userId: user.id, roleId: { in: request.steps.map((s) => s.roleId) } } });
  return roles.length > 0;
}

/** Requests that created or act on a document, for its approval trail. */
export function trailFor(documentId: string) {
  return db.approvalRequest.findMany({
    where: { OR: [{ resultId: documentId }, { targetId: documentId }] },
    include: { steps: { orderBy: { level: "asc" }, include: { decider: { select: { name: true } } } }, requestedBy: { select: { name: true } } },
    orderBy: { requestedAt: "asc" },
  });
}

