import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { PostingError } from "@/core/posting";
import { vatOf } from "@/core/tax-math";
import { postManualJournal, reverseManualJournal } from "@/modules/accounting/manual";
import { P as ACC } from "@/modules/accounting/module";
import { manualJournalSchema } from "@/modules/accounting/schemas";
import { P as FIN } from "@/modules/finance/module";
import { recordCashEntry } from "@/modules/finance/posting";
import { cashEntrySchema } from "@/modules/finance/schemas";
import { P as PUR } from "@/modules/purchasing/module";
import { postOrder, postSupplierPayment, voidBill } from "@/modules/purchasing/posting";
import { orderSchema, supplierPaymentSchema } from "@/modules/purchasing/schemas";
import { P as SALES } from "@/modules/sales/module";
import { postInvoice, voidInvoice } from "@/modules/sales/posting";
import { dayString, invoiceSchema } from "@/modules/sales/schemas";
import type { Trigger } from "./module";

// Every kind of document that can wait for approval: how to read the submitted form, what approvers see,
// the facts the rules are checked against, and how to post it once approved.

type Tx = Prisma.TransactionClient;
type MayUse = (branchId: string) => boolean;
const ZERO = new Prisma.Decimal(0);
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const sum = <T>(rows: T[], get: (r: T) => Prisma.Decimal) => rows.reduce((s, r) => s.plus(get(r)), ZERO);

export type Raw = Record<string, string | string[]>;
export type Details = { fields: { label: string; value: string }[]; items?: { columns: string[]; rows: string[][] } };
/** Values the rules are checked against: an amount, a percent, or a yes/no condition. */
export type Facts = Partial<Record<Trigger, Prisma.Decimal | number | boolean>>;
export type Described = { branchId: string; amount: Prisma.Decimal; title: string; targetId?: string; details: Details; facts: Facts };
export type Posted = { id: string; number: string; href: string };

export type KindDef = {
  label: string;
  /** What the requester needs; checked again when it is posted. */
  permission: string;
  schema: z.ZodTypeAny;
  describe: (input: never, currency: string) => Promise<Described>;
  execute: (tx: Tx, userId: string, input: never, mayUse: MayUse) => Promise<Posted>;
};

const lineItems = (columns: string[], rows: string[][]) => ({ columns, rows });

// ───────────────────────── Purchasing ─────────────────────────

