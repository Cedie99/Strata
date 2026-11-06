import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NOT_OFFICIAL, PrintDocument, Totals, Words } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney, formatQty } from "@/core/format";
import { getSettings } from "@/core/settings";
import { amountInWords } from "@/core/words";
import { P } from "@/modules/sales/module";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const inv = await db.salesInvoice.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: { absolute: inv?.number ?? "Sales invoice" } };
}

export default async function PrintSalesInvoice({ params }: Props) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [inv, scope, settings] = await Promise.all([
    db.salesInvoice.findUnique({
      where: { id },
      include: { customer: true, branch: true, warehouse: true, createdBy: { select: { name: true } }, lines: { include: { product: true } }, payments: { select: { amount: true } } },
    }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!inv || !scope.mayUse(inv.branchId)) notFound();
  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  const paid = inv.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
  // The VAT breakdown BIR asks for on invoices: VATable, zero-rated and exempt sales, then the VAT.
  const byCode = (code: string) => inv.lines.filter((l) => l.vatCode === code).reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
  const vatable = byCode("VAT");
  const zero = byCode("ZERO");
  const exempt = byCode("EXEMPT");
  const optional = (label: string, v: Prisma.Decimal) => (v.isZero() ? [] : [{ label, value: money(v) }]);

  return (
    <PrintDocument
      title="Sales invoice"
      number={inv.number}
      status={inv.status === "VOID" ? "Void" : undefined}
      copyLabel="Internal copy"
      party={{ label: "Sold to", name: inv.customer.name, lines: [inv.customer.address, [inv.customer.tin && `TIN ${inv.customer.tin}`, inv.customer.phone, inv.customer.email].filter(Boolean).join(" · ")] }}
      facts={[
        { label: "Invoice date", value: formatDate(inv.date) },
        { label: "Due date", value: formatDate(inv.dueDate) },
        { label: "Customer code", value: inv.customer.code },
        { label: "Terms", value: inv.customer.termsDays ? `${inv.customer.termsDays} days` : "Due on delivery" },
        { label: "Ship from", value: `${inv.branch.code} / ${inv.warehouse.code}` },
        { label: "Reference", value: inv.reference || "—" },
      ]}
      signatures={[{ role: "Prepared by", name: inv.createdBy?.name }, { role: "Delivered by" }, { role: "Received in good order by" }]}
      printedBy={user.name}
      disclaimer={NOT_OFFICIAL}
    >
      <table className="lines-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="r">Qty</th>
            <th>Unit</th>
            <th className="r">Unit price</th>
            <th>VAT</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={l.id}>
              <td className="muted">{i + 1}</td>
              <td>
                <span className="mono">{l.product.sku}</span> · {l.product.name}
              </td>
              <td className="r">{formatQty(l.qty)}</td>
              <td>{l.product.unit}</td>
              <td className="r">{money(l.unitPrice)}</td>
              <td className="muted">{l.vatCode === "VAT" ? "V" : l.vatCode === "ZERO" ? "Z" : "E"}</td>
              <td className="r">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bottom">
        <div>
          <Words>{amountInWords(inv.total, currency)}</Words>
          {inv.note && <p className="note">{inv.note}</p>}
        </div>
        <Totals
          rows={[
            ...optional("VATable sales", vatable),
            ...optional("Zero-rated sales", zero),
            ...optional("VAT-exempt sales", exempt),
            { label: "VAT 12%", value: money(inv.vat) },
            { label: "Total amount due", value: money(inv.total), grand: true },
            ...(paid.greaterThan(0) ? [{ label: "Paid", value: money(paid) }, { label: "Balance due", value: money(inv.total.minus(paid)) }] : []),
          ]}
        />
      </div>
    </PrintDocument>
  );
}
