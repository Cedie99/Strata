import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NOT_OFFICIAL, PrintDocument, Totals, Words } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { amountInWords } from "@/core/words";
import { P, PAYMENT_METHODS } from "@/modules/sales/module";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await db.payment.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: { absolute: p?.number ?? "Payment receipt" } };
}

/** Acknowledgment of a customer payment against one invoice. */
export default async function PrintPayment({ params }: Props) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [payment, scope, settings] = await Promise.all([
    db.payment.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } }, invoice: { include: { customer: true, branch: true, payments: { select: { id: true, amount: true, createdAt: true } } } } },
    }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!payment || !scope.mayUse(payment.invoice.branchId)) notFound();
  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  const inv = payment.invoice;
  // Balance right after this payment (payments up to and including this one).
  const paidThrough = inv.payments.filter((p) => p.createdAt <= payment.createdAt).reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));
  const method = PAYMENT_METHODS.find((m) => m.value === payment.method)?.label ?? payment.method;

  return (
    <PrintDocument
      title="Acknowledgment receipt"
      number={payment.number}
      copyLabel="Internal copy"
      party={{ label: "Received from", name: inv.customer.name, lines: [inv.customer.address] }}
      facts={[
        { label: "Date received", value: formatDate(payment.date) },
        { label: "Method", value: method },
        { label: "Check / reference", value: payment.reference || "—" },
        { label: "Branch", value: inv.branch.code },
      ]}
      signatures={[{ role: "Received by", name: payment.createdBy?.name }, { role: "Customer" }]}
      printedBy={user.name}
      disclaimer={NOT_OFFICIAL}
    >
      <table className="lines-table">
        <thead>
          <tr>
            <th>Applied to invoice</th>
            <th>Invoice date</th>
            <th className="r">Invoice total</th>
            <th className="r">This payment</th>
            <th className="r">Balance after</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">{inv.number}</td>
            <td>{formatDate(inv.date)}</td>
            <td className="r">{money(inv.total)}</td>
            <td className="r">{money(payment.amount)}</td>
            <td className="r">{money(inv.total.minus(paidThrough))}</td>
          </tr>
        </tbody>
      </table>
      <div className="bottom">
        <div>
          <Words>{amountInWords(payment.amount, currency)}</Words>
          {payment.note && <p className="note">{payment.note}</p>}
        </div>
        <Totals rows={[{ label: "Amount received", value: money(payment.amount), grand: true }]} />
      </div>
    </PrintDocument>
  );
}
