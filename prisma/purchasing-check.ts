// End-to-end check of purchasing: PO → two receipts → bill (goods + expense) → two payments → void.
// Everything runs in ONE transaction that is rolled back at the end, so the database is left unchanged.
// Run: npx tsx --conditions=react-server prisma/purchasing-check.ts
import { Prisma } from "@prisma/client";
import { db } from "@/core/db";
import { recordMovement } from "@/modules/inventory/posting";
import { postBill, postOrder, postSupplierPayment, receiveOrder, voidBill } from "@/modules/purchasing/posting";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const yes = () => true;
class Rollback extends Error {}
let failures = 0;
function check(label: string, actual: Prisma.Decimal.Value, expected: Prisma.Decimal.Value) {
  const ok = D(actual).equals(D(expected));
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${D(actual).toString()}${ok ? "" : ` (expected ${D(expected).toString()})`}`);
}

async function balance(tx: Prisma.TransactionClient, key: string, where: Prisma.JournalLineWhereInput) {
  const { _sum } = await tx.journalLine.aggregate({ where: { ...where, account: { systemKey: key } }, _sum: { debit: true, credit: true } });
  return (_sum.debit ?? D(0)).minus(_sum.credit ?? D(0));
}

async function main() {
  const admin = await db.user.findFirstOrThrow({ where: { roles: { some: { role: { permissions: { some: { permission: "*" } } } } } } });
  const warehouse = await db.warehouse.findFirstOrThrow({ where: { isActive: true } });
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  await db
    .$transaction(
      async (tx) => {
        const u = admin.id;
        const product = await tx.product.create({ data: { sku: `ZZ-TEST-${Date.now()}`, name: "Purchasing check", cost: 100 } });
        const supplier = await tx.supplier.create({ data: { code: `ZZT${Date.now() % 100000}`, name: "Test Supplier", ewtRate: 1, termsDays: 30 } });
        const other = await tx.account.findFirstOrThrow({ where: { systemKey: "OTHER_EXPENSE" } });
        const opening = await recordMovement(tx, u, { type: "RECEIPT", productId: product.id, warehouseId: warehouse.id, qty: "10", reference: "OPENING", note: "" }, yes);
        if ("error" in opening) throw new Error(opening.error);

        // PO for 20 @ 130 + VAT
        const po = await postOrder(tx, u, { supplierId: supplier.id, warehouseId: warehouse.id, date: today, expectedDate: "", reference: "", note: "", lines: [{ productId: product.id, qty: "20", unitCost: "130", vatCode: "VAT" }] }, yes);
        check("PO subtotal", po.subtotal, 2600);
        check("PO VAT", po.vat, 312);

        // Receive 5, then 15: moving average 100 → 110 → 120
        const r1 = await receiveOrder(tx, u, { orderId: po.id, reference: "DR-1", note: "", lines: [{ orderLineId: po.lines[0].id, qty: "5" }] }, yes);
        check("cost after first receipt", (await tx.product.findUniqueOrThrow({ where: { id: product.id } })).cost, 110);
        check("inventory = 15 × 110", await balance(tx, "INVENTORY", { productId: product.id }), 1650);
        const r2 = await receiveOrder(tx, u, { orderId: po.id, reference: "DR-2", note: "", lines: [{ orderLineId: po.lines[0].id, qty: "15" }] }, yes);
        check("cost after second receipt", (await tx.product.findUniqueOrThrow({ where: { id: product.id } })).cost, 120);
        check("inventory = 30 × 120", await balance(tx, "INVENTORY", { productId: product.id }), 3600);
        check("GRNI owed for 20 × 130", (await balance(tx, "GRNI", { supplierId: supplier.id })).negated(), 2600);
        check("PO fully received", (await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status === "RECEIVED" ? 1 : 0, 1);
        const overReceive = await receiveOrder(tx, u, { orderId: po.id, reference: "", note: "", lines: [{ orderLineId: po.lines[0].id, qty: "1" }] }, yes).then(() => "allowed", (e) => e.message);
        check("cannot receive on a received PO", overReceive === "allowed" ? 0 : 1, 1);

        // Bill both receipts + ₱500 freight (VAT)
        const lineIds = [...r1.lines, ...r2.lines].map((l) => l.id);
        const bill = await postBill(tx, u, { supplierId: supplier.id, branchId: warehouse.branchId, supplierInvoiceNo: "SI-001", date: today, dueDate: "", ewtRate: "1", atc: "WC158", note: "", receiptLineIds: lineIds, expenses: [{ accountId: other.id, description: "Freight", amount: "500", vatCode: "VAT" }] }, yes);
        check("bill net", bill.subtotal, 3100);
        check("bill VAT", bill.vat, 372);
        check("bill total", bill.total, 3472);
        check("GRNI cleared", await balance(tx, "GRNI", { supplierId: supplier.id }), 0);
        check("AP for the supplier", (await balance(tx, "AP", { supplierId: supplier.id })).negated(), 3472);
        const dup = await postBill(tx, u, { supplierId: supplier.id, branchId: warehouse.branchId, supplierInvoiceNo: "SI-001", date: today, dueDate: "", ewtRate: "0", atc: "", note: "", receiptLineIds: [], expenses: [{ accountId: other.id, description: "x", amount: "1", vatCode: "VAT" }] }, yes).then(() => "allowed", (e) => e.message);
        check("same supplier invoice twice refused", dup === "allowed" ? 0 : 1, 1);
        const twice = await postBill(tx, u, { supplierId: supplier.id, branchId: warehouse.branchId, supplierInvoiceNo: "SI-002", date: today, dueDate: "", ewtRate: "0", atc: "", note: "", receiptLineIds: lineIds, expenses: [] }, yes).then(() => "allowed", (e) => e.message);
        check("received goods billed twice refused", twice === "allowed" ? 0 : 1, 1);

        // Pay 1,000 then the rest; EWT = 1% of 3,100 = 31.00 in total
        const p1 = await postSupplierPayment(tx, u, { supplierId: supplier.id, date: today, method: "CHECK", reference: "CHK-1", note: "", allocations: [{ billId: bill.id, amount: "1000" }] }, yes);
        check("first payment EWT (1000 × 3100/3472 × 1%)", p1.ewt, 8.93);
        const p2 = await postSupplierPayment(tx, u, { supplierId: supplier.id, date: today, method: "CHECK", reference: "CHK-2", note: "", allocations: [{ billId: bill.id, amount: "2472" }] }, yes);
        check("total EWT withheld", p1.ewt.plus(p2.ewt), 31);
        check("cash paid", p1.net.plus(p2.net), 3441);
        check("AP for the supplier settled", await balance(tx, "AP", { supplierId: supplier.id }), 0);
        check("EWT payable", (await balance(tx, "WT_PAYABLE", { supplierId: supplier.id })).negated(), 31);
        const overpay = await postSupplierPayment(tx, u, { supplierId: supplier.id, date: today, method: "CASH", reference: "", note: "", allocations: [{ billId: bill.id, amount: "1" }] }, yes).then(() => "allowed", (e) => e.message);
        check("overpaying refused", overpay === "allowed" ? 0 : 1, 1);

        // A second (expense-only) bill, voided
        const b2 = await postBill(tx, u, { supplierId: supplier.id, branchId: warehouse.branchId, supplierInvoiceNo: "SI-003", date: today, dueDate: "", ewtRate: "2", atc: "WC160", note: "", receiptLineIds: [], expenses: [{ accountId: other.id, description: "Repairs", amount: "1000", vatCode: "VAT" }] }, yes);
        await voidBill(tx, u, b2.id, yes);
        check("void bill leaves AP at zero", await balance(tx, "AP", { supplierId: supplier.id }), 0);
        const voidPaid = await voidBill(tx, u, bill.id, yes).then(() => "allowed", (e) => e.message);
        check("paid bill cannot be voided", voidPaid === "allowed" ? 0 : 1, 1);

        // Database guard: posted rows cannot be edited
        const guard = await tx.$executeRaw`SAVEPOINT g`.then(() => tx.supplierBill.update({ where: { id: bill.id }, data: { total: 1 } })).then(() => "allowed", (e) => String(e.message));
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT g`;
        check("database refuses editing a posted bill", guard.includes("cannot be changed") ? 1 : 0, 1);

        throw new Rollback();
      },
      { timeout: 180_000, maxWait: 20_000 },
    )
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Transaction rolled back; nothing was saved.");
  await db.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
