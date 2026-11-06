import "server-only";
import { Prisma } from "@prisma/client";
import { audit } from "@/core/audit";
import { nextNumber } from "@/core/numbering";
import { assertPeriodOpen, PostingError } from "@/core/posting";
import { CONTROL_ACCOUNTS } from "@/modules/accounting/module";
import { journalForCostChange, postJournal, reverseJournal, today, type LineInput } from "@/modules/accounting/ledger";
import { recordMovement } from "@/modules/inventory/posting";
import { VAT_RATE } from "./module";
import type { BillInput, OrderInput, ReceiptInput, SupplierPaymentInput } from "./schemas";

// The write side of purchasing. Each function runs inside the caller's posting transaction (runPosting)
// and throws PostingError to roll everything back, stock and journal entries included.
//
// Accounting:
//   receipt  Dr Inventory (at the product's current cost) + Dr/Cr purchase price difference / Cr GRNI (at PO cost),
//            then the product's cost moves to the new moving average and stock on hand is revalued.
//   bill     Dr GRNI (received goods) + Dr expense accounts + Dr Input VAT / Cr Accounts payable
//   payment  Dr Accounts payable / Cr Cash (net) + Cr Withholding tax payable (EWT)

type Tx = Prisma.TransactionClient;
type MayUse = (branchId: string) => boolean;
const ZERO = new Prisma.Decimal(0);
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const sum = <T>(rows: T[], get: (r: T) => Prisma.Decimal) => rows.reduce((s, r) => s.plus(get(r)), ZERO);
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Input VAT of a net amount. A non-VAT supplier never charges VAT, whatever the line says. */
export const vatOf = (net: Prisma.Decimal, vatCode: string) => (vatCode === "VAT" ? money(net.times(VAT_RATE)) : ZERO);
const effectiveCode = (vatCode: string, vatRegistered: boolean) => (vatRegistered ? vatCode : "EXEMPT");

/** Rows are locked until the transaction ends, so two people cannot receive, bill or pay the same thing at once. */
async function lock(tx: Tx, table: "PurchaseOrder" | "GoodsReceiptLine" | "SupplierBill", ids: string[]) {
  if (ids.length === 0) return;
  await tx.$executeRaw`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE "id" IN (${Prisma.join(ids)}) FOR UPDATE`;
}

// ───────────────────────── Purchase orders ─────────────────────────

export async function postOrder(tx: Tx, userId: string, input: OrderInput, mayUse: MayUse) {
  const [supplier, warehouse, products] = await Promise.all([
    tx.supplier.findUnique({ where: { id: input.supplierId } }),
    tx.warehouse.findUnique({ where: { id: input.warehouseId }, include: { branch: true } }),
    tx.product.findMany({ where: { id: { in: input.lines.map((l) => l.productId) } } }),
  ]);
  if (!supplier?.isActive) throw new PostingError("That supplier is inactive or missing.");
  if (!warehouse?.isActive) throw new PostingError("That warehouse is inactive or missing.");
  if (!mayUse(warehouse.branchId)) throw new PostingError("That warehouse is in a branch you cannot use.");
  const productById = new Map(products.map((p) => [p.id, p]));

  const lines = input.lines.map((l, i) => {
    const product = productById.get(l.productId);
    if (!product?.isActive) throw new PostingError(`Line ${i + 1}: that product is inactive or missing.`);
    const qty = D(l.qty);
    const unitCost = D(l.unitCost);
    const vatCode = effectiveCode(l.vatCode, supplier.vatRegistered);
    const amount = money(qty.times(unitCost));
    return { productId: product.id, qty, unitCost, vatCode, amount, vat: vatOf(amount, vatCode) };
  });
  const subtotal = sum(lines, (l) => l.amount);
  const vat = sum(lines, (l) => l.vat);

  const number = await nextNumber(tx, "PurchaseOrder", { branchCode: warehouse.branch.code, date: input.date });
  const order = await tx.purchaseOrder.create({
    data: {
      number,
      supplierId: supplier.id,
      branchId: warehouse.branchId,
      warehouseId: warehouse.id,
      date: input.date,
      expectedDate: input.expectedDate || null,
      subtotal,
      vat,
      total: subtotal.plus(vat),
      reference: input.reference,
      note: input.note,
      createdById: userId,
      lines: { create: lines },
    },
    include: { lines: true },
  });
  await audit({ userId, action: "create", entity: "PurchaseOrder", entityId: order.id, after: order }, tx);
  return order;
}

