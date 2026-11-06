import { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument, Totals, Words } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { ATC_DESCRIPTIONS } from "@/core/tax";
import { amountInWords } from "@/core/words";
import { P } from "@/modules/tax/module";
import { ewtLines, quarterOfParams } from "@/modules/tax/reports";

type Props = { params: Promise<{ supplierId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata: Metadata = { title: { absolute: "Form 2307" } };

const ZERO = new Prisma.Decimal(0);

/**
 * Certificate of creditable tax withheld at source (BIR Form 2307) for one supplier and quarter:
 * the income payments per ATC by month of the quarter, and the tax withheld from them.
 */
export default async function PrintForm2307({ params, searchParams }: Props) {
  const user = await requirePermission(P.view);
  const { supplierId } = await params;
  const sp = await searchParams;
  const query: Record<string, string> = typeof sp.f_q === "string" ? { f_q: sp.f_q } : {};
  const [supplier, scope, settings] = await Promise.all([db.supplier.findUnique({ where: { id: supplierId } }), getBranchScope(), getSettings()]);
  if (!supplier) notFound();
  const q = quarterOfParams(query);
  const { rows } = await ewtLines(scope.ids, query, supplierId);
  const currency = settings["company.currency"];
  const money = (v: Prisma.Decimal) => (v.isZero() ? "" : formatMoney(v, currency));

  const byAtc = new Map<string, { months: Prisma.Decimal[]; tax: Prisma.Decimal }>();
  for (const l of rows) {
    const r = byAtc.get(l.atc) ?? { months: [ZERO, ZERO, ZERO], tax: ZERO };
    if (l.month >= 0) r.months[l.month] = r.months[l.month].plus(l.base);
    r.tax = r.tax.plus(l.tax);
    byAtc.set(l.atc, r);
  }
  const atcs = [...byAtc].sort((a, b) => a[0].localeCompare(b[0]));
  const totalBase = rows.reduce((s, l) => s.plus(l.base), ZERO);
  const totalTax = rows.reduce((s, l) => s.plus(l.tax), ZERO);
  const monthName = (d: Date) => d.toLocaleDateString("en-PH", { month: "long" });

  return (
    <PrintDocument
      title="BIR Form 2307"
      number={q.key}
      copyLabel={rows.length === 0 ? "Nothing withheld" : undefined}
      party={{ label: "Payee (supplier)", name: supplier.name, lines: [supplier.tin ? `TIN ${supplier.tin}` : "TIN: not on file", supplier.address] }}
      facts={[
        { label: "Period from", value: formatDate(q.from) },
        { label: "Period to", value: formatDate(q.last) },
        { label: "Payor (withholding agent)", value: settings["company.name"] },
        { label: "Payor TIN", value: settings["company.tin"] || "—" },
        { label: "Payor address", value: settings["company.address"] || "—" },
      ]}
      signatures={[
        { role: "Payor / authorized representative: signature over printed name, TIN, title" },
        { role: "Payee / authorized representative: signature over printed name, TIN, title" },
      ]}
      printedBy={user.name}
      disclaimer="Certificate of creditable tax withheld at source, prepared in the layout of BIR Form 2307 from posted payments. Check it against the latest official form before issuing."
    >
      <p style={{ margin: "10px 0 6px", fontWeight: 700 }}>Part III · Details of monthly income payments and taxes withheld for the quarter</p>
      <table className="lines-table">
        <thead>
          <tr>
            <th>Income payments subject to expanded withholding tax</th>
            <th>ATC</th>
            <th className="r">1st month · {monthName(q.months[0])}</th>
            <th className="r">2nd month · {monthName(q.months[1])}</th>
            <th className="r">3rd month · {monthName(q.months[2])}</th>
            <th className="r">Total</th>
            <th className="r">Tax withheld for the quarter</th>
          </tr>
        </thead>
        <tbody>
          {atcs.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                No tax was withheld from this supplier in {q.key}.
              </td>
            </tr>
          )}
          {atcs.map(([atc, r]) => (
            <tr key={atc}>
              <td>{ATC_DESCRIPTIONS[atc] ?? "Income payment"}</td>
              <td className="mono">{atc || "—"}</td>
              <td className="r">{money(r.months[0])}</td>
              <td className="r">{money(r.months[1])}</td>
              <td className="r">{money(r.months[2])}</td>
              <td className="r">{money(r.months.reduce((s, v) => s.plus(v), ZERO))}</td>
              <td className="r">{money(r.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bottom">
        <div>
          <Words label="Tax withheld in words">{amountInWords(totalTax, currency)}</Words>
          <p className="note">Income payments are net of VAT. Withholding was recorded when each bill was paid.</p>
        </div>
        <Totals
          rows={[
            { label: "Total income payments", value: formatMoney(totalBase, currency) },
            { label: "Total tax withheld", value: formatMoney(totalTax, currency), grand: true },
          ]}
        />
      </div>
    </PrintDocument>
  );
}
