import "server-only";
import type { Prisma } from "@prisma/client";
import { audit } from "@/core/audit";
import { nextNumber } from "@/core/numbering";
import { assertPeriodOpen } from "@/core/posting";
import { journalForCashEntry } from "@/modules/accounting/ledger";
import type { SystemKey } from "@/modules/accounting/module";
import { CASH_CATEGORY_ACCOUNTS } from "./module";
import type { CashEntryInput } from "./schemas";

/** Writes one cash book entry with its number and journal entry. Used by the form and the Excel import. */
export async function recordCashEntry(
  tx: Prisma.TransactionClient,
  userId: string,
  input: CashEntryInput,
  mayUseBranch: (branchId: string) => boolean,
): Promise<{ error: string } | { number: string }> {
  if (!mayUseBranch(input.branchId)) return { error: "You cannot use that branch." };
  const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
  if (!branch?.isActive) return { error: "That branch is inactive or missing." };
  await assertPeriodOpen(tx, input.date);
  const account = (CASH_CATEGORY_ACCOUNTS[input.direction] as Record<string, SystemKey>)[input.category];

  const number = await nextNumber(tx, "CashEntry", { branchCode: branch.code, date: input.date });
  const entry = await tx.cashEntry.create({ data: { ...input, number, createdById: userId } });
  await audit({ userId, action: "create", entity: "CashEntry", entityId: entry.id, after: entry }, tx);
  await journalForCashEntry(tx, userId, entry, account);
  return { number };
}
