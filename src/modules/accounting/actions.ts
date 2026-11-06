"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/core/audit";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formObject, fromZod, type ActionState } from "@/core/forms";
import { PostingError, runPosting } from "@/core/posting";
import { submit } from "@/modules/approvals/engine";
import { P } from "./module";
import { accountSchema } from "./schemas";

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ─────────────── Chart of accounts ───────────────

export async function saveAccount(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.accountsManage);
  const parsed = accountSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  let accountId = id;
  try {
    const error = await db.$transaction(async (tx) => {
      if (!id) {
        const created = await tx.account.create({ data: parsed.data });
        accountId = created.id;
        await audit({ userId: user.id, action: "create", entity: "Account", entityId: created.id, after: created }, tx);
        return null;
      }
      const before = await tx.account.findUniqueOrThrow({ where: { id } });
      const used = (await tx.journalLine.count({ where: { accountId: id } })) > 0;
      if (before.systemKey && parsed.data.type !== before.type) return "This account is used by automatic postings; its type cannot change.";
      if (before.systemKey && !parsed.data.isActive) return "This account is used by automatic postings and must stay active.";
      if (used && parsed.data.type !== before.type) return "This account already has entries; its type cannot change. Create a new account instead.";
      if (!parsed.data.isActive && before.isActive) {
        const { _sum } = await tx.journalLine.aggregate({ where: { accountId: id }, _sum: { debit: true, credit: true } });
        if (!(_sum.debit ?? new Prisma.Decimal(0)).equals(_sum.credit ?? new Prisma.Decimal(0)))
          return "This account still has a balance. Move it to another account with a journal entry before deactivating.";
      }
      const after = await tx.account.update({ where: { id }, data: parsed.data });
      await audit({ userId: user.id, action: "update", entity: "Account", entityId: id, before, after }, tx);
      return null;
    });
    if (error) return { error };
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }
  revalidatePath("/accounting", "layout");
  redirect(`/accounting/accounts/${accountId}`);
}

// ─────────────── Manual journals ───────────────
// Posted at once, or sent for approval when an approval rule for manual journals matches.

export async function saveManualJournal(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.journalPost);
  const scope = await getBranchScope();
  const result = await submit("ManualJournal", formObject(formData), user, scope);
  if ("state" in result) return result.state;
  revalidatePath("/accounting", "layout");
  redirect(result.redirect);
}

/** Reverses a manual journal on a date the user picks (usually today, or the first day of the next month). */
export async function reverseManualJournal(id: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.journalPost);
  const date = formData.get("date");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { fieldErrors: { date: ["Pick the reversal date"] } };
  const scope = await getBranchScope();
  const result = await submit("JournalReversal", { id, date }, user, scope);
  if ("state" in result) return result.state;
  revalidatePath("/accounting", "layout");
  redirect(result.redirect);
}

// ─────────────── Periods ───────────────

/**
 * Closes or reopens a month. Months close in order (all earlier months first) and reopen in reverse order
 * (no later month may be closed), so the closed books are always one unbroken run.
 */
export async function setPeriodStatus(year: number, month: number, status: "OPEN" | "CLOSED"): Promise<ActionState> {
  const user = await requirePermission(P.periodsManage);
  const result = await runPosting(async (tx) => {
    // Waits for postings in flight (they hold this lock shared) and keeps new ones out until we commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(727002)`;
    const key = year * 12 + (month - 1);
    const periods = await tx.accountingPeriod.findMany();
    const closed = new Set(periods.filter((p) => p.status === "CLOSED").map((p) => p.year * 12 + (p.month - 1)));
    const now = new Date();
    if (status === "CLOSED" && key >= now.getFullYear() * 12 + now.getMonth()) throw new PostingError("A month can only be closed after it has ended.");
    if (status === "CLOSED") {
      const first = await tx.journalEntry.findFirst({ orderBy: { date: "asc" }, select: { date: true } });
      const start = first ? first.date.getFullYear() * 12 + first.date.getMonth() : key;
      for (let k = start; k < key; k++)
        if (!closed.has(k)) throw new PostingError("Close the earlier months first; periods close in order.");
    } else if ([...closed].some((k) => k > key)) throw new PostingError("Reopen the later months first; periods reopen in reverse order.");

    const before = periods.find((p) => p.year === year && p.month === month) ?? null;
    const after = await tx.accountingPeriod.upsert({
      where: { year_month: { year, month } },
      create: { year, month, status, closedById: status === "CLOSED" ? user.id : null, closedAt: status === "CLOSED" ? new Date() : null },
      update: { status, closedById: status === "CLOSED" ? user.id : null, closedAt: status === "CLOSED" ? new Date() : null },
    });
    await audit({ userId: user.id, action: status === "CLOSED" ? "close" : "reopen", entity: "AccountingPeriod", entityId: `${year}-${month}`, before, after }, tx);
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/accounting", "layout");
  return { ok: `${new Date(year, month - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" })} is ${status === "CLOSED" ? "closed" : "open again"}.` };
}
