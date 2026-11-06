import "server-only";
import { Prisma } from "@prisma/client";
import { audit } from "@/core/audit";
import { nextNumber } from "@/core/numbering";
import { assertPeriodOpen, PostingError } from "@/core/posting";
import { journalForInvoice, journalForInvoiceVoid, journalForPayment, pair, postJournal, today } from "@/modules/accounting/ledger";
import { recordMovement } from "@/modules/inventory/posting";
import type { InvoiceInput, PaymentInput } from "./schemas";

const ZERO = new Prisma.Decimal(0);
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** What is still owed on an invoice. */
export async function outstandingOf(tx: Prisma.TransactionClient, invoiceId: string, total: Prisma.Decimal) {
  const { _sum } = await tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
  return total.minus(_sum.amount ?? ZERO);
}

/**
 * Posts a sales invoice inside a transaction: checks the customer and warehouse, snapshots each product's
 * cost (for gross margin), takes the invoice number, issues the stock (one ISSUE movement per line,
 * with the invoice number as reference) and writes the journal entry (receivable, sales, cost of goods sold,
 * inventory). Throws PostingError on any problem, which rolls back the whole invoice, stock included.
 */
export async function postInvoice(
  tx: Prisma.TransactionClient,
  userId: string,
  input: InvoiceInput,
  mayUseBranch: (branchId: string) => boolean,
) {
  const [customer, warehouse, products] = await Promise.all([
    tx.customer.findUnique({ where: { id: input.customerId } }),
    tx.warehouse.findUnique({ where: { id: input.warehouseId }, include: { branch: true } }),
    tx.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } }),
  ]);
  await assertPeriodOpen(tx, input.date);
  if (!customer?.isActive) throw new PostingError("That customer is inactive or missing.");
  if (!warehouse?.isActive) throw new PostingError("That warehouse is inactive or missing.");
  if (!mayUseBranch(warehouse.branchId)) throw new PostingError("That warehouse is in a branch you cannot use.");
  const productById = new Map(products.map((p) => [p.id, p]));

  const lines = input.lines.map((l, i) => {
    const product = productById.get(l.productId);
    if (!product?.isActive) throw new PostingError(`Line ${i + 1}: that product is inactive or missing.`);
    const qty = new Prisma.Decimal(l.qty);
    const unitPrice = new Prisma.Decimal(l.unitPrice);
    return {
      productId: product.id,
      qty,
      unitPrice,
      unitCost: product.cost,
      amount: qty.times(unitPrice).toDecimalPlaces(2),
      // Rounded per line, exactly as the journal credits inventory, so costTotal always equals the posted COGS.
      cost: qty.times(product.cost).toDecimalPlaces(2),
    };
  });
  const total = lines.reduce((s, l) => s.plus(l.amount), ZERO);
  const costTotal = lines.reduce((s, l) => s.plus(l.cost), ZERO);

  const number = await nextNumber(tx, "SalesInvoice", { branchCode: warehouse.branch.code, date: input.date });
  const invoice = await tx.salesInvoice.create({
    data: {
      number,
      customerId: customer.id,
      branchId: warehouse.branchId,
      warehouseId: warehouse.id,
      date: input.date,
      dueDate: input.dueDate || addDays(input.date, customer.termsDays),
      total,
      costTotal,
      reference: input.reference,
      note: input.note,
      createdById: userId,
      lines: { create: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, unitCost: l.unitCost, amount: l.amount })) },
    },
    include: { lines: true },
  });
  await audit({ userId, action: "create", entity: "SalesInvoice", entityId: invoice.id, after: invoice }, tx);

  for (const line of lines) {
    const result = await recordMovement(
      tx,
      userId,
      { type: "ISSUE", productId: line.productId, warehouseId: warehouse.id, qty: line.qty.toString(), reference: number, note: `Sales invoice ${number}` },
      mayUseBranch,
      { journal: false },
    );
    if ("error" in result) throw new PostingError(result.error);
  }
  await journalForInvoice(tx, userId, invoice);
  return invoice;
}

