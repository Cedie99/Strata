import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { removeFile } from "@/core/storage";
import { customPermission } from "./custom/module";
import { P as INV } from "./inventory/module";

/**
 * Which records can have attachments, and who may see or change them: the same people who may
 * see or change the record itself. To support a new kind of record, add a case here.
 */
export async function requireAttachmentAccess(entity: string, entityId: string, level: "view" | "manage") {
  switch (entity) {
    case "Product": {
      const user = await requirePermission(level === "view" ? INV.view : INV.productsManage);
      if (!(await db.product.findUnique({ where: { id: entityId }, select: { id: true } }))) notFound();
      return { user, recordHref: `/inventory/products/${entityId}` };
    }
    case "Warehouse": {
      const user = await requirePermission(level === "view" ? INV.view : INV.warehousesManage);
      const [warehouse, scope] = await Promise.all([db.warehouse.findUnique({ where: { id: entityId } }), getBranchScope()]);
      if (!warehouse || !scope.mayUse(warehouse.branchId)) notFound();
      return { user, recordHref: `/inventory/warehouses/${entityId}` };
    }
    case "CustomRecord": {
      const record = await db.customRecord.findUnique({
        where: { id: entityId },
        include: { entity: { include: { module: true } } },
      });
      if (!record?.entity.module.isActive) notFound();
      const { module, slug } = record.entity;
      const user = await requirePermission(customPermission(module.slug, level));
      return { user, recordHref: `/m/${module.slug}/${slug}/${entityId}` };
    }
    default:
      notFound();
  }
}

/**
 * Deletes the attachment rows of records being deleted, inside their transaction.
 * Returns a function that removes the files; call it after the transaction commits.
 */
export async function deleteAttachmentsOf(tx: Prisma.TransactionClient, entity: string, entityIds: string[]) {
  const rows = await tx.attachment.findMany({ where: { entity, entityId: { in: entityIds } }, select: { storageKey: true } });
  await tx.attachment.deleteMany({ where: { entity, entityId: { in: entityIds } } });
  return () => Promise.all(rows.map((r) => removeFile(r.storageKey)));
}
