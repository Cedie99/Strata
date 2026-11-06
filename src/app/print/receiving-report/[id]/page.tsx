import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument, Totals } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney, formatQty } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P } from "@/modules/purchasing/module";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await db.goodsReceipt.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: { absolute: r?.number ?? "Receiving report" } };
}

export default async function PrintReceivingReport({ params }: Props) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [rr, scope, settings] = await Promise.all([
    db.goodsReceipt.findUnique({
      where: { id },
      include: { supplier: true, branch: true, warehouse: true, order: true, createdBy: { select: { name: true } }, lines: { include: { product: true, orderLine: true } } },
    }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!rr || !scope.mayUse(rr.branchId)) notFound();
  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);

  return (
    <PrintDocument
      title="Receiving report"
      number={rr.number}
      party={{ label: "Supplier", name: rr.supplier.name, lines: [rr.supplier.address, rr.supplier.tin && `TIN ${rr.supplier.tin}`].filter((x): x is string => !!x) }}
      facts={[
        { label: "Date received", value: formatDate(rr.date) },
        { label: "Purchase order", value: rr.order.number },
        { label: "Supplier DR no.", value: rr.reference || "—" },
        { label: "Warehouse", value: `${rr.warehouse.name} (${rr.branch.code})` },
      ]}
      signatures={[{ role: "Delivered by" }, { role: "Received and inspected by", name: rr.createdBy?.name }, { role: "Checked by" }]}
      printedBy={user.name}
    >
      <table className="lines-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="r">Ordered</th>
            <th className="r">Received</th>
            <th>Unit</th>
            <th className="r">Unit cost</th>
            <th className="r">Value (net)</th>
          </tr>
        </thead>
        <tbody>
          {rr.lines.map((l, i) => (
            <tr key={l.id}>
              <td className="muted">{i + 1}</td>
              <td>
                <span className="mono">{l.product.sku}</span> · {l.product.name}
              </td>
              <td className="r muted">{formatQty(l.orderLine.qty)}</td>
              <td className="r">{formatQty(l.qty)}</td>
              <td>{l.product.unit}</td>
              <td className="r">{money(l.unitCost)}</td>
              <td className="r">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bottom">
        <p className="note">{rr.note || "Goods received in good order and condition unless noted above."}</p>
        <Totals rows={[{ label: "Total value received", value: money(rr.total), grand: true }]} />
      </div>
    </PrintDocument>
  );
}
