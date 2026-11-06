import "server-only";
import { Prisma } from "@prisma/client";
import { audit } from "@/core/audit";
import { nextNumber } from "@/core/numbering";
import { assertPeriodOpen } from "@/core/posting";
import { journalForMovement, today } from "@/modules/accounting/ledger";
import { getOnHand } from "./queries";
import type { MovementInput } from "./schemas";

/**
 * Posts one stock movement inside a transaction: checks product, warehouses (active and in a branch the
 * user may use) and stock, takes the next document number and writes the ledger lines with audit entries.
 * Writes the movement's journal entry too, unless `journal: false` (a sales invoice journals its own stock).
 * Used by the movement form, the Excel import and sales invoices. Throws PostingError when the month is closed.
 */
export async function recordMovement(
  tx: Prisma.TransactionClient,
  userId: string,
  m: MovementInput,
  mayUseBranch: (branchId: string) => boolean,
  { journal = true }: { journal?: boolean } = {},
): Promise<{ error: string } | { number: string }> {
  await assertPeriodOpen(tx, today());
  const qty = new Prisma.Decimal(m.qty);

  // RECEIPT adds, ISSUE removes, ADJUSTMENT is signed as entered, TRANSFER is out of source + into destination.
  const lines: { warehouseId: string; qty: Prisma.Decimal; type: string }[] =
    m.type === "RECEIPT"
      ? [{ warehouseId: m.warehouseId, qty, type: "RECEIPT" }]
      : m.type === "ISSUE"
        ? [{ warehouseId: m.warehouseId, qty: qty.negated(), type: "ISSUE" }]
        : m.type === "ADJUSTMENT"
          ? [{ warehouseId: m.warehouseId, qty, type: "ADJUSTMENT" }]
          : [
              { warehouseId: m.warehouseId, qty: qty.negated(), type: "TRANSFER_OUT" },
              { warehouseId: m.toWarehouseId!, qty, type: "TRANSFER_IN" },
            ];

  const [product, warehouses] = await Promise.all([
    tx.product.findUnique({ where: { id: m.productId } }),
    tx.warehouse.findMany({ where: { id: { in: lines.map((l) => l.warehouseId) }, isActive: true }, include: { branch: true } }),
  ]);
  if (!product?.isActive) return { error: "That product is inactive or missing." };
  if (warehouses.length !== lines.length) return { error: "One of the warehouses is inactive or missing." };
  if (warehouses.some((w) => !mayUseBranch(w.branchId))) return { error: "One of the warehouses is in a branch you cannot use." };

  // Never let stock go below zero.
  for (const line of lines.filter((l) => l.qty.isNegative())) {
    const onHand = await getOnHand(m.productId, line.warehouseId, tx);
    if (onHand.plus(line.qty).isNegative())
      return { error: `Not enough stock of ${product.sku}: only ${onHand.toString()} ${product.unit} on hand.` };
  }

  // The source warehouse's branch owns the number; both lines of a transfer share it.
  const source = warehouses.find((w) => w.id === m.warehouseId)!;
  const number = await nextNumber(tx, "StockMovement", { branchCode: source.branch.code });

  let firstId = "";
  for (const line of lines) {
    const created = await tx.stockMovement.create({
      data: {
        number,
        productId: m.productId,
        warehouseId: line.warehouseId,
        qty: line.qty,
        type: line.type,
        reference: m.reference,
        note: m.note,
        createdById: userId,
      },
    });
    firstId ||= created.id;
    await audit({ userId, action: "create", entity: "StockMovement", entityId: created.id, after: created }, tx);
  }
  if (journal) {
    const branchOf = new Map(warehouses.map((w) => [w.id, w.branchId]));
    await journalForMovement(tx, userId, {
      id: firstId,
      number,
      type: m.type,
      reference: m.reference,
      product,
      lines: lines.map((l) => ({ qty: l.qty, branchId: branchOf.get(l.warehouseId)! })),
      date: today(),
    });
  }
  return { number };
}