/** What is still to come on each line of an order. */
export async function remainingByLine(tx: Tx, orderId: string) {
  const lines = await tx.purchaseOrderLine.findMany({ where: { orderId }, include: { receiptLines: { select: { qty: true } } } });
  return new Map(lines.map((l) => [l.id, { line: l, received: sum(l.receiptLines, (r) => r.qty), remaining: l.qty.minus(sum(l.receiptLines, (r) => r.qty)) }]));
}

/** Short-closes an order (no more receipts expected) or cancels one nothing was received on. */
export async function finishOrder(tx: Tx, userId: string, orderId: string, how: "CLOSED" | "CANCELLED", mayUse: MayUse) {
  await lock(tx, "PurchaseOrder", [orderId]);
  const before = await tx.purchaseOrder.findUnique({ where: { id: orderId }, include: { _count: { select: { receipts: true } } } });
  if (!before) throw new PostingError("That purchase order does not exist.");
  if (!mayUse(before.branchId)) throw new PostingError("This purchase order belongs to a branch you cannot use.");
  if (!["OPEN", "PARTIAL"].includes(before.status)) throw new PostingError("Only open or partly received orders can be closed or cancelled.");
  if (how === "CANCELLED" && before._count.receipts > 0) throw new PostingError("Goods were already received on this order; close it instead.");
  if (how === "CLOSED" && before._count.receipts === 0) throw new PostingError("Nothing was received on this order; cancel it instead.");
  const after = await tx.purchaseOrder.update({ where: { id: orderId }, data: { status: how, closedAt: new Date() } });
  await audit({ userId, action: how === "CLOSED" ? "close" : "cancel", entity: "PurchaseOrder", entityId: orderId, before, after }, tx);
  return after;
}

// ───────────────────────── Receiving ─────────────────────────

/**
 * Receives goods against an order, dated today like every stock movement. Each line brings stock in at
 * the PO cost: the product's cost becomes the moving average of what was on hand and what arrived, and the
 * stock on hand is revalued to it, so inventory in the books always equals quantity × current cost.
 */
export async function receiveOrder(tx: Tx, userId: string, input: ReceiptInput, mayUse: MayUse) {
  await lock(tx, "PurchaseOrder", [input.orderId]);
  const order = await tx.purchaseOrder.findUnique({ where: { id: input.orderId }, include: { branch: true, warehouse: true } });
  if (!order) throw new PostingError("That purchase order does not exist.");
  if (!mayUse(order.branchId)) throw new PostingError("This purchase order belongs to a branch you cannot use.");
  if (!["OPEN", "PARTIAL"].includes(order.status)) throw new PostingError("Goods can only be received on open orders.");
  if (!order.warehouse.isActive) throw new PostingError("The order's warehouse is inactive.");
  const date = today();
  await assertPeriodOpen(tx, date);

  const remaining = await remainingByLine(tx, order.id);
  const lines = input.lines.map((l, i) => {
    const r = remaining.get(l.orderLineId);
    if (!r) throw new PostingError(`Line ${i + 1} is not on this order.`);
    const qty = D(l.qty);
    if (qty.greaterThan(r.remaining))
      throw new PostingError(`Line ${i + 1}: only ${r.remaining.toString()} is still to be received.`);
    return { orderLineId: r.line.id, productId: r.line.productId, qty, unitCost: r.line.unitCost, vatCode: r.line.vatCode, amount: money(qty.times(r.line.unitCost)) };
  });

  const number = await nextNumber(tx, "GoodsReceipt", { branchCode: order.branch.code, date });
  const receipt = await tx.goodsReceipt.create({
    data: {
      number,
      orderId: order.id,
      supplierId: order.supplierId,
      branchId: order.branchId,
      warehouseId: order.warehouseId,
      date,
      total: sum(lines, (l) => l.amount),
      reference: input.reference,
      note: input.note,
      createdById: userId,
      lines: { create: lines },
    },
    include: { lines: true },
  });
  await audit({ userId, action: "create", entity: "GoodsReceipt", entityId: receipt.id, after: receipt }, tx);

  const journal: LineInput[] = [];
  const common = { branchId: order.branchId };
  for (const line of lines) {
    const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
    const { _sum } = await tx.stockMovement.aggregate({ where: { productId: product.id }, _sum: { qty: true } });
    const onHand = _sum.qty ?? ZERO;

    const result = await recordMovement(
      tx,
      userId,
      { type: "RECEIPT", productId: product.id, warehouseId: order.warehouseId, qty: line.qty.toString(), reference: number, note: `Received on ${order.number}` },
      mayUse,
      { journal: false },
    );
    if ("error" in result) throw new PostingError(result.error);

    // In at today's cost; the difference to the PO cost is settled by the revaluation below.
    journal.push(
      { ...common, account: "INVENTORY", debit: money(line.qty.times(product.cost)), productId: product.id },
      { ...common, account: "INV_ADJ", debit: line.amount.minus(money(line.qty.times(product.cost))), productId: product.id },
      { ...common, account: "GRNI", credit: line.amount, supplierId: order.supplierId, memo: product.sku },
    );
    const newCost = onHand.plus(line.qty).lessThanOrEqualTo(0)
      ? line.unitCost
      : onHand.times(product.cost).plus(line.qty.times(line.unitCost)).div(onHand.plus(line.qty)).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (!newCost.equals(product.cost)) {
      const updated = await tx.product.update({ where: { id: product.id }, data: { cost: newCost } });
      await audit({ userId, action: "update", entity: "Product", entityId: product.id, before: { cost: product.cost }, after: { cost: updated.cost, reason: `Average cost on ${number}` } }, tx);
      // Revalue everything on hand (this line's stock included) right away, so a second line of the same
      // product starts from the new cost and nothing is counted twice.
      await journalForCostChange(tx, userId, product, product.cost, newCost, `Average cost on ${number}`);
    }
  }
  await postJournal(tx, { date, sourceType: "GoodsReceipt", sourceId: receipt.id, sourceNumber: number, memo: `Received on ${order.number}`, userId, lines: journal });

  // The order's status follows what is left to receive.
  const after = await remainingByLine(tx, order.id);
  const done = [...after.values()].every((r) => r.remaining.lessThanOrEqualTo(0));
  await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: done ? "RECEIVED" : "PARTIAL" } });
  return receipt;
}

