import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument, Totals } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P } from "@/modules/sales/module";
import { agingBucket, AGING_BUCKETS, daysOverdue } from "@/modules/sales/queries";

type Props = { params: Promise<{ customerId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await db.customer.findUnique({ where: { id: (await params).customerId }, select: { code: true } });
  return { title: { absolute: `SOA ${c?.code ?? ""}`.trim() } };
}

const ZERO = new Prisma.Decimal(0);

/** Statement of account: every open invoice of the customer (in the user's branches) with its age. */
export default async function PrintStatement({ params }: Props) {
  const user = await requirePermission(P.view);
  const { customerId } = await params;
  const scope = await getBranchScope();
  const [customer, invoices, settings] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId } }),
    db.salesInvoice.findMany({
      where: { customerId, status: "POSTED", branchId: { in: scope.ids } },
      include: { payments: { select: { amount: true } }, branch: true },
      orderBy: [{ date: "asc" }, { number: "asc" }],
    }),
    getSettings(),
  ]);
  if (!customer) notFound();
  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);
  const today = new Date();
  const open = invoices
    .map((i) => ({ ...i, paid: i.payments.reduce((s, p) => s.plus(p.amount), ZERO) }))
    .map((i) => ({ ...i, balance: i.total.minus(i.paid), days: daysOverdue(i.dueDate, today) }))
    .filter((i) => i.balance.greaterThan(0));
  const total = open.reduce((s, i) => s.plus(i.balance), ZERO);
  const byBucket = new Map(AGING_BUCKETS.map((b) => [b.key, ZERO]));
  for (const i of open) byBucket.set(agingBucket(i.days), byBucket.get(agingBucket(i.days))!.plus(i.balance));

  return (
    <PrintDocument
      title="Statement of account"
      number={customer.code}
      party={{ label: "Customer", name: customer.name, lines: [customer.address, [customer.phone, customer.email].filter(Boolean).join(" · ")] }}
      facts={[
        { label: "Statement date", value: formatDate(today) },
        { label: "Terms", value: customer.termsDays ? `${customer.termsDays} days` : "Due on delivery" },
        { label: "Open invoices", value: String(open.length) },
        { label: "Branches", value: scope.current ? scope.current.code : "All" },
      ]}
      signatures={[{ role: "Prepared by", name: user.name }, { role: "Received by (customer)" }]}
      printedBy={user.name}
    >
      <table className="lines-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Due</th>
            <th className="r">Days overdue</th>
            <th className="r">Amount</th>
            <th className="r">Paid</th>
            <th className="r">Balance</th>
          </tr>
        </thead>
        <tbody>
          {open.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                Nothing is owed. Thank you!
              </td>
            </tr>
          )}
          {open.map((i) => (
            <tr key={i.id}>
              <td className="mono">{i.number}</td>
              <td>{formatDate(i.date)}</td>
              <td>{formatDate(i.dueDate)}</td>
              <td className="r">{i.days > 0 ? i.days : "—"}</td>
              <td className="r">{money(i.total)}</td>
              <td className="r">{money(i.paid)}</td>
              <td className="r">{money(i.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="section-title">Aging</p>
      <div className="aging">
        {AGING_BUCKETS.map((b) => (
          <div key={b.key}>
            <span>{b.label}</span>
            <b>{money(byBucket.get(b.key)!)}</b>
          </div>
        ))}
      </div>
      <div className="bottom">
        <p className="note">Please settle overdue amounts at your earliest convenience. If you have already paid, kindly send us the payment details.</p>
        <Totals rows={[{ label: "Total amount due", value: money(total), grand: true }]} />
      </div>
    </PrintDocument>
  );
}
