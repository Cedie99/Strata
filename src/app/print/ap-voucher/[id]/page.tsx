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
import { P } from "@/modules/purchasing/module";
import { billEwt } from "@/modules/purchasing/posting";
import { JournalLines } from "../../journal-lines";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await db.supplierBill.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: { absolute: b?.number ?? "AP voucher" } };
}

/** Accounts payable voucher: the supplier invoice as entered, with its accounting entry. */
export default async function PrintApVoucher({ params }: Props) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [bill, scope, settings, entry] = await Promise.all([
    db.supplierBill.findUnique({
      where: { id },
      include: { supplier: true, branch: true, createdBy: { select: { name: true } }, lines: { include: { account: true, receiptLine: { include: { receipt: true } } } } },
    }),
    getBranchScope(),
    getSettings(),
    db.journalEntry.findUnique({ where: { sourceType_sourceId: { sourceType: "SupplierBill", sourceId: id } }, include: { lines: { include: { account: true } } } }),
  ]);
  if (!bill || !scope.mayUse(bill.branchId)) notFound();
  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => formatMoney(v, currency);
  const ewt = billEwt(bill);
  const s = bill.supplier;

  return (
    <PrintDocument
      title="Accounts payable voucher"
      number={bill.number}
      status={bill.status === "VOID" ? "Void" : undefined}
      party={{ label: "Payee", name: s.name, lines: [s.address, s.tin && `TIN ${s.tin}`].filter((x): x is string => !!x) }}
      facts={[
        { label: "Supplier invoice", value: bill.supplierInvoiceNo },
        { label: "Invoice date", value: formatDate(bill.date) },
        { label: "Due date", value: formatDate(bill.dueDate) },
        { label: "Branch", value: bill.branch.code },
        { label: "Withholding", value: bill.ewtRate.isZero() ? "None" : `${bill.ewtRate.toString()}%${bill.atc ? ` · ${bill.atc}` : ""}` },
        { label: "Supplier VAT", value: s.vatRegistered ? "VAT-registered" : "Non-VAT" },
      ]}
      signatures={[{ role: "Prepared by", name: bill.createdBy?.name }, { role: "Checked by" }, { role: "Approved by" }]}
      printedBy={user.name}
    >
      <table className="lines-table">
        <thead>
          <tr>
            <th>Particulars</th>
            <th>From</th>
            <th className="r">Qty</th>
            <th className="r">Net</th>
            <th className="r">VAT</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td className="muted">{l.receiptLine ? l.receiptLine.receipt.number : l.account ? `${l.account.code} · ${l.account.name}` : "—"}</td>
              <td className="r">{formatQty(l.qty)}</td>
              <td className="r">{money(l.amount)}</td>
              <td className="r">{money(l.vat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bottom">
        <div>
          <Words>{amountInWords(bill.total, currency)}</Words>
          {bill.note && <p className="note">{bill.note}</p>}
        </div>
        <Totals
          rows={[
            { label: "Net of VAT", value: money(bill.subtotal) },
            { label: "Input VAT", value: money(bill.vat) },
            { label: "Total payable", value: money(bill.total), grand: true },
            ...(ewt.greaterThan(0) ? [{ label: "Less EWT on payment", value: `(${money(ewt)})` }, { label: "Net cash to pay", value: money(bill.total.minus(ewt)) }] : []),
          ]}
        />
      </div>
      {entry && <JournalLines lines={entry.lines} money={money} label={`Accounting entry ${entry.number}`} />}
    </PrintDocument>
  );
}

