import type { Metadata } from "next";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { can } from "@/core/auth/guard";
import { db } from "@/core/db";
import { requireAttachmentAccess } from "@/modules/attachments";
import { P } from "@/modules/inventory/module";

export const metadata: Metadata = { title: "Product attachments" };

export default async function ProductAttachmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, recordHref } = await requireAttachmentAccess("Product", id, "view");
  const [product, count] = await Promise.all([
    db.product.findUniqueOrThrow({ where: { id } }),
    db.attachment.count({ where: { entity: "Product", entityId: id } }),
  ]);
  return (
    <>
      <PageHeader title={`${product.sku} · ${product.name}`} />
      <Tabs tabs={recordTabs("/inventory/products", recordHref, "attachments", count)} />
      <AttachmentsPanel entity="Product" entityId={id} canManage={can(user, P.productsManage)} />
    </>
  );
}
