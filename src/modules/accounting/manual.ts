import "server-only";
import type { Prisma } from "@prisma/client";
import { PostingError } from "@/core/posting";
import { postJournal, reverseJournal } from "./ledger";
import { CONTROL_ACCOUNTS } from "./module";
import type { z } from "zod";
import type { manualJournalSchema } from "./schemas";

type Tx = Prisma.TransactionClient;
export type ManualJournalInput = z.infer<typeof manualJournalSchema>;

/** Posts a manual journal entry; control accounts (kept by their own documents) are refused. */
export async function postManualJournal(tx: Tx, userId: string, input: ManualJournalInput, mayUse: (branchId: string) => boolean) {
  const { date, memo, lines } = input;
  const accounts = await tx.account.findMany({ where: { id: { in: lines.map((l) => l.accountId) } } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  lines.forEach((l, i) => {
    const a = byId.get(l.accountId);
    if (!a) throw new PostingError(`Line ${i + 1}: that account does not exist.`);
    if (a.systemKey && CONTROL_ACCOUNTS.includes(a.systemKey as never))
      throw new PostingError(`Line ${i + 1}: ${a.code} · ${a.name} is kept by its own records (invoices, bills, payments, stock, receipts) and cannot take manual entries.`);
    if (!mayUse(l.branchId)) throw new PostingError(`Line ${i + 1}: you cannot post to that branch.`);
  });
  const entry = await postJournal(tx, {
    date,
    memo,
    sourceType: "Manual",
    userId,
    lines: lines.map((l) => ({ account: { id: l.accountId }, branchId: l.branchId, debit: l.debit, credit: l.credit, memo: l.memo })),
  });
  if (!entry) throw new PostingError("The entry has no amounts.");
  return entry;
}

/** Reverses a manual journal on the given date. Entries from documents are reversed by voiding the document. */
export async function reverseManualJournal(tx: Tx, userId: string, id: string, date: Date, mayUse: (branchId: string) => boolean) {
  const original = await tx.journalEntry.findUnique({ where: { id }, include: { lines: true } });
  if (!original) throw new PostingError("That journal entry does not exist.");
  if (original.sourceType !== "Manual")
    throw new PostingError("Only manual journals are reversed here. Entries from documents are reversed by voiding the document.");
  if (original.lines.some((l) => !mayUse(l.branchId))) throw new PostingError("This entry touches a branch you cannot post to.");
  const reversal = await reverseJournal(tx, id, { date, sourceType: "Reversal", sourceId: id, memo: `Reversal of ${original.number}: ${original.memo}`, userId });
  if (!reversal) throw new PostingError("The entry has no amounts to reverse.");
  return reversal;
}
