import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/core/db";

/** Thrown inside a posting transaction to roll everything back and show the message to the user. */
export class PostingError extends Error {}

/**
 * Runs a posting transaction, turning PostingError (and the database's own ledger guards, e.g. a closed
 * period) into a message for the form. Everything the transaction wrote is rolled back.
 */
export async function runPosting<T>(run: (tx: Prisma.TransactionClient) => Promise<T>, timeout = 60_000): Promise<{ error: string } | { value: T }> {
  try {
    // Postings write several rows (document, stock, journal, audit); the database is remote, so allow more than 5 s.
    return { value: await db.$transaction(run, { timeout, maxWait: 10_000 }) };
  } catch (e) {
    if (e instanceof PostingError) return { error: e.message };
    const guard = ledgerGuardMessage(e);
    if (guard) return { error: guard };
    throw e;
  }
}

/** The message of a ledger trigger (closed period, unbalanced entry, append-only table), if that is what failed. */
export function ledgerGuardMessage(e: unknown) {
  const text = e instanceof Error ? e.message : "";
  const m = /(The period \d{4}-\d{2} is closed|does not balance|records are permanent|cannot be changed or deleted)[^\n"`]*/.exec(text);
  return m ? m[0] : null;
}

const monthName = (year: number, month: number) =>
  new Date(year, month - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });

/** Refuses postings dated in a closed month (the database refuses them too; this gives a clear message first). */
export async function assertPeriodOpen(tx: Prisma.TransactionClient, date: Date) {
  const period = await tx.accountingPeriod.findUnique({ where: { year_month: { year: date.getFullYear(), month: date.getMonth() + 1 } } });
  if (period?.status === "CLOSED")
    throw new PostingError(`${monthName(period.year, period.month)} is closed. Post it in an open month, or ask an accountant to reopen the period.`);
}
