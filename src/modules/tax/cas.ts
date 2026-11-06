import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/core/db";
import { BUILT_IN_SERIES } from "@/core/numbering";

// Checks the BIR looks at when a computerized accounting system (CAS / CBA) is registered:
// numbered documents without gaps, posted records that cannot be changed or deleted, an audit trail that
// shows tampering, and books that balance.

export type SeriesCheck = { docType: string; name: string; count: number; gaps: string[]; ok: boolean };

/** Numbers in each document series, grouped by everything before the counter (prefix, branch, year). */
export async function seriesGaps(): Promise<SeriesCheck[]> {
  const sources: Record<string, () => Promise<{ number: string }[]>> = {
    StockMovement: () => db.stockMovement.findMany({ where: { number: { not: "" } }, select: { number: true }, distinct: ["number"] }),
    SalesInvoice: () => db.salesInvoice.findMany({ select: { number: true } }),
    Payment: () => db.payment.findMany({ select: { number: true } }),
    CashEntry: () => db.cashEntry.findMany({ select: { number: true } }),
    JournalEntry: () => db.journalEntry.findMany({ select: { number: true } }),
    PurchaseOrder: () => db.purchaseOrder.findMany({ select: { number: true } }),
    GoodsReceipt: () => db.goodsReceipt.findMany({ select: { number: true } }),
    SupplierBill: () => db.supplierBill.findMany({ select: { number: true } }),
    SupplierPayment: () => db.supplierPayment.findMany({ select: { number: true } }),
    ApprovalRequest: () => db.approvalRequest.findMany({ select: { number: true } }),
  };
  const results = await Promise.all(
    Object.entries(sources).map(async ([docType, load]) => {
      const numbers = (await load()).map((r) => r.number);
      const groups = new Map<string, number[]>();
      for (const n of numbers) {
        const m = /^(.*?)(\d+)$/.exec(n);
        if (!m) continue;
        groups.set(m[1], [...(groups.get(m[1]) ?? []), Number(m[2])]);
      }
      const gaps: string[] = [];
      for (const [prefix, list] of groups) {
        const seen = new Set(list);
        const max = Math.max(...list);
        const width = numbers.find((n) => n.startsWith(prefix))!.length - prefix.length;
        for (let i = 1; i <= max && gaps.length < 20; i++) if (!seen.has(i)) gaps.push(`${prefix}${String(i).padStart(width, "0")}`);
      }
      return { docType, name: BUILT_IN_SERIES[docType]?.name ?? docType, count: numbers.length, gaps, ok: gaps.length === 0 };
    }),
  );
  return results;
}

/** Tables that must refuse UPDATE / DELETE, and whether the database trigger doing it is in place. */
export async function protectedTables() {
  const expected = [
    "AuditLog",
    "JournalEntry",
    "JournalLine",
    "StockMovement",
    "Payment",
    "CashEntry",
    "SalesInvoice",
    "SalesInvoiceLine",
    "PurchaseOrder",
    "PurchaseOrderLine",
    "GoodsReceipt",
    "GoodsReceiptLine",
    "SupplierBill",
    "SupplierBillLine",
    "SupplierPayment",
    "SupplierPaymentLine",
  ];
  const rows = await db.$queryRaw<{ table: string }[]>`
    SELECT DISTINCT c.relname AS "table"
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
      AND (t.tgname = 'append_only' OR t.tgname LIKE '%_guard')`;
  const have = new Set(rows.map((r) => r.table));
  return expected.map((table) => ({ table, ok: have.has(table) }));
}

export async function auditChain() {
  const [r] = await db.$queryRaw<{ checked: bigint; first_broken_seq: bigint | null }[]>`SELECT * FROM audit_verify()`;
  return { checked: Number(r.checked), firstBroken: r.first_broken_seq === null ? null : Number(r.first_broken_seq) };
}

export async function ledgerBalanced() {
  const { _sum } = await db.journalLine.aggregate({ _sum: { debit: true, credit: true } });
  const debit = _sum.debit ?? new Prisma.Decimal(0);
  const credit = _sum.credit ?? new Prisma.Decimal(0);
  return { debit, credit, ok: debit.equals(credit) };
}
