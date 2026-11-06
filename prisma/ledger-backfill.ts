// Writes journal entries for documents posted before the general ledger existed. Safe to re-run: documents
// that already have their entry are skipped. Stock is valued at each product's current cost.
//   npx tsx --conditions=react-server prisma/ledger-backfill.ts
import { Prisma } from "@prisma/client";
import { db } from "@/core/db";
import { journalForCashEntry, journalForInvoice, journalForInvoiceVoid, journalForMovement, journalForPayment } from "@/modules/accounting/ledger";
import type { SystemKey } from "@/modules/accounting/module";
import { CASH_CATEGORY_ACCOUNTS } from "@/modules/finance/module";

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

async function main() {
  const admin = await db.user.findFirstOrThrow({ where: { roles: { some: { role: { isSystem: true } } } }, orderBy: { createdAt: "asc" } });
  const has = async (sourceType: string, sourceId: string) =>
    !!(await db.journalEntry.findUnique({ where: { sourceType_sourceId: { sourceType, sourceId } } }));
  const counts: Record<string, number> = {};
  const done = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  // Stock movements made by sales invoices are journalled with the invoice, so skip those.
  const invoiceNumbers = new Set((await db.salesInvoice.findMany({ select: { number: true } })).map((i) => i.number));
  const movements = await db.stockMovement.findMany({
    orderBy: { createdAt: "asc" },
    include: { product: true, warehouse: true },
  });
  const byNumber = new Map<string, typeof movements>();
  for (const m of movements) byNumber.set(m.number || m.id, [...(byNumber.get(m.number || m.id) ?? []), m]);
  for (const group of byNumber.values()) {
    if (invoiceNumbers.has(group[0].reference)) continue;
    if (await has("StockMovement", group[0].id)) continue;
    const type = group[0].type.startsWith("TRANSFER") ? "TRANSFER" : group[0].type;
    const ordered = type === "TRANSFER" ? [...group].sort((a, b) => Number(a.type !== "TRANSFER_OUT") - Number(b.type !== "TRANSFER_OUT")) : group;
    await db.$transaction(
      (tx) =>
        journalForMovement(tx, group[0].createdById ?? admin.id, {
          id: group[0].id,
          number: group[0].number, // seed movements have no number; their reference (OPENING) is in the memo
          type,
          reference: group[0].reference,
          product: group[0].product,
          lines: ordered.map((m) => ({ qty: m.qty, branchId: m.warehouse.branchId })),
          date: day(group[0].createdAt),
        }),
      { timeout: 60_000 },
    );
    done("stock movements");
  }

  for (const inv of await db.salesInvoice.findMany({ include: { lines: true }, orderBy: { createdAt: "asc" } })) {
    if (!(await has("SalesInvoice", inv.id))) {
      await db.$transaction((tx) => journalForInvoice(tx, inv.createdById ?? admin.id, inv), { timeout: 60_000 });
      done("invoices");
    }
    if (inv.status === "VOID" && !(await has("SalesInvoiceVoid", inv.id))) {
      await db.$transaction((tx) => journalForInvoiceVoid(tx, inv.createdById ?? admin.id, inv), { timeout: 60_000 });
      done("voids");
    }
  }

  for (const p of await db.payment.findMany({ include: { invoice: true }, orderBy: { createdAt: "asc" } })) {
    if (await has("Payment", p.id)) continue;
    await db.$transaction((tx) => journalForPayment(tx, p.createdById ?? admin.id, p), { timeout: 60_000 });
    done("payments");
  }

  for (const e of await db.cashEntry.findMany({ orderBy: { createdAt: "asc" } })) {
    if (await has("CashEntry", e.id)) continue;
    const account = (CASH_CATEGORY_ACCOUNTS[e.direction as "IN" | "OUT"] as Record<string, SystemKey>)[e.category];
    if (!account) {
      console.warn(`Skipped ${e.number}: category "${e.category}" has no account; post it with a manual journal.`);
      continue;
    }
    await db.$transaction((tx) => journalForCashEntry(tx, e.createdById ?? admin.id, e, account), { timeout: 60_000 });
    done("cash entries");
  }

  const [tb] = await db.$queryRaw<{ d: Prisma.Decimal; c: Prisma.Decimal }[]>`SELECT coalesce(sum("debit"),0) AS d, coalesce(sum("credit"),0) AS c FROM "JournalLine"`;
  console.log("Journalled:", Object.keys(counts).length ? counts : "nothing to do");
  console.log(`Ledger totals: debits ${tb.d.toString()}, credits ${tb.c.toString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
