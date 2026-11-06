import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";

/**
 * On-hand quantity per product+warehouse, from the movement ledger. Zero rows are dropped.
 * Pass `branchIds` (usually getBranchScope().ids) to only count warehouses of those branches.
 */
export async function getStockLevels(where: { productId?: string; branchIds?: string[] } = {}) {
  const rows = await db.stockMovement.groupBy({
    by: ["productId", "warehouseId"],
    where: {
      productId: where.productId,
      ...(where.branchIds && { warehouse: { branchId: { in: where.branchIds } } }),
    },
    _sum: { qty: true },
  });
  return rows
    .map((r) => ({ productId: r.productId, warehouseId: r.warehouseId, qty: r._sum.qty ?? new Prisma.Decimal(0) }))
    .filter((r) => !r.qty.isZero());
}

export async function getOnHand(productId: string, warehouseId: string, tx: Prisma.TransactionClient = db) {
  const { _sum } = await tx.stockMovement.aggregate({ where: { productId, warehouseId }, _sum: { qty: true } });
  return _sum.qty ?? new Prisma.Decimal(0);
}

/** Every item class with who last changed it, for the Item Classes tree and parent pickers. */
export async function getItemClasses() {
  const rows = await db.itemClass.findMany({
    orderBy: { description: "asc" },
    include: { updatedBy: { select: { name: true } }, itemType: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    itemTypeId: r.itemTypeId,
    itemType: r.itemType.name,
    parentId: r.parentId,
    description: r.description,
    modifiedBy: r.updatedBy?.name ?? "",
    modifiedAt: formatDateTime(r.updatedAt),
  }));
}

export type ItemClassRow = Awaited<ReturnType<typeof getItemClasses>>[number];

/** "CHEMICALS › DEGREASER": a class's description after those of its parents. */
export function itemClassPath(byId: Map<string, Pick<ItemClassRow, "parentId" | "description">>, id: string) {
  const parts: string[] = [];
  for (let at = byId.get(id); at; at = at.parentId ? byId.get(at.parentId) : undefined) parts.unshift(at.description);
  return parts.join(" › ");
}

/** Item types in their set order, with how many classes each has (a type in use cannot be deleted). */
export async function getItemTypes() {
  const rows = await db.itemType.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { updatedBy: { select: { name: true } }, _count: { select: { classes: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
    classCount: r._count.classes,
    modifiedBy: r.updatedBy?.name ?? "",
    modifiedAt: formatDateTime(r.updatedAt),
  }));
}

export type ItemTypeRow = Awaited<ReturnType<typeof getItemTypes>>[number];
