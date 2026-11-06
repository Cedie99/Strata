import "server-only";
import { Prisma } from "@prisma/client";
import { audit } from "@/core/audit";
import { nextNumber } from "@/core/numbering";
import { assertPeriodOpen, PostingError } from "@/core/posting";
import type { SystemKey } from "./module";

// The general ledger's write side. Every posting document calls one of the journal builders below inside
// its own transaction, so a document and its accounting entry are saved (or rolled back) together.
// The database re-checks the essentials: entries balance, closed months take no entries, nothing is edited.

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export type LineInput = {
  account: SystemKey | { id: string };
  branchId: string;
  debit?: Prisma.Decimal;
  credit?: Prisma.Decimal;
  customerId?: string;
  productId?: string;
  supplierId?: string;
  memo?: string;
};

export type JournalInput = {
  date: Date;
  sourceType: string;
  sourceId?: string | null;
  sourceNumber?: string;
  memo?: string;
  reversalOfId?: string;
  userId: string;
  lines: LineInput[];
};

/** Debit one account and credit another with the same amount (two lines). */
export const pair = (debit: SystemKey | { id: string }, credit: SystemKey | { id: string }, amount: Prisma.Decimal, common: Omit<LineInput, "account" | "debit" | "credit">): LineInput[] => [
  { ...common, account: debit, debit: amount },
  { ...common, account: credit, credit: amount },
];

/**
 * Writes one balanced journal entry. Amounts are rounded to centavos, zero lines are dropped and an
 * entry with nothing left is skipped (returns null), e.g. goods with no cost.
 */
export async function postJournal(tx: Tx, input: JournalInput) {
  await assertPeriodOpen(tx, input.date);
  const lines = input.lines
    .map((l) => ({ ...l, debit: money(l.debit ?? ZERO), credit: money(l.credit ?? ZERO) }))
    .map((l) => (l.debit.isNegative() || l.credit.isNegative() ? { ...l, debit: l.credit.abs(), credit: l.debit.abs() } : l))
    .filter((l) => !l.debit.isZero() || !l.credit.isZero());
  if (lines.length === 0) return null;
  const debits = lines.reduce((s, l) => s.plus(l.debit), ZERO);
  const credits = lines.reduce((s, l) => s.plus(l.credit), ZERO);
  if (!debits.equals(credits)) throw new PostingError(`The entry does not balance: debits ${debits.toFixed(2)}, credits ${credits.toFixed(2)}.`);

  const keys = [...new Set(lines.flatMap((l) => (typeof l.account === "string" ? [l.account] : [])))];
  const ids = [...new Set(lines.flatMap((l) => (typeof l.account === "string" ? [] : [l.account.id])))];
  const accounts = await tx.account.findMany({ where: { OR: [{ systemKey: { in: keys } }, { id: { in: ids } }] } });
  const byKey = new Map(accounts.flatMap((a) => (a.systemKey ? [[a.systemKey, a] as const] : [])));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const resolve = (a: LineInput["account"]) => {
    const account = typeof a === "string" ? byKey.get(a) : byId.get(a.id);
    if (!account) throw new PostingError(`Account ${typeof a === "string" ? a : a.id} is missing from the chart of accounts.`);
    if (!account.isActive) throw new PostingError(`Account ${account.code} · ${account.name} is inactive.`);
    return account.id;
  };

  const branch = await tx.branch.findUniqueOrThrow({ where: { id: lines[0].branchId } });
  const number = await nextNumber(tx, "JournalEntry", { branchCode: branch.code, date: input.date });
  const entry = await tx.journalEntry.create({
    data: {
      number,
      date: input.date,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceNumber: input.sourceNumber ?? "",
      memo: input.memo ?? "",
      reversalOfId: input.reversalOfId,
      createdById: input.userId,
      lines: {
        create: lines.map((l) => ({
          accountId: resolve(l.account),
          branchId: l.branchId,
          debit: l.debit,
          credit: l.credit,
          customerId: l.customerId,
          productId: l.productId,
          supplierId: l.supplierId,
          memo: l.memo ?? "",
        })),
      },
    },
    include: { lines: true },
  });
  await audit({ userId: input.userId, action: "create", entity: "JournalEntry", entityId: entry.id, after: entry }, tx);
  return entry;
}

