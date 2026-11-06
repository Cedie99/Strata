import type { Metadata } from "next";
import { PrintButton } from "@/components/print/print-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Card, DataTable, EmptyRow, PageHeader, listTabs, sectionLabel, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatDateTime, formatMoney, formatQty } from "@/core/format";
import { getSettings } from "@/core/settings";
import { closeOrder } from "@/modules/purchasing/actions";
import { P, PO_STATUS_LABELS, VAT_CODES } from "@/modules/purchasing/module";
import { Prisma } from "@prisma/client";
import { ConfirmAction } from "../../confirm-action";
import { Field, Row } from "../../parts";
import { ReceiveForm } from "./receive-form";

export const metadata: Metadata = { title: "Purchase order" };

const ZERO = new Prisma.Decimal(0);
const vatLabel = new Map<string, string>(VAT_CODES.map((v) => [v.value, v.label]));

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [order, scope, settings] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: true,
        warehouse: true,
        createdBy: { select: { name: true } },
        lines: { include: { product: true, receiptLines: { select: { qty: true } } } },
        receipts: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { name: true } } } },
      },
    }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!order || !scope.mayUse(order.branchId)) notFound();

  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);
  const lines = order.lines.map((l) => {
    const received = l.receiptLines.reduce((s, r) => s.plus(r.qty), ZERO);
    return { ...l, received, remaining: l.qty.minus(received) };
  });
  const open = order.status === "OPEN" || order.status === "PARTIAL";
  const toReceive = lines.filter((l) => l.remaining.greaterThan(0));

  return (
    <>
      <PageHeader
        title={`${order.number} · ${order.supplier.name}`}
        description={order.closedAt ? `${PO_STATUS_LABELS[order.status]} ${formatDateTime(order.closedAt)}.` : undefined}
        actions={
          <>
            <PrintButton href={`/print/purchase-order/${id}`} />
            {can(user, P.billsPost) && order.receipts.length > 0 && (
              <LinkButton href={`/purchasing/bills/new?supplierId=${order.supplierId}&branchId=${order.branchId}`} variant="secondary">
                Bill received goods
              </LinkButton>
            )}
            {open && can(user, P.ordersManage) &&
              (order.receipts.length === 0 ? (
                <ConfirmAction action={closeOrder.bind(null, id, "CANCELLED")} label="Cancel order" title="Cancel this purchase order?" items={[order.number]}>
                  Nothing was received on it. The number is kept and cannot be reused.
                </ConfirmAction>
              ) : (
                <ConfirmAction action={closeOrder.bind(null, id, "CLOSED")} label="Close order" title="Close this purchase order?" items={[order.number]}>
                  The quantities not yet received will no longer be expected. What was received stays.
                </ConfirmAction>
              ))}
          </>
        }
      />
      <Tabs tabs={listTabs("/purchasing/orders", true)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Purchase order">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <Field label="Supplier">
                <Link href={`/purchasing/suppliers/${order.supplierId}`} className="text-primary hover:underline">
                  {order.supplier.code} · {order.supplier.name}
                </Link>
              </Field>
              <Field label="PO date">{formatDate(order.date)}</Field>
              <Field label="Expected">{order.expectedDate ? formatDate(order.expectedDate) : "-"}</Field>
              <Field label="Deliver to">
                {order.branch.code} / {order.warehouse.code} · {order.warehouse.name}
              </Field>
              <Field label="Reference">{order.reference || "-"}</Field>
              <Field label="Created by">
                {order.createdBy?.name ?? "-"}, {formatDateTime(order.createdAt)}
              </Field>
            </dl>
            {order.note && <p className="mt-4 whitespace-pre-wrap text-muted">{order.note}</p>}
          </Card>
          <DataTable>
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Ordered</th>
                <th className="text-right">Received</th>
                <th className="text-right">Unit cost</th>
                <th>VAT</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.product.sku} · {l.product.name}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatQty(l.qty)} {l.product.unit}
                  </td>
                  <td className={`text-right tabular-nums ${l.remaining.greaterThan(0) ? "text-muted" : "text-ok"}`}>{formatQty(l.received)}</td>
                  <td className="text-right tabular-nums">{money(l.unitCost)}</td>
                  <td>{vatLabel.get(l.vatCode) ?? l.vatCode}</td>
                  <td className="text-right tabular-nums">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
        <Card title="Summary">
          <dl className="space-y-1.5">
            <Row label="Net of VAT" value={money(order.subtotal)} />
            <Row label="VAT" value={money(order.vat)} />
            <Row label="Total" value={money(order.total)} strong />
            <Row label="Status" value={PO_STATUS_LABELS[order.status]} />
          </dl>
        </Card>
      </div>

      {open && toReceive.length > 0 && can(user, P.receive) && (
        <>
          <h2 className={`mt-8 mb-2 px-1 ${sectionLabel}`}>Receive goods</h2>
          <Card className="max-w-4xl">
            <ReceiveForm
              orderId={id}
              lines={toReceive.map((l) => ({
                id: l.id,
                product: `${l.product.sku} · ${l.product.name}`,
                unit: l.product.unit,
                ordered: formatQty(l.qty),
                received: formatQty(l.received),
                remaining: l.remaining.toString(),
              }))}
            />
          </Card>
        </>
      )}

      <h2 className={`mt-8 mb-2 px-1 ${sectionLabel}`}>Receiving reports</h2>
      <DataTable>
        <thead>
          <tr>
            <th>Date</th>
            <th>Number</th>
            <th>Supplier DR</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {order.receipts.length === 0 && <EmptyRow colSpan={4}>Nothing received yet.</EmptyRow>}
          {order.receipts.map((r) => (
            <tr key={r.id}>
              <td>{formatDate(r.date)}</td>
              <td className="font-mono">
                <Link href={`/purchasing/receipts/${r.id}`} className="text-primary hover:underline">
                  {r.number}
                </Link>
              </td>
              <td>{r.reference || "-"}</td>
              <td>{r.createdBy?.name ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
