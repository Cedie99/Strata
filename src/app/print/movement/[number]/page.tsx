import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatQty } from "@/core/format";
import { P } from "@/modules/inventory/module";

type Props = { params: Promise<{ number: string }> };

const TITLES: Record<string, string> = {
  RECEIPT: "Stock receipt",
  ISSUE: "Stock issue slip",
  ADJUSTMENT: "Stock adjustment",
  TRANSFER_OUT: "Stock transfer slip",
  TRANSFER_IN: "Stock transfer slip",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: { absolute: decodeURIComponent((await params).number) } };
}

/** One stock movement document (both lines of a transfer share its number). */
export default async function PrintMovement({ params }: Props) {
  const user = await requirePermission(P.view);
  const number = decodeURIComponent((await params).number);
  const [lines, scope] = await Promise.all([
    db.stockMovement.findMany({
      where: { number },
      include: { product: true, warehouse: { include: { branch: true } }, createdBy: { select: { name: true } } },
      orderBy: { qty: "asc" }, // transfer: the "out" line first
    }),
    getBranchScope(),
  ]);
  if (!number || lines.length === 0 || !lines.some((l) => scope.mayUse(l.warehouse.branchId))) notFound();
  const first = lines[0];
  const isTransfer = first.type.startsWith("TRANSFER");
  const from = lines.find((l) => l.type === "TRANSFER_OUT")?.warehouse;
  const to = lines.find((l) => l.type === "TRANSFER_IN")?.warehouse;

  return (
    <PrintDocument
      title={TITLES[first.type] ?? "Stock movement"}
      number={number}
      party={
        isTransfer && from && to
          ? { label: "From → to", name: `${from.name} → ${to.name}`, lines: [`${from.branch.code} → ${to.branch.code}`] }
          : { label: "Warehouse", name: first.warehouse.name, lines: [first.warehouse.address, first.warehouse.branch.name] }
      }
      facts={[
        { label: "Date", value: formatDate(first.createdAt) },
        { label: "Type", value: isTransfer ? "Transfer" : first.type.charAt(0) + first.type.slice(1).toLowerCase() },
        { label: "Reference", value: first.reference || "—" },
        { label: "Posted by", value: first.createdBy?.name ?? "—" },
      ]}
      signatures={
        isTransfer
          ? [{ role: "Released by", name: first.createdBy?.name }, { role: "Delivered by" }, { role: "Received by" }]
          : [{ role: "Prepared by", name: first.createdBy?.name }, { role: "Approved by" }, { role: first.type === "ISSUE" ? "Received by" : "Checked by" }]
      }
      printedBy={user.name}
    >
      <table className="lines-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Warehouse</th>
            <th className="r">Quantity</th>
            <th>Unit</th>
          </tr>
        </thead>
        <tbody>
          {(isTransfer ? lines.filter((l) => l.type === "TRANSFER_OUT") : lines).map((l) => (
            <tr key={l.id}>
              <td>
                <span className="mono">{l.product.sku}</span> · {l.product.name}
              </td>
              <td>{isTransfer && from && to ? `${from.code} → ${to.code}` : l.warehouse.code}</td>
              <td className="r">{isTransfer ? formatQty(l.qty.abs()) : `${l.qty.isNegative() ? "" : "+"}${formatQty(l.qty)}`}</td>
              <td>{l.product.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {first.note && <p className="note">{first.note}</p>}
    </PrintDocument>
  );
}
