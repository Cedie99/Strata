import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { can } from "@/core/auth/guard";
import { db } from "@/core/db";
import { requireAttachmentAccess } from "@/modules/attachments";
import { customPermission } from "@/modules/custom/module";

export const metadata: Metadata = { title: "Attachments" };

export default async function RecordAttachmentsPage({
  params,
}: {
  params: Promise<{ module: string; entity: string; id: string }>;
}) {
  const { module, entity: entitySlug, id } = await params;
  const { user, recordHref } = await requireAttachmentAccess("CustomRecord", id, "view");
  // The URL must match the record's own module and record type.
  if (recordHref !== `/m/${module}/${entitySlug}/${id}`) notFound();
  const [entity, count] = await Promise.all([
    db.customEntity.findFirstOrThrow({ where: { slug: entitySlug, module: { slug: module } } }),
    db.attachment.count({ where: { entity: "CustomRecord", entityId: id } }),
  ]);
  return (
    <>
      <PageHeader title={`${entity.name} · attachments`} />
      <Tabs tabs={recordTabs(`/m/${module}/${entitySlug}`, recordHref, "attachments", count)} />
      <AttachmentsPanel entity="CustomRecord" entityId={id} canManage={can(user, customPermission(module, "manage"))} />
    </>
  );
}
