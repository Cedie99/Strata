import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Card, DataTable, PageHeader, listTabs, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P as ACC } from "@/modules/accounting/module";
import { P } from "@/modules/purchasing/module";
import type { Prisma } from "@prisma/client";
import { Field, JournalTrail } from "../../parts";

export const metadata: Metadata = { title: "Receiving report" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [receipt, scope, settings, journals] = await Promise.all([
    db.goodsReceipt.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: true,
        warehouse: true,
        order: { select: { id: true, number: true } },
        createdBy: { select: { name: true } },
        lines: { include: { product: true, billLines: { where: { bill: { status: "POSTED" } }, include: { bill: { select: { id: true, number: true } } } } } },
      },
    }),
    getBranchScope(),
    getSettings(),
    db.journalEntry.findMany({ where: { sourceType: "GoodsReceipt", sourceId: id }, select: { id: true, number: true, memo: true } }),
  ]);
  if (!receipt || !scope.mayUse(receipt.branchId)) notFound();
  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);
  const unbilled = receipt.lines.some((l) => l.billLines.length === 0);

  return (
    <>
      <PageHeader
        title={`${receipt.number} · ${receipt.supplier.name}`}
        actions={
          unbilled &&
          can(user, P.billsPost) && (
            <LinkButton href={`/purchasing/bills/new?supplierId=${receipt.supplierId}&branchId=${receipt.branchId}`} variant="secondary">
              Bill these goods
            </LinkButton>
          )
        }
      />
      <Tabs tabs={listTabs("/purchasing/receipts", true)} />
      <Card title="Receiving report" className="mb-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Field label="Supplier">
            <Link href={`/purchasing/suppliers/${receipt.supplierId}`} className="text-primary hover:underline">
              {receipt.supplier.code} · {receipt.supplier.name}
            </Link>
          </Field>
          <Field label="Purchase order">
            <Link href={`/purchasing/orders/${receipt.order.id}`} className="font-mono text-primary hover:underline">
              {receipt.order.number}
            </Link>
          </Field>
          <Field label="Received">{formatDate(receipt.date)}</Field>
          <Field label="Warehouse">
            {receipt.branch.code} / {receipt.warehouse.code} · {receipt.warehouse.name}
          </Field>
          <Field label="Supplier DR">{receipt.reference || "-"}</Field>
          <Field label="Received by">
            {receipt.createdBy?.name ?? "-"}, {formatDateTime(receipt.createdAt)}
          </Field>
        </dl>
        {receipt.note && <p className="mt-4 whitespace-pre-wrap text-muted">{receipt.note}</p>}
      </Card>
      <DataTable>
        <thead>
          <tr>
            <th>Product</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Unit cost</th>
            <th className="text-right">Value (net)</th>
            <th>Billed on</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((l) => (
            <tr key={l.id}>
              <td>
                {l.product.sku} · {l.product.name}
              </td>
              <td className="text-right tabular-nums">
                {formatQty(l.qty)} {l.product.unit}
              </td>
              <td className="text-right tabular-nums">{money(l.unitCost)}</td>
              <td className="text-right tabular-nums">{money(l.amount)}</td>
              <td>
                {l.billLines.length === 0 ? (
                  <span className="font-semibold text-danger">Not billed</span>
                ) : (
                  <Link href={`/purchasing/bills/${l.billLines[0].bill.id}`} className="font-mono text-primary hover:underline">
                    {l.billLines[0].bill.number}
                  </Link>
                )}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border font-semibold">
            <td colSpan={3} className="text-right">
              Total
            </td>
            <td className="text-right tabular-nums">{money(receipt.total)}</td>
            <td />
          </tr>
        </tbody>
      </DataTable>
      {can(user, ACC.view) && <JournalTrail journals={journals} />}
    </>
  );
}
