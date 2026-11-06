import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { can } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import { decideRecord, deleteRecord, saveRecord } from "@/modules/custom/actions";
import { APPROVAL_STATUSES, displayValue, isData, parseData } from "@/modules/custom/fields";
import { lineGridsFor } from "@/modules/custom/lines";
import { lookupChoices } from "@/modules/custom/lookups";
import { customPermission } from "@/modules/custom/module";
import { requireCustomEntity } from "@/modules/custom/queries";
import { RecordForm } from "../record-form";
import { ApprovalPanel } from "./approval-panel";
import { RelatedLists } from "./related-lists";

export const metadata: Metadata = { title: "Record" };

export default async function RecordPage({
  params,
}: {
  params: Promise<{ module: string; entity: string; id: string }>;
}) {
  const { module, entity: entitySlug, id } = await params;
  const { user, entity, fields } = await requireCustomEntity(module, entitySlug);
  const auditName = `${entity.module.name} / ${entity.name}`;
  const [record, attachments, choices, lineGrids, lastSave] = await Promise.all([
    db.customRecord.findFirst({
      where: { id, entityId: entity.id },
      include: { createdBy: { select: { name: true } }, decidedBy: { select: { name: true } } },
    }),
    db.attachment.count({ where: { entity: "CustomRecord", entityId: id } }),
    lookupChoices(fields),
    lineGridsFor(user, entity.id, id),
    db.auditLog.findFirst({
      where: { entity: auditName, entityId: id, action: { in: ["create", "update", "import"] } },
      orderBy: { seq: "desc" },
      select: { userId: true },
    }),
  ]);
  if (!record) notFound();
  const values = parseData(record.data);
  const canManage = can(user, customPermission(module, "manage"));
  const first = fields.find(isData);
  const firstLabels = first?.type === "lookup" ? new Map((choices[first.key] ?? []).map((o) => [o.value, o.label])) : undefined;
  const title = first ? displayValue(first, values[first.key], firstLabels) : "Record";
  const createdBy = record.createdBy ? ` by ${record.createdBy.name}` : "";
  // Maker-checker: the approve buttons are offered to approvers other than whoever saved it last.
  const status = record.status || "APPROVED";
  const mayDecide =
    entity.approval &&
    record.status === "PENDING" &&
    can(user, customPermission(module, "approve")) &&
    (lastSave?.userId ?? record.createdById) !== user.id;

  return (
    <>
      <PageHeader
        title={`${entity.name} · ${title}`}
        description={`Created ${formatDateTime(record.createdAt)}${createdBy} · updated ${formatDateTime(record.updatedAt)}`}
      />
      <Tabs
        tabs={recordTabs(`/m/${module}/${entitySlug}`, `/m/${module}/${entitySlug}/${id}`, "general", attachments)}
      />
      <div className="max-w-4xl space-y-6">
        {entity.approval && (
          <ApprovalPanel
            status={status}
            label={APPROVAL_STATUSES[status as keyof typeof APPROVAL_STATUSES] ?? status}
            decided={
              record.decidedAt
                ? `by ${record.decidedBy?.name ?? "a former user"} on ${formatDateTime(record.decidedAt)}`
                : undefined
            }
            note={record.decisionNote}
            approve={mayDecide ? decideRecord.bind(null, entity.id, id, "APPROVED") : undefined}
            reject={mayDecide ? decideRecord.bind(null, entity.id, id, "REJECTED") : undefined}
          />
        )}
        <Card>
          <RecordForm
            action={saveRecord.bind(null, entity.id, id)}
            fields={fields}
            values={values}
            choices={choices}
            layout={entity.formLayout === "tabs" ? "tabs" : "sections"}
            lineGrids={lineGrids}
            editing
            readOnly={!canManage}
          />
        </Card>
        <RelatedLists user={user} entityId={entity.id} recordId={id} />
        {canManage && (
          <Card title="Delete record">
            <ActionForm action={deleteRecord.bind(null, entity.id, id)}>
              <p className="text-muted">The record is removed for good. The audit log keeps a copy of its values.</p>
              <ConfirmSubmitButton label="Delete record" title={`Delete this ${entity.name} record?`} items={[title]}>
                This cannot be undone. The audit log keeps a copy of its values; its attachments are deleted too.
              </ConfirmSubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