const purchaseOrder = {
  label: "Purchase order",
  permission: PUR.ordersManage,
  schema: orderSchema,
  async describe(input: z.infer<typeof orderSchema>, currency: string): Promise<Described> {
    const [supplier, warehouse, products] = await Promise.all([
      db.supplier.findUnique({ where: { id: input.supplierId } }),
      db.warehouse.findUnique({ where: { id: input.warehouseId }, include: { branch: true } }),
      db.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } }),
    ]);
    if (!supplier || !warehouse) throw new PostingError("That supplier or warehouse no longer exists.");
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines = input.lines.map((l) => {
      const net = D(l.qty).times(l.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      return { ...l, net, vat: vatOf(net, supplier.vatRegistered ? l.vatCode : "EXEMPT") };
    });
    const total = sum(lines, (l) => l.net.plus(l.vat));
    const money = (v: Prisma.Decimal) => formatMoney(v, currency);
    return {
      branchId: warehouse.branchId,
      amount: total,
      title: `Purchase order · ${supplier.name}`,
      facts: { PO_AMOUNT: total },
      details: {
        fields: [
          { label: "Supplier", value: supplier.name },
          { label: "Deliver to", value: `${warehouse.code} · ${warehouse.name} (${warehouse.branch.code})` },
          { label: "PO date", value: formatDate(input.date) },
          { label: "Reference", value: input.reference || "-" },
          { label: "Net of VAT", value: money(sum(lines, (l) => l.net)) },
          { label: "VAT", value: money(sum(lines, (l) => l.vat)) },
          { label: "Total", value: money(total) },
        ],
        items: lineItems(
          ["Product", "Qty", "Unit cost", "Amount"],
          lines.map((l) => {
            const p = byId.get(l.productId);
            return [p ? `${p.sku} · ${p.name}` : "?", l.qty, money(D(l.unitCost)), money(l.net)];
          }),
        ),
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof orderSchema>, mayUse: MayUse): Promise<Posted> {
    const o = await postOrder(tx, userId, input, mayUse);
    return { id: o.id, number: o.number, href: `/purchasing/orders/${o.id}` };
  },
};

const supplierPayment = {
  label: "Payment to supplier",
  permission: PUR.paymentsPost,
  schema: supplierPaymentSchema,
  async describe(input: z.infer<typeof supplierPaymentSchema>, currency: string): Promise<Described> {
    const [supplier, bills] = await Promise.all([
      db.supplier.findUnique({ where: { id: input.supplierId } }),
      db.supplierBill.findMany({ where: { id: { in: input.allocations.map((a) => a.billId) } } }),
    ]);
    if (!supplier || bills.length === 0) throw new PostingError("That supplier or its bills no longer exist.");
    const amount = sum(input.allocations, (a) => D(a.amount));
    const billById = new Map(bills.map((b) => [b.id, b]));
    const money = (v: Prisma.Decimal) => formatMoney(v, currency);
    return {
      branchId: bills[0].branchId,
      amount,
      title: `Payment to ${supplier.name}`,
      facts: { SUPPLIER_PAYMENT_AMOUNT: amount },
      details: {
        fields: [
          { label: "Supplier", value: supplier.name },
          { label: "Payment date", value: formatDate(input.date) },
          { label: "Method", value: input.method },
          { label: "Reference", value: input.reference || "-" },
          { label: "Applied to bills", value: money(amount) },
        ],
        items: lineItems(
          ["Bill", "Supplier invoice", "Amount applied"],
          input.allocations.map((a) => {
            const b = billById.get(a.billId);
            return [b?.number ?? "?", b?.supplierInvoiceNo ?? "", money(D(a.amount))];
          }),
        ),
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof supplierPaymentSchema>, mayUse: MayUse): Promise<Posted> {
    const p = await postSupplierPayment(tx, userId, input, mayUse);
    return { id: p.id, number: p.number, href: `/purchasing/payments/${p.id}` };
  },
};

const voidSchema = z.object({ id: z.string().min(1) });

const billVoid = {
  label: "Bill void",
  permission: PUR.billsPost,
  schema: voidSchema,
  async describe(input: z.infer<typeof voidSchema>, currency: string): Promise<Described> {
    const bill = await db.supplierBill.findUnique({ where: { id: input.id }, include: { supplier: true, _count: { select: { allocations: true } } } });
    if (!bill) throw new PostingError("That bill does not exist.");
    if (bill.status === "VOID") throw new PostingError("This bill is already void.");
    if (bill._count.allocations > 0) throw new PostingError("Payments were made on this bill; it cannot be voided.");
    return {
      branchId: bill.branchId,
      amount: bill.total,
      targetId: bill.id,
      title: `Void ${bill.number} · ${bill.supplier.name}`,
      facts: { BILL_VOID: bill.total },
      details: {
        fields: [
          { label: "Bill", value: bill.number },
          { label: "Supplier", value: bill.supplier.name },
          { label: "Supplier invoice", value: bill.supplierInvoiceNo },
          { label: "Bill date", value: formatDate(bill.date) },
          { label: "Total", value: formatMoney(bill.total, currency) },
        ],
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof voidSchema>, mayUse: MayUse): Promise<Posted> {
    const b = await voidBill(tx, userId, input.id, mayUse);
    return { id: b.id, number: b.number, href: `/purchasing/bills/${b.id}` };
  },
};

// ───────────────────────── Sales ─────────────────────────

/** What a customer still owes on posted invoices. */
async function customerBalance(customerId: string) {
  const invoices = await db.salesInvoice.findMany({ where: { customerId, status: "POSTED" }, select: { total: true, payments: { select: { amount: true } } } });
  return sum(invoices, (i) => i.total.minus(sum(i.payments, (p) => p.amount)));
}

const salesInvoice = {
  label: "Sales invoice",
  permission: SALES.invoicesPost,
  schema: invoiceSchema,
  async describe(input: z.infer<typeof invoiceSchema>, currency: string): Promise<Described> {
    const [customer, warehouse, products] = await Promise.all([
      db.customer.findUnique({ where: { id: input.customerId } }),
      db.warehouse.findUnique({ where: { id: input.warehouseId }, include: { branch: true } }),
      db.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } }),
    ]);
    if (!customer || !warehouse) throw new PostingError("That customer or warehouse no longer exists.");
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines = input.lines.map((l) => {
      const p = byId.get(l.productId);
      const price = D(l.unitPrice);
      const net = D(l.qty).times(price).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const list = p?.price ?? ZERO;
      return {
        ...l,
        product: p,
        net,
        vat: vatOf(net, l.vatCode),
        belowCost: !!p && price.lessThan(p.cost),
        discount: list.greaterThan(0) ? Number(list.minus(price).div(list).times(100).toFixed(2)) : 0,
      };
    });
    const subtotal = sum(lines, (l) => l.net);
    const total = subtotal.plus(sum(lines, (l) => l.vat));
    const owed = customer.creditLimit.greaterThan(0) ? await customerBalance(customer.id) : ZERO;
    const money = (v: Prisma.Decimal) => formatMoney(v, currency);
    const maxDiscount = Math.max(0, ...lines.map((l) => l.discount));
    return {
      branchId: warehouse.branchId,
      amount: total,
      title: `Sales invoice · ${customer.name}`,
      facts: {
        SALE_BELOW_COST: lines.some((l) => l.belowCost),
        SALE_DISCOUNT: maxDiscount,
        CREDIT_LIMIT: customer.creditLimit.greaterThan(0) && owed.plus(total).greaterThan(customer.creditLimit),
      },
      details: {
        fields: [
          { label: "Customer", value: customer.name },
          { label: "Ship from", value: `${warehouse.code} · ${warehouse.name} (${warehouse.branch.code})` },
          { label: "Invoice date", value: formatDate(input.date) },
          { label: "Reference", value: input.reference || "-" },
          { label: "Net of VAT", value: money(subtotal) },
          { label: "Total due", value: money(total) },
          ...(customer.creditLimit.greaterThan(0)
            ? [
                { label: "Credit limit", value: money(customer.creditLimit) },
                { label: "Owed before this invoice", value: money(owed) },
              ]
            : []),
        ],
        items: lineItems(
          ["Product", "Qty", "Price", "List price", "Cost", "Amount"],
          lines.map((l) => [
            l.product ? `${l.product.sku} · ${l.product.name}` : "?",
            l.qty,
            money(D(l.unitPrice)) + (l.belowCost ? " ⚠ below cost" : l.discount > 0 ? ` (−${l.discount}%)` : ""),
            l.product ? money(l.product.price) : "",
            l.product ? money(l.product.cost) : "",
            money(l.net),
          ]),
        ),
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof invoiceSchema>, mayUse: MayUse): Promise<Posted> {
    const inv = await postInvoice(tx, userId, input, mayUse);
    return { id: inv.id, number: inv.number, href: `/sales/invoices/${inv.id}` };
  },
};

const invoiceVoid = {
  label: "Invoice void",
  permission: SALES.invoicesPost,
  schema: voidSchema,
  async describe(input: z.infer<typeof voidSchema>, currency: string): Promise<Described> {
    const inv = await db.salesInvoice.findUnique({ where: { id: input.id }, include: { customer: true, _count: { select: { payments: true } } } });
    if (!inv) throw new PostingError("That invoice does not exist.");
    if (inv.status === "VOID") throw new PostingError("This invoice is already void.");
    if (inv._count.payments > 0) throw new PostingError("This invoice has payments recorded against it and cannot be voided.");
    return {
      branchId: inv.branchId,
      amount: inv.total,
      targetId: inv.id,
      title: `Void ${inv.number} · ${inv.customer.name}`,
      facts: { INVOICE_VOID: inv.total },
      details: {
        fields: [
          { label: "Invoice", value: inv.number },
          { label: "Customer", value: inv.customer.name },
          { label: "Invoice date", value: formatDate(inv.date) },
          { label: "Total", value: formatMoney(inv.total, currency) },
        ],
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof voidSchema>, mayUse: MayUse): Promise<Posted> {
    const inv = await voidInvoice(tx, userId, input.id, mayUse);
    return { id: inv.id, number: inv.number, href: `/sales/invoices/${inv.id}` };
  },
};

// ───────────────────────── Finance and accounting ─────────────────────────

const cashOut = {
  label: "Cash out",
  permission: FIN.cashPost,
  schema: cashEntrySchema,
  async describe(input: z.infer<typeof cashEntrySchema>, currency: string): Promise<Described> {
    const branch = await db.branch.findUnique({ where: { id: input.branchId } });
    if (!branch) throw new PostingError("That branch does not exist.");
    const amount = D(input.amount);
    return {
      branchId: input.branchId,
      amount,
      title: `Cash ${input.direction === "IN" ? "in" : "out"} · ${input.category}`,
      // Only money going out can need approval.
      facts: input.direction === "OUT" ? { CASH_OUT_AMOUNT: amount } : {},
      details: {
        fields: [
          { label: "Branch", value: `${branch.code} · ${branch.name}` },
          { label: "Date", value: formatDate(input.date) },
          { label: "Category", value: input.category },
          { label: "Amount", value: formatMoney(amount, currency) },
          { label: "Reference", value: input.reference || "-" },
          { label: "Note", value: input.note || "-" },
        ],
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof cashEntrySchema>, mayUse: MayUse): Promise<Posted> {
    const r = await recordCashEntry(tx, userId, input, mayUse);
    if ("error" in r) throw new PostingError(r.error);
    const e = await tx.cashEntry.findUniqueOrThrow({ where: { number: r.number } });
    return { id: e.id, number: e.number, href: `/finance/cash?q=${encodeURIComponent(e.number)}` };
  },
};

const manualJournal = {
  label: "Manual journal",
  permission: ACC.journalPost,
  schema: manualJournalSchema,
  async describe(input: z.infer<typeof manualJournalSchema>, currency: string): Promise<Described> {
    const accounts = await db.account.findMany({ where: { id: { in: input.lines.map((l) => l.accountId) } } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const debits = sum(input.lines, (l) => l.debit);
    const money = (v: Prisma.Decimal) => (v.isZero() ? "" : formatMoney(v, currency));
    return {
      branchId: input.lines[0].branchId,
      amount: debits,
      title: `Manual journal · ${input.memo}`,
      facts: { MANUAL_JOURNAL: debits },
      details: {
        fields: [
          { label: "Date", value: formatDate(input.date) },
          { label: "Memo", value: input.memo },
          { label: "Total debits", value: formatMoney(debits, currency) },
        ],
        items: lineItems(
          ["Account", "Memo", "Debit", "Credit"],
          input.lines.map((l) => {
            const a = byId.get(l.accountId);
            return [a ? `${a.code} · ${a.name}` : "?", l.memo, money(l.debit), money(l.credit)];
          }),
        ),
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof manualJournalSchema>, mayUse: MayUse): Promise<Posted> {
    const e = await postManualJournal(tx, userId, input, mayUse);
    return { id: e.id, number: e.number, href: `/accounting/journals/${e.id}` };
  },
};

const reversalSchema = z.object({ id: z.string().min(1), date: dayString("Reversal date") });

const journalReversal = {
  label: "Journal reversal",
  permission: ACC.journalPost,
  schema: reversalSchema,
  async describe(input: z.infer<typeof reversalSchema>, currency: string): Promise<Described> {
    const original = await db.journalEntry.findUnique({ where: { id: input.id }, include: { lines: true, reversedBy: true } });
    if (!original) throw new PostingError("That journal entry does not exist.");
    if (original.sourceType !== "Manual") throw new PostingError("Only manual journals are reversed here.");
    if (original.reversedBy) throw new PostingError(`${original.number} was already reversed by ${original.reversedBy.number}.`);
    const debits = sum(original.lines, (l) => l.debit);
    return {
      branchId: original.lines[0].branchId,
      amount: debits,
      targetId: original.id,
      title: `Reverse ${original.number} · ${original.memo}`,
      facts: { MANUAL_JOURNAL: debits },
      details: {
        fields: [
          { label: "Entry", value: original.number },
          { label: "Memo", value: original.memo },
          { label: "Entry date", value: formatDate(original.date) },
          { label: "Reversal date", value: formatDate(input.date) },
          { label: "Total debits", value: formatMoney(debits, currency) },
        ],
      },
    };
  },
  async execute(tx: Tx, userId: string, input: z.infer<typeof reversalSchema>, mayUse: MayUse): Promise<Posted> {
    const e = await reverseManualJournal(tx, userId, input.id, input.date, mayUse);
    return { id: e.id, number: e.number, href: `/accounting/journals/${e.id}` };
  },
};

export const KINDS: Record<string, KindDef> = {
  PurchaseOrder: purchaseOrder as unknown as KindDef,
  SupplierPayment: supplierPayment as unknown as KindDef,
  BillVoid: billVoid as unknown as KindDef,
  SalesInvoice: salesInvoice as unknown as KindDef,
  InvoiceVoid: invoiceVoid as unknown as KindDef,
  CashOut: cashOut as unknown as KindDef,
  ManualJournal: manualJournal as unknown as KindDef,
  JournalReversal: journalReversal as unknown as KindDef,
};
export type KindKey = keyof typeof KINDS;
