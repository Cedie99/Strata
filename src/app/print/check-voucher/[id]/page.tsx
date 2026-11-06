import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument, Totals, Words } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { amountInWords } from "@/core/words";
import { P } from "@/modules/purchasing/module";
import { PAYMENT_METHODS } from "@/modules/sales/module";
import { JournalLines } from "../../journal-lines";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await db.supplierPayment.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: { absolute: p?.number ?? "Check voucher" } };
}

/** Check / disbursement voucher for a payment to a supplier: bills paid, withholding, cash and the entry. */
export default async function PrintCheckVoucher({ params }: Props) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [payment, scope, settings, entry] = await Promise.all([
    db.supplierPayment.findUnique({ where: { id }, include: { supplier: true, branch: true, createdBy: { select: { name: true } }, lines: { include: { bill: true } } } }),
    getBranchScope(),
    getSettings(),
    db.journalEntry.findUnique({ where: { sourceType_sourceId: { sourceType: "SupplierPayment", sourceId: id } }, include: { lines: { include: { account: true } } } }),
  ]);
  if (!payment || !scope.mayUse(payment.branchId)) notFound();
  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  const s = payment.supplier;
  const method = PAYMENT_METHODS.find((m) => m.value === payment.method)?.label ?? payment.method;
  const isCheck = payment.method === "CHECK";

  return (
    <PrintDocument
      title={isCheck ? "Check voucher" : "Disbursement voucher"}
      number={payment.number}
      party={{ label: "Payee", name: s.name, lines: [s.address, s.tin && `TIN ${s.tin}`].filter((x): x is string => !!x) }}
      facts={[
        { label: "Date", value: formatDate(payment.date) },
        { label: "Method", value: method },
        { label: isCheck ? "Check no." : "Reference", value: payment.reference || "—" },
        { label: "Branch", value: payment.branch.code },
      ]}
      signatures={[{ role: "Prepared by", name: payment.createdBy?.name }, { role: "Checked by" }, { role: "Approved by" }, { role: "Received payment by" }]}
      printedBy={user.name}
    >
      <table className="lines-table">
        <thead>
          <tr>
            <th>Bill</th>
            <th>Supplier invoice</th>
            <th>Invoice date</th>
            <th>ATC</th>
            <th className="r">Amount applied</th>
            <th className="r">EWT withheld</th>
            <th className="r">Cash</th>
          </tr>
        </thead>
        <tbody>
          {payment.lines.map((l) => (
            <tr key={l.id}>
              <td className="mono">{l.bill.number}</td>
              <td>{l.bill.supplierInvoiceNo}</td>
              <td>{formatDate(l.bill.date)}</td>
              <td>{l.bill.atc || "—"}</td>
              <td className="r">{money(l.amount)}</td>
              <td className="r">{money(l.ewt)}</td>
              <td className="r">{money(l.amount.minus(l.ewt))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bottom">
        <div>
          <Words>{amountInWords(payment.net, currency)}</Words>
          {payment.note && <p className="note">{payment.note}</p>}
          {payment.ewt.greaterThan(0) && <p className="note">Withholding tax of {money(payment.ewt)} is remitted to the BIR; BIR Form 2307 is issued to the payee.</p>}
        </div>
        <Totals
          rows={[
            { label: "Bills settled", value: money(payment.gross) },
            { label: "Less EWT withheld", value: `(${money(payment.ewt)})` },
            { label: "Amount paid", value: money(payment.net), grand: true },
          ]}
        />
      </div>
      {entry && <JournalLines lines={entry.lines} money={money} label={`Accounting entry ${entry.number}`} />}
    </PrintDocument>
  );
}