// ───────────────────────── Supplier bills ─────────────────────────

/** Received lines not yet on a posted bill. */
export async function unbilledReceiptLines(tx: Tx, where: Prisma.GoodsReceiptLineWhereInput) {
  return tx.goodsReceiptLine.findMany({
    where: { ...where, billLines: { none: { bill: { status: "POSTED" } } } },
    include: { receipt: true, product: true },
    orderBy: [{ receipt: { date: "asc" } }, { receipt: { number: "asc" } }],
  });
}

export async function postBill(tx: Tx, userId: string, input: BillInput, mayUse: MayUse) {
  if (input.receiptLineIds.length === 0 && input.expenses.length === 0) throw new PostingError("Add received goods or an expense line to bill.");
  const [supplier, branch] = await Promise.all([tx.supplier.findUnique({ where: { id: input.supplierId } }), tx.branch.findUnique({ where: { id: input.branchId } })]);
  if (!supplier?.isActive) throw new PostingError("That supplier is inactive or missing.");
  if (!branch?.isActive || !mayUse(branch.id)) throw new PostingError("You cannot post bills to that branch.");
  await assertPeriodOpen(tx, input.date);

  const duplicate = await tx.supplierBill.findFirst({ where: { supplierId: supplier.id, supplierInvoiceNo: input.supplierInvoiceNo, status: "POSTED" } });
  if (duplicate) throw new PostingError(`Invoice ${input.supplierInvoiceNo} of this supplier is already on ${duplicate.number}.`);

  await lock(tx, "GoodsReceiptLine", input.receiptLineIds);
  const received = await unbilledReceiptLines(tx, { id: { in: input.receiptLineIds } });
  if (received.length !== new Set(input.receiptLineIds).size) throw new PostingError("Some of the received goods were billed already or no longer exist. Reload the page.");
  for (const r of received) {
    if (r.receipt.supplierId !== supplier.id) throw new PostingError(`${r.receipt.number} is from another supplier.`);
    if (r.receipt.branchId !== branch.id) throw new PostingError(`${r.receipt.number} belongs to another branch.`);
  }

  const accounts = await tx.account.findMany({ where: { id: { in: input.expenses.map((e) => e.accountId) } } });
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const expenses = input.expenses.map((e, i) => {
    const account = accountById.get(e.accountId);
    if (!account?.isActive) throw new PostingError(`Expense line ${i + 1}: that account is inactive or missing.`);
    if (account.systemKey && (CONTROL_ACCOUNTS as string[]).concat(["CASH", "INPUT_VAT"]).includes(account.systemKey))
      throw new PostingError(`Expense line ${i + 1}: ${account.code} · ${account.name} cannot be billed directly.`);
    const amount = money(D(e.amount));
    const vatCode = effectiveCode(e.vatCode, supplier.vatRegistered);
    return { accountId: account.id, description: e.description || account.name, qty: D(1), unitCost: amount, vatCode, amount, vat: vatOf(amount, vatCode) };
  });
  const goods = received.map((r) => {
    const vatCode = effectiveCode(r.vatCode, supplier.vatRegistered);
    return { receiptLineId: r.id, productId: r.productId, description: `${r.product.sku} · ${r.receipt.number}`, qty: r.qty, unitCost: r.unitCost, vatCode, amount: r.amount, vat: vatOf(r.amount, vatCode) };
  });
  const lines = [...goods, ...expenses];
  const subtotal = sum(lines, (l) => l.amount);
  const vat = sum(lines, (l) => l.vat);
  const total = subtotal.plus(vat);
  if (!total.greaterThan(0)) throw new PostingError("The bill total must be more than zero.");

  const number = await nextNumber(tx, "SupplierBill", { branchCode: branch.code, date: input.date });
  const bill = await tx.supplierBill.create({
    data: {
      number,
      supplierId: supplier.id,
      branchId: branch.id,
      supplierInvoiceNo: input.supplierInvoiceNo,
      date: input.date,
      dueDate: input.dueDate || addDays(input.date, supplier.termsDays),
      subtotal,
      vat,
      total,
      ewtRate: D(input.ewtRate),
      atc: input.atc,
      note: input.note,
      createdById: userId,
      lines: { create: lines },
    },
    include: { lines: true },
  });
  await audit({ userId, action: "create", entity: "SupplierBill", entityId: bill.id, after: bill }, tx);

  const common = { branchId: branch.id };
  await postJournal(tx, {
    date: input.date,
    sourceType: "SupplierBill",
    sourceId: bill.id,
    sourceNumber: number,
    memo: `Bill ${input.supplierInvoiceNo} · ${supplier.name}`,
    userId,
    lines: [
      ...goods.map((g) => ({ ...common, account: "GRNI" as const, debit: g.amount, supplierId: supplier.id, productId: g.productId })),
      ...expenses.map((e) => ({ ...common, account: { id: e.accountId }, debit: e.amount, memo: e.description })),
      { ...common, account: "INPUT_VAT", debit: vat },
      { ...common, account: "AP", credit: total, supplierId: supplier.id },
    ],
  });
  return bill;
}

