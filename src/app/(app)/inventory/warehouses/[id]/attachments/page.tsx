import type { Metadata } from "next";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { can } from "@/core/auth/guard";
import { db } from "@/core/db";
import { requireAttachmentAccess } from "@/modules/attachments";
import { P } from "@/modules/inventory/module";

export const metadata: Metadata = { title: "Warehouse attachments" };

export default async function WarehouseAttachmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, recordHref } = await requireAttachmentAccess("Warehouse", id, "view");
  const [warehouse, count] = await Promise.all([
    db.warehouse.findUniqueOrThrow({ where: { id } }),
    db.attachment.count({ where: { entity: "Warehouse", entityId: id } }),
  ]);
  return (
    <>
      <PageHeader title={`${warehouse.code} · ${warehouse.name}`} />
      <Tabs tabs={recordTabs("/inventory/warehouses", recordHref, "attachments", count)} />
      <AttachmentsPanel entity="Warehouse" entityId={id} canManage={can(user, P.warehousesManage)} />
    </>
  );
}