/** An entry that cancels another line for line (debits and credits swapped). */
export async function reverseJournal(tx: Tx, originalId: string, opts: { date: Date; sourceType: string; sourceId: string; memo: string; userId: string }) {
  const original = await tx.journalEntry.findUnique({ where: { id: originalId }, include: { lines: true, reversedBy: true } });
  if (!original) throw new PostingError("That journal entry does not exist.");
  if (original.reversedBy) throw new PostingError(`${original.number} was already reversed by ${original.reversedBy.number}.`);
  return postJournal(tx, {
    ...opts,
    sourceNumber: original.sourceNumber,
    reversalOfId: original.id,
    lines: original.lines.map((l) => ({
      account: { id: l.accountId },
      branchId: l.branchId,
      debit: l.credit,
      credit: l.debit,
      customerId: l.customerId ?? undefined,
      productId: l.productId ?? undefined,
      supplierId: l.supplierId ?? undefined,
      memo: l.memo,
    })),
  });
}

/** Today at local midnight: the accounting date of things that happen "now" (stock movements, cost changes). */
export const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// ───────────────────────── Journal builders, one per document ─────────────────────────

type InvoiceForJournal = {
  id: string;
  number: string;
  date: Date;
  branchId: string;
  customerId: string;
  subtotal: Prisma.Decimal;
  vat: Prisma.Decimal;
  total: Prisma.Decimal;
  lines: { productId: string; qty: Prisma.Decimal; unitCost: Prisma.Decimal; amount: Prisma.Decimal }[];
};

/** Sale on account (perpetual inventory): Dr receivable / Cr sales + output VAT, and Dr cost of goods sold / Cr inventory per product. */
export function journalForInvoice(tx: Tx, userId: string, inv: InvoiceForJournal) {
  const common = { branchId: inv.branchId };
  return postJournal(tx, {
    date: inv.date,
    sourceType: "SalesInvoice",
    sourceId: inv.id,
    sourceNumber: inv.number,
    memo: `Sales invoice ${inv.number}`,
    userId,
    lines: [
      { ...common, account: "AR", debit: inv.total, customerId: inv.customerId },
      { ...common, account: "SALES", credit: inv.subtotal },
      { ...common, account: "OUTPUT_VAT", credit: inv.vat, customerId: inv.customerId, memo: "Output VAT" },
      ...inv.lines.flatMap((l) => pair("COGS", "INVENTORY", money(l.qty.times(l.unitCost)), { ...common, productId: l.productId })),
    ],
  });
}

/** Voiding reverses the invoice's entry on the invoice date, so revenue disappears from the month it was in. */
export async function journalForInvoiceVoid(tx: Tx, userId: string, inv: InvoiceForJournal) {
  const original = await tx.journalEntry.findUnique({ where: { sourceType_sourceId: { sourceType: "SalesInvoice", sourceId: inv.id } } });
  if (!original) return null; // a zero-value invoice has no entry
  return reverseJournal(tx, original.id, { date: inv.date, sourceType: "SalesInvoiceVoid", sourceId: inv.id, memo: `Void of ${inv.number}`, userId });
}

export function journalForPayment(
  tx: Tx,
  userId: string,
  p: { id: string; number: string; date: Date; amount: Prisma.Decimal; cwt: Prisma.Decimal; invoice: { number: string; branchId: string; customerId: string } },
) {
  // Tax the customer withheld is not cash: it is credited against our income tax (Form 2307 received).
  return postJournal(tx, {
    date: p.date,
    sourceType: "Payment",
    sourceId: p.id,
    sourceNumber: p.number,
    memo: `Payment for ${p.invoice.number}`,
    userId,
    lines: [
      { account: "CASH", branchId: p.invoice.branchId, debit: p.amount.minus(p.cwt) },
      { account: "CWT", branchId: p.invoice.branchId, debit: p.cwt, customerId: p.invoice.customerId, memo: "Creditable withholding tax" },
      { account: "AR", branchId: p.invoice.branchId, credit: p.amount, customerId: p.invoice.customerId },
    ],
  });
}

