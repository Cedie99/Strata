import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, DataTable, PageHeader, listTabs, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatDateTime, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P as ACC } from "@/modules/accounting/module";
import { P } from "@/modules/purchasing/module";
import { PAYMENT_METHODS } from "@/modules/sales/module";
import { Field, JournalTrail, Row } from "../../parts";

export const metadata: Metadata = { title: "Payment made" };

export default async function SupplierPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [payment, scope, settings, journals] = await Promise.all([
    db.supplierPayment.findUnique({
      where: { id },
      include: { supplier: true, branch: true, createdBy: { select: { name: true } }, lines: { include: { bill: true } } },
    }),
    getBranchScope(),
    getSettings(),
    db.journalEntry.findMany({ where: { sourceType: "SupplierPayment", sourceId: id }, select: { id: true, number: true, memo: true } }),
  ]);
  if (!payment || !scope.mayUse(payment.branchId)) notFound();
  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);
  const method = PAYMENT_METHODS.find((m) => m.value === payment.method)?.label ?? payment.method;

  return (
    <>
      <PageHeader title={`${payment.number} · ${payment.supplier.name}`} />
      <Tabs tabs={listTabs("/purchasing/payments", true)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Payment">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <Field label="Supplier">
              <Link href={`/purchasing/suppliers/${payment.supplierId}`} className="text-primary hover:underline">
                {payment.supplier.code} · {payment.supplier.name}
              </Link>
            </Field>
            <Field label="TIN">{payment.supplier.tin || "-"}</Field>
            <Field label="Date">{formatDate(payment.date)}</Field>
            <Field label="Method">{method}</Field>
            <Field label="Check / ref.">{payment.reference || "-"}</Field>
            <Field label="Branch">{payment.branch.code}</Field>
            <Field label="Recorded by">
              {payment.createdBy?.name ?? "-"}, {formatDateTime(payment.createdAt)}
            </Field>
          </dl>
          {payment.note && <p className="mt-4 whitespace-pre-wrap text-muted">{payment.note}</p>}
        </Card>
        <Card title="Summary">
          <dl className="space-y-1.5">
            <Row label="Bills settled" value={money(payment.gross)} />
            <Row label="EWT withheld" value={money(payment.ewt)} />
            <Row label="Cash paid" value={money(payment.net)} strong />
          </dl>
        </Card>
      </div>
      <div className="mt-6">
        <DataTable>
          <thead>
            <tr>
              <th>Bill</th>
              <th>Supplier invoice</th>
              <th>ATC</th>
              <th className="text-right">Applied</th>
              <th className="text-right">EWT</th>
              <th className="text-right">Cash</th>
            </tr>
          </thead>
          <tbody>
            {payment.lines.map((l) => (
              <tr key={l.id}>
                <td className="font-mono">
                  <Link href={`/purchasing/bills/${l.billId}`} className="text-primary hover:underline">
                    {l.bill.number}
                  </Link>
                </td>
                <td>{l.bill.supplierInvoiceNo}</td>
                <td>{l.bill.atc || "-"}</td>
                <td className="text-right tabular-nums">{money(l.amount)}</td>
                <td className="text-right tabular-nums">{money(l.ewt)}</td>
                <td className="text-right tabular-nums">{money(l.amount.minus(l.ewt))}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
      {can(user, ACC.view) && <JournalTrail journals={journals} />}
    </>
  );
}
