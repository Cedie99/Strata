import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formatDate } from "@/core/format";
import { getSettings } from "@/core/settings";
import { reportDates } from "@/modules/accounting/lists";
import { P } from "@/modules/accounting/module";
import { incomeStatement } from "@/modules/accounting/reports";
import { ReportControls, reportParams } from "../report-controls";
import { Statement } from "../statement";

export const metadata: Metadata = { title: "Income statement" };

export default async function IncomeStatementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission(P.view);
  const params = reportParams(await searchParams);
  const { from, to } = reportDates(params);
  const [scope, settings] = await Promise.all([getBranchScope(), getSettings()]);
  const is = await incomeStatement(scope.ids, from, to);
  const [revenue, cost, operating, other] = is.sections;

  return (
    <>
      <PageHeader
        title="Income statement"
        description={`${scope.current ? `${scope.current.code} · ${scope.current.name}` : "All your branches"}, ${formatDate(from)} – ${formatDate(to)}. Amounts exclude VAT once tax is recorded.`}
      />
      <ReportControls dates={{ from, to }} exportPath="/export/income-statement" params={params} />
      <Statement
        currency={settings["company.currency"]}
        from={from}
        to={to}
        lines={[
          { kind: "heading", label: revenue.label },
          { kind: "accounts", rows: revenue.rows },
          { kind: "total", label: "Total revenue", amount: revenue.total },
          { kind: "heading", label: cost.label },
          { kind: "accounts", rows: cost.rows },
          { kind: "total", label: "Gross profit", amount: is.grossProfit },
          { kind: "heading", label: operating.label },
          { kind: "accounts", rows: operating.rows },
          { kind: "total", label: "Operating income", amount: is.operatingIncome },
          { kind: "heading", label: other.label },
          { kind: "accounts", rows: other.rows },
          { kind: "total", label: "Net income", amount: is.netIncome, strong: true },
        ]}
      />
    </>
  );
}
