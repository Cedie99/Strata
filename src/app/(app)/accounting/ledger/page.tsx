import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, EmptyRow, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { reportDates } from "@/modules/accounting/lists";
import { P } from "@/modules/accounting/module";
import { accountLedger, sourceHref } from "@/modules/accounting/reports";
import { ReportControls, reportParams } from "../report-controls";

export const metadata: Metadata = { title: "General ledger" };

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission(P.view);
  const params = reportParams(await searchParams);
  const { from, to } = reportDates(params);
  const [scope, settings, accounts] = await Promise.all([getBranchScope(), getSettings(), db.account.findMany({ orderBy: { code: "asc" } })]);
  const accountId = params.f_account ?? accounts[0]?.id;
  const ledger = accountId ? await accountLedger(scope.ids, accountId, from, to) : null;
  const money = (v: number) => formatMoney(v, settings["company.currency"]);

  return (
    <>
      <PageHeader
        title={ledger ? `${ledger.account.code} · ${ledger.account.name}` : "General ledger"}
        description={`${scope.current ? `${scope.current.code} · ${scope.current.name}` : "All your branches"}, ${formatDate(from)} – ${formatDate(to)}. Click a line to open the document that posted it.`}
      />
      <ReportControls dates={{ from, to }} exportPath="/export/ledger" params={{ ...params, ...(accountId && { f_account: accountId }) }}>
        <label className="flex flex-col gap-0.5 text-[11px] font-bold tracking-[0.06em] text-muted uppercase">
          Account
          <select name="f_account" defaultValue={accountId} className="min-w-72 rounded-sm border border-border px-2 py-1 font-normal tracking-normal normal-case">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </label>
      </ReportControls>
      {ledger && (
        <DataTable>
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Document</th>
              <th>Description</th>
              <th>Branch</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <td colSpan={7}>Opening balance</td>
              <td className="text-right tabular-nums">{money(ledger.opening)}</td>
            </tr>
            {ledger.rows.length === 0 && <EmptyRow colSpan={8}>No entries in these dates.</EmptyRow>}
            {ledger.rows.map((r) => (
              <tr key={r.line.id}>
                <td>{formatDate(r.line.entry.date)}</td>
                <td className="font-mono">
                  <Link href={`/accounting/journals/${r.line.entry.id}`} className="text-primary hover:underline">
                    {r.line.entry.number}
                  </Link>
                </td>
                <td className="font-mono">
                  {r.line.entry.sourceNumber ? (
                    <Link href={sourceHref(r.line.entry)} className="text-primary hover:underline">
                      {r.line.entry.sourceNumber}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="max-w-md truncate">
                  {[r.line.entry.memo, r.line.customer?.name, r.line.product?.sku, r.line.memo].filter(Boolean).join(" · ")}
                </td>
                <td>{r.line.branch.code}</td>
                <td className="text-right tabular-nums">{r.debit ? money(r.debit) : ""}</td>
                <td className="text-right tabular-nums">{r.credit ? money(r.credit) : ""}</td>
                <td className="text-right tabular-nums">{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td colSpan={5}>Closing balance</td>
              <td className="text-right tabular-nums">{money(ledger.totalDebit)}</td>
              <td className="text-right tabular-nums">{money(ledger.totalCredit)}</td>
              <td className="text-right tabular-nums">{money(ledger.closing)}</td>
            </tr>
          </tfoot>
        </DataTable>
      )}
    </>
  );
}
