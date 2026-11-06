import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, EmptyRow, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formatDate, formatMoney, toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { reportDates } from "@/modules/accounting/lists";
import { P } from "@/modules/accounting/module";
import { trialBalance } from "@/modules/accounting/reports";
import { ReportControls, reportParams } from "../report-controls";

export const metadata: Metadata = { title: "Trial balance" };

export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission(P.view);
  const params = reportParams(await searchParams);
  const { asOf } = reportDates(params);
  const [scope, settings] = await Promise.all([getBranchScope(), getSettings()]);
  const tb = await trialBalance(scope.ids, asOf);
  const money = (v: number) => (v ? formatMoney(v, settings["company.currency"]) : "");
  const yearStart = toDateInput(new Date(asOf.getFullYear(), 0, 1));

  return (
    <>
      <PageHeader
        title="Trial balance"
        description={`${scope.current ? `${scope.current.code} · ${scope.current.name}` : "All your branches"}, at the end of ${formatDate(asOf)}.`}
      />
      <ReportControls dates={{ asOf }} exportPath="/export/trial-balance" params={params} />
      {!tb.balanced && (
        <p className="mb-3 border border-danger/40 bg-danger/10 px-3 py-2 font-semibold text-danger">
          ⚠ Debits and credits differ. This should not happen; contact your administrator.
        </p>
      )}
      <div className="max-w-4xl">
        <DataTable>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.length === 0 && <EmptyRow colSpan={4}>Nothing posted yet.</EmptyRow>}
            {tb.rows.map((r) => (
              <tr key={r.account.id}>
                <td className="font-mono">{r.account.code}</td>
                <td>
                  <Link
                    href={`/accounting/ledger?f_account=${r.account.id}&f_from=${yearStart}&f_to=${toDateInput(asOf)}`}
                    className="text-primary hover:underline"
                  >
                    {r.account.name}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{money(r.debit)}</td>
                <td className="text-right tabular-nums">{money(r.credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td />
              <td>Total {tb.balanced && <span className="ml-2 text-xs font-normal text-ok">✓ balanced</span>}</td>
              <td className="text-right tabular-nums">{formatMoney(tb.totalDebit, settings["company.currency"])}</td>
              <td className="text-right tabular-nums">{formatMoney(tb.totalCredit, settings["company.currency"])}</td>
            </tr>
          </tfoot>
        </DataTable>
      </div>
    </>
  );
}
