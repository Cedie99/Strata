import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument, Totals, Words } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney, formatQty } from "@/core/format";
import { getSettings } from "@/core/settings";
import { amountInWords } from "@/core/words";
import { P, PO_STATUS_LABELS, VAT_CODES } from "@/modules/purchasing/module";

type Props = { params: Promise<{ id: string }> };
const vatShort = new Map<string, string>(VAT_CODES.map((v) => [v.value, v.value === "VAT" ? "12%" : v.value === "ZERO" ? "0%" : "Exempt"]));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await db.purchaseOrder.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: { absolute: o?.number ?? "Purchase order" } };
}

export default async function PrintPurchaseOrder({ params }: Props) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [order, scope, settings] = await Promise.all([
    db.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, branch: true, warehouse: true, createdBy: { select: { name: true } }, lines: { include: { product: true } } } }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!order || !scope.mayUse(order.branchId)) notFound();
  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  const s = order.supplier;

  return (
    <PrintDocument
      title="Purchase order"
      number={order.number}
      status={order.status === "CANCELLED" ? "Cancelled" : undefined}
      party={{ label: "Supplier", name: s.name, lines: [s.address, s.tin && `TIN ${s.tin}`, [s.phone, s.email].filter(Boolean).join(" · ")].filter((x): x is string => !!x) }}
      facts={[
        { label: "PO date", value: formatDate(order.date) },
        { label: "Deliver by", value: order.expectedDate ? formatDate(order.expectedDate) : "—" },
        { label: "Deliver to", value: `${order.warehouse.name} (${order.branch.code})` },
        { label: "Terms", value: s.termsDays ? `${s.termsDays} days` : "Upon delivery" },
        { label: "Reference", value: order.reference || "—" },
        { label: "Status", value: PO_STATUS_LABELS[order.status] },
      ]}
      signatures={[{ role: "Prepared by", name: order.createdBy?.name }, { role: "Approved by" }, { role: "Supplier conforme" }]}
      printedBy={user.name}
    >
      {order.warehouse.address && <p className="note">Delivery address: {order.warehouse.address}</p>}
      <table className="lines-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="r">Qty</th>
            <th>Unit</th>
            <th className="r">Unit cost</th>
            <th className="r">VAT</th>
            <th className="r">Amount (net)</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l, i) => (
            <tr key={l.id}>
              <td className="muted">{i + 1}</td>
              <td>
                <span className="mono">{l.product.sku}</span> · {l.product.name}
              </td>
              <td className="r">{formatQty(l.qty)}</td>
              <td>{l.product.unit}</td>
              <td className="r">{money(l.unitCost)}</td>
              <td className="r">{vatShort.get(l.vatCode)}</td>
              <td className="r">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bottom">
        <div>
          <Words>{amountInWords(order.total, currency)}</Words>
          <p className="note">{order.note || "Please indicate this PO number on your delivery receipt and invoice."}</p>
        </div>
        <Totals
          rows={[
            { label: "Net of VAT", value: money(order.subtotal) },
            { label: "VAT", value: money(order.vat) },
            { label: "Total", value: money(order.total), grand: true },
          ]}
        />
      </div>
    </PrintDocument>
  );
}
