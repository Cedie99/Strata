import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formatDate } from "@/core/format";
import { getSettings } from "@/core/settings";
import { reportDates } from "@/modules/accounting/lists";
import { P } from "@/modules/accounting/module";
import { balanceSheet, round } from "@/modules/accounting/reports";
import { ReportControls, reportParams } from "../report-controls";
import { Statement } from "../statement";

export const metadata: Metadata = { title: "Balance sheet" };

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission(P.view);
  const params = reportParams(await searchParams);
  const { asOf } = reportDates(params);
  const [scope, settings] = await Promise.all([getBranchScope(), getSettings()]);
  const bs = await balanceSheet(scope.ids, asOf);

  return (
    <>
      <PageHeader
        title="Balance sheet"
        description={`${scope.current ? `${scope.current.code} · ${scope.current.name}` : "All your branches"}, at the end of ${formatDate(asOf)}.`}
      />
      <ReportControls dates={{ asOf }} exportPath="/export/balance-sheet" params={params} />
      {!bs.balanced && (
        <p className="mb-3 max-w-3xl border border-danger/40 bg-danger/10 px-3 py-2 font-semibold text-danger">
          ⚠ Assets do not equal liabilities plus equity. This should not happen; contact your administrator.
        </p>
      )}
      {scope.current && scope.allowed.length > 1 && (
        <p className="mb-3 max-w-3xl text-xs text-muted">
          A single branch&apos;s balance sheet includes its inter-branch clearing balance; it nets to zero across all branches.
        </p>
      )}
      <Statement
        currency={settings["company.currency"]}
        from={new Date(asOf.getFullYear(), 0, 1)}
        to={asOf}
        lines={[
          { kind: "heading", label: "Assets" },
          { kind: "accounts", rows: bs.assets },
          { kind: "total", label: "Total assets", amount: bs.totalAssets, strong: true },
          { kind: "heading", label: "Liabilities" },
          { kind: "accounts", rows: bs.liabilities },
          { kind: "total", label: "Total liabilities", amount: bs.totalLiabilities },
          { kind: "heading", label: "Equity" },
          { kind: "accounts", rows: bs.equity },
          { kind: "line", label: "Earnings of earlier years", amount: bs.earlierEarnings },
          { kind: "line", label: "Net income this year", amount: bs.netIncome },
          { kind: "total", label: "Total equity", amount: bs.totalEquity },
          { kind: "total", label: "Total liabilities and equity", amount: round(bs.totalLiabilities + bs.totalEquity), strong: true },
        ]}
      />
    </>
  );
}
