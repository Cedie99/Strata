import { Prisma } from "@prisma/client";
import { ApprovalTrail } from "@/components/approval-trail";
import { PrintButton } from "@/components/print/print-button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DataTable, PageHeader, listTabs, sectionLabel, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatDateTime, formatMoney, toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { reverseManualJournal } from "@/modules/accounting/actions";
import { P } from "@/modules/accounting/module";
import { SOURCE_LABELS, sourceHref } from "@/modules/accounting/reports";
import { ReverseForm } from "./reverse-form";

export const metadata: Metadata = { title: "Journal entry" };

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [entry, scope, settings] = await Promise.all([
    db.journalEntry.findUnique({
      where: { id },
      include: {
        lines: { include: { account: true, branch: true, customer: true, product: true }, orderBy: { debit: "desc" } },
        createdBy: { select: { name: true } },
        reversalOf: { select: { id: true, number: true } },
        reversedBy: { select: { id: true, number: true } },
      },
    }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!entry || !entry.lines.some((l) => scope.mayUse(l.branchId))) notFound();

  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);
  const total = entry.lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0));
  const fromDocument = entry.sourceType !== "Manual" && entry.sourceType !== "Reversal";

  return (
    <>
      <PageHeader title={`${entry.number}`} description={entry.memo} actions={<PrintButton href={`/print/journal-voucher/${id}`} label="Print voucher" />} />
      <Tabs tabs={listTabs("/accounting/journals", true)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <DataTable>
          <thead>
            <tr>
              <th>Account</th>
              <th>Branch</th>
              <th>Detail</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/accounting/ledger?f_account=${l.accountId}`} className="text-primary hover:underline">
                    {l.account.code} · {l.account.name}
                  </Link>
                </td>
                <td>{l.branch.code}</td>
                <td>{[l.customer?.name, l.product && `${l.product.sku}`, l.memo].filter(Boolean).join(" · ") || "-"}</td>
                <td className="text-right tabular-nums">{l.debit.isZero() ? "" : money(l.debit)}</td>
                <td className="text-right tabular-nums">{l.credit.isZero() ? "" : money(l.credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td colSpan={3}>Total</td>
              <td className="text-right tabular-nums">{money(total)}</td>
              <td className="text-right tabular-nums">{money(total)}</td>
            </tr>
          </tfoot>
        </DataTable>

        <div className="space-y-6">
          <Card title="Trail">
            <dl className="space-y-2">
              <Row label="Date">{formatDate(entry.date)}</Row>
              <Row label="Source">{SOURCE_LABELS[entry.sourceType] ?? entry.sourceType}</Row>
              {entry.sourceNumber && (
                <Row label="Document">
                  <Link href={sourceHref(entry)} className="font-mono text-primary hover:underline">
                    {entry.sourceNumber}
                  </Link>
                </Row>
              )}
              <Row label="Posted by">
                {entry.createdBy?.name ?? "-"}, {formatDateTime(entry.createdAt)}
              </Row>
              {entry.reversalOf && (
                <Row label="Reverses">
                  <Link href={`/accounting/journals/${entry.reversalOf.id}`} className="font-mono text-primary hover:underline">
                    {entry.reversalOf.number}
                  </Link>
                </Row>
              )}
              {entry.reversedBy && (
                <Row label="Reversed by">
                  <Link href={`/accounting/journals/${entry.reversedBy.id}`} className="font-mono text-primary hover:underline">
                    {entry.reversedBy.number}
                  </Link>
                </Row>
              )}
            </dl>
            <p className={`mt-4 ${sectionLabel}`}>Audit</p>
            <p className="mt-1 text-xs text-muted">
              Posted entries are permanent: the database refuses edits and deletions, and the audit log records who posted it.
            </p>
          </Card>
          {entry.sourceType === "Manual" && !entry.reversedBy && can(user, P.journalPost) && (
            <Card title="Reverse this entry">
              <ReverseForm action={reverseManualJournal.bind(null, id)} today={toDateInput(new Date())} />
            </Card>
          )}
          {fromDocument && !entry.reversedBy && (
            <p className="px-1 text-xs text-muted">This entry belongs to its document. To undo it, void or correct the document.</p>
          )}
        </div>
      </div>
      <div className="mt-6 max-w-xl">
        <ApprovalTrail documentId={id} />
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