/**
 * Voids an unpaid invoice: receives its stock back and reverses its journal entry on the invoice date.
 * Only while the invoice's month is open; after closing, a correction belongs in the current month.
 */
export async function voidInvoice(
  tx: Prisma.TransactionClient,
  userId: string,
  invoiceId: string,
  mayUseBranch: (branchId: string) => boolean,
) {
  const before = await tx.salesInvoice.findUnique({ where: { id: invoiceId }, include: { lines: true, _count: { select: { payments: true } } } });
  if (!before) throw new PostingError("That invoice does not exist.");
  if (!mayUseBranch(before.branchId)) throw new PostingError("This invoice belongs to a branch you cannot use.");
  if (before.status === "VOID") throw new PostingError("This invoice is already void.");
  if (before._count.payments > 0) throw new PostingError("This invoice has payments recorded against it and cannot be voided.");
  await assertPeriodOpen(tx, before.date);

  for (const line of before.lines) {
    const result = await recordMovement(
      tx,
      userId,
      { type: "RECEIPT", productId: line.productId, warehouseId: before.warehouseId, qty: line.qty.toString(), reference: before.number, note: `Void of ${before.number}` },
      mayUseBranch,
      { journal: false },
    );
    if ("error" in result) throw new PostingError(result.error);
  }
  await journalForInvoiceVoid(tx, userId, before);
  // The reversal puts the goods back at the cost they left at; if a product's cost has changed since,
  // revalue the returned quantity to today's cost so inventory stays at quantity × current cost.
  const products = await tx.product.findMany({ where: { id: { in: before.lines.map((l) => l.productId) } } });
  const costNow = new Map(products.map((p) => [p.id, p.cost]));
  await postJournal(tx, {
    date: today(),
    sourceType: "CostChange",
    sourceNumber: before.number,
    memo: `Revaluation of stock returned by the void of ${before.number}`,
    userId,
    lines: before.lines.flatMap((l) =>
      pair("INVENTORY", "INV_ADJ", l.qty.times(costNow.get(l.productId)!.minus(l.unitCost)), { branchId: before.branchId, productId: l.productId }),
    ),
  });
  const after = await tx.salesInvoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date() } });
  await audit({ userId, action: "void", entity: "SalesInvoice", entityId: invoiceId, before, after }, tx);
  return after;
}

/** Records money received against an invoice; never more than is still owed. */
export async function postPayment(
  tx: Prisma.TransactionClient,
  userId: string,
  input: PaymentInput,
  mayUseBranch: (branchId: string) => boolean,
) {
  const invoice = await tx.salesInvoice.findUnique({ where: { id: input.invoiceId }, include: { branch: true } });
  if (!invoice) throw new PostingError("That invoice does not exist.");
  if (!mayUseBranch(invoice.branchId)) throw new PostingError("This invoice belongs to a branch you cannot use.");
  if (invoice.status !== "POSTED") throw new PostingError("Payments can only be recorded on posted invoices.");
  await assertPeriodOpen(tx, input.date);

  const amount = new Prisma.Decimal(input.amount);
  const outstanding = await outstandingOf(tx, invoice.id, invoice.total);
  if (amount.greaterThan(outstanding))
    throw new PostingError(`Only ${outstanding.toFixed(2)} is still owed on ${invoice.number}.`);

  const number = await nextNumber(tx, "Payment", { branchCode: invoice.branch.code, date: input.date });
  const payment = await tx.payment.create({
    data: { number, invoiceId: invoice.id, date: input.date, amount, method: input.method, reference: input.reference, note: input.note, createdById: userId },
  });
  await audit({ userId, action: "create", entity: "Payment", entityId: payment.id, after: payment }, tx);
  await journalForPayment(tx, userId, { ...payment, invoice });
  return payment;
}