/** Voids an unpaid bill: its entry is reversed on the bill date and its received goods can be billed again. */
export async function voidBill(tx: Tx, userId: string, billId: string, mayUse: MayUse) {
  await lock(tx, "SupplierBill", [billId]);
  const before = await tx.supplierBill.findUnique({ where: { id: billId }, include: { _count: { select: { allocations: true } } } });
  if (!before) throw new PostingError("That bill does not exist.");
  if (!mayUse(before.branchId)) throw new PostingError("This bill belongs to a branch you cannot use.");
  if (before.status === "VOID") throw new PostingError("This bill is already void.");
  if (before._count.allocations > 0) throw new PostingError("Payments were made on this bill; it cannot be voided.");
  await assertPeriodOpen(tx, before.date);

  const original = await tx.journalEntry.findUnique({ where: { sourceType_sourceId: { sourceType: "SupplierBill", sourceId: billId } } });
  if (original) await reverseJournal(tx, original.id, { date: before.date, sourceType: "SupplierBillVoid", sourceId: billId, memo: `Void of ${before.number}`, userId });
  const after = await tx.supplierBill.update({ where: { id: billId }, data: { status: "VOID", voidedAt: new Date() } });
  await audit({ userId, action: "void", entity: "SupplierBill", entityId: billId, before, after }, tx);
  return after;
}