export function journalForCashEntry(
  tx: Tx,
  userId: string,
  e: { id: string; number: string; date: Date; branchId: string; direction: string; category: string; amount: Prisma.Decimal; note: string },
  account: SystemKey,
) {
  const common = { branchId: e.branchId, memo: e.note };
  return postJournal(tx, {
    date: e.date,
    sourceType: "CashEntry",
    sourceId: e.id,
    sourceNumber: e.number,
    memo: e.category,
    userId,
    lines: e.direction === "IN" ? pair("CASH", account, e.amount, common) : pair(account, "CASH", e.amount, common),
  });
}

/**
 * Stock valued at the product's cost. A receipt referenced OPENING is opening stock (against opening
 * balance equity); other receipts are goods bought on account (until purchasing exists, against payables).
 * Issues and adjustments go to inventory adjustments; a transfer between branches goes through inter-branch
 * clearing so each branch's books still balance. Movements made by a sales invoice are journalled by the invoice.
 */
export async function journalForMovement(
  tx: Tx,
  userId: string,
  m: {
    id: string;
    number: string;
    type: string;
    reference: string;
    product: { id: string; sku: string; cost: Prisma.Decimal };
    lines: { qty: Prisma.Decimal; branchId: string }[];
    date: Date;
  },
) {
  const value = money(m.lines[0].qty.abs().times(m.product.cost));
  const common = { branchId: m.lines[0].branchId, productId: m.product.id };
  let lines: LineInput[];
  if (m.type === "RECEIPT") lines = pair("INVENTORY", m.reference.trim().toUpperCase() === "OPENING" ? "OPENING" : "AP", value, common);
  else if (m.type === "ISSUE") lines = pair("INV_ADJ", "INVENTORY", value, common);
  else if (m.type === "ADJUSTMENT") lines = m.lines[0].qty.isNegative() ? pair("INV_ADJ", "INVENTORY", value, common) : pair("INVENTORY", "INV_ADJ", value, common);
  else {
    const [out, into] = m.lines;
    if (out.branchId === into.branchId) return null; // moving stock inside a branch changes nothing in the books
    lines = [
      ...pair("INTERBRANCH", "INVENTORY", value, { branchId: out.branchId, productId: m.product.id }),
      ...pair("INVENTORY", "INTERBRANCH", value, { branchId: into.branchId, productId: m.product.id }),
    ];
  }
  return postJournal(tx, {
    date: m.date,
    sourceType: "StockMovement",
    sourceId: m.id,
    sourceNumber: m.number,
    memo: `${m.type.toLowerCase()} ${m.product.sku}${m.reference ? ` · ${m.reference}` : ""}`,
    userId,
    lines,
  });
}

/**
 * Inventory is carried at each product's cost. When that cost changes, the stock on hand is revalued per
 * branch so the ledger keeps matching quantity × cost (the difference goes to inventory adjustments).
 */
export async function journalForCostChange(
  tx: Tx,
  userId: string,
  product: { id: string; sku: string },
  oldCost: Prisma.Decimal,
  newCost: Prisma.Decimal,
  reason = "Cost change",
) {
  if (oldCost.equals(newCost)) return null;
  const onHand = await tx.stockMovement.groupBy({ by: ["warehouseId"], where: { productId: product.id }, _sum: { qty: true } });
  const warehouses = await tx.warehouse.findMany({ where: { id: { in: onHand.map((o) => o.warehouseId) } }, select: { id: true, branchId: true } });
  const branchOf = new Map(warehouses.map((w) => [w.id, w.branchId]));
  const byBranch = new Map<string, Prisma.Decimal>();
  for (const o of onHand) {
    const b = branchOf.get(o.warehouseId)!;
    byBranch.set(b, (byBranch.get(b) ?? ZERO).plus(o._sum.qty ?? ZERO));
  }
  const diff = newCost.minus(oldCost);
  return postJournal(tx, {
    date: today(),
    sourceType: "CostChange",
    sourceNumber: product.sku,
    memo: `${reason} ${product.sku}: ${oldCost.toString()} → ${newCost.toString()}`,
    userId,
    lines: [...byBranch].flatMap(([branchId, qty]) => pair("INVENTORY", "INV_ADJ", money(qty.times(diff)), { branchId, productId: product.id })),
  });
}