/** Applied so far (cash + withholding) and withheld so far, per bill. */
export async function settledByBill(tx: Tx, billIds: string[]) {
  const rows = await tx.supplierPaymentLine.groupBy({ by: ["billId"], where: { billId: { in: billIds } }, _sum: { amount: true, ewt: true } });
  return new Map(rows.map((r) => [r.billId, { applied: r._sum.amount ?? ZERO, ewt: r._sum.ewt ?? ZERO }]));
}

/** Withholding on a bill as a whole: its rate on the amount net of VAT. */
export const billEwt = (b: { subtotal: Prisma.Decimal; ewtRate: Prisma.Decimal }) => money(b.subtotal.times(b.ewtRate).div(100));

// ───────────────────────── Payments made ─────────────────────────

/**
 * Pays one or more bills of a supplier in one branch. Each bill is reduced by the amount applied; the
 * withholding on that part (bill rate × the applied share of its net-of-VAT amount) is kept for the BIR,
 * so the cash paid is the applied total less withholding. The last payment of a bill takes whatever
 * withholding is left, so a bill's withholding always adds up exactly.
 */
export async function postSupplierPayment(tx: Tx, userId: string, input: SupplierPaymentInput, mayUse: MayUse) {
  const ids = input.allocations.map((a) => a.billId);
  if (new Set(ids).size !== ids.length) throw new PostingError("A bill is listed twice.");
  await lock(tx, "SupplierBill", ids);
  const [supplier, bills] = await Promise.all([
    tx.supplier.findUnique({ where: { id: input.supplierId } }),
    tx.supplierBill.findMany({ where: { id: { in: ids } }, include: { branch: true } }),
  ]);
  if (!supplier) throw new PostingError("That supplier does not exist.");
  if (bills.length !== ids.length) throw new PostingError("One of the bills no longer exists.");
  const branchIds = new Set(bills.map((b) => b.branchId));
  if (branchIds.size > 1) throw new PostingError("Pay the bills of one branch at a time.");
  const branch = bills[0].branch;
  if (!mayUse(branch.id)) throw new PostingError("These bills belong to a branch you cannot use.");
  await assertPeriodOpen(tx, input.date);

  const settled = await settledByBill(tx, ids);
  const billById = new Map(bills.map((b) => [b.id, b]));
  const lines = input.allocations.map((a) => {
    const bill = billById.get(a.billId)!;
    if (bill.supplierId !== supplier.id) throw new PostingError(`${bill.number} is another supplier's bill.`);
    if (bill.status !== "POSTED") throw new PostingError(`${bill.number} is void.`);
    const done = settled.get(bill.id) ?? { applied: ZERO, ewt: ZERO };
    const outstanding = bill.total.minus(done.applied);
    const amount = money(D(a.amount));
    if (amount.greaterThan(outstanding)) throw new PostingError(`Only ${outstanding.toFixed(2)} is still owed on ${bill.number}.`);
    const ewt = amount.equals(outstanding)
      ? billEwt(bill).minus(done.ewt)
      : money(amount.times(bill.subtotal).div(bill.total).times(bill.ewtRate).div(100));
    return { billId: bill.id, amount, ewt: Prisma.Decimal.max(ZERO, Prisma.Decimal.min(ewt, amount)) };
  });
  const gross = sum(lines, (l) => l.amount);
  const ewt = sum(lines, (l) => l.ewt);

  const number = await nextNumber(tx, "SupplierPayment", { branchCode: branch.code, date: input.date });
  const payment = await tx.supplierPayment.create({
    data: {
      number,
      supplierId: supplier.id,
      branchId: branch.id,
      date: input.date,
      method: input.method,
      reference: input.reference,
      note: input.note,
      gross,
      ewt,
      net: gross.minus(ewt),
      createdById: userId,
      lines: { create: lines },
    },
    include: { lines: true },
  });
  await audit({ userId, action: "create", entity: "SupplierPayment", entityId: payment.id, after: payment }, tx);

  const common = { branchId: branch.id };
  await postJournal(tx, {
    date: input.date,
    sourceType: "SupplierPayment",
    sourceId: payment.id,
    sourceNumber: number,
    memo: `Payment to ${supplier.name}`,
    userId,
    lines: [
      { ...common, account: "AP", debit: gross, supplierId: supplier.id },
      { ...common, account: "CASH", credit: gross.minus(ewt) },
      { ...common, account: "WT_PAYABLE", credit: ewt, supplierId: supplier.id, memo: "Expanded withholding tax" },
    ],
  });
  return payment;
}
