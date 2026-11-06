import "server-only";
import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formatDate } from "@/core/format";
import type { GridCell, GridColumn } from "@/core/grid";
import { getSettings } from "@/core/settings";
import { buildReportWorkbook, xlsxResponse, type SheetValue } from "@/core/spreadsheet";
import { REPORTS } from "./catalog";
import { P } from "./module";
import { bookRange, quarterOfParams } from "./reports";

const value = (c: GridColumn, cell: GridCell | undefined): SheetValue => {
  if (cell === undefined || cell === "" || cell === "-") return null;
  if (typeof cell === "string") return cell;
  return c.kind === "date" ? cell.text : (cell.value ?? cell.text);
};

/** GET /export/bir/<report>?f_… → the BIR report as .xlsx, with company, TIN and period on top. */
export async function birExport(report: string, search: URLSearchParams) {
  await requirePermission(P.view);
  const def = REPORTS[report];
  if (!def) notFound();
  const params = Object.fromEntries([...search].filter(([k]) => /^f_\w+$/.test(k)));
  const [scope, settings] = await Promise.all([getBranchScope(), getSettings()]);
  const result = await def.build(scope.ids, params);
  const period =
    def.period === "range"
      ? (({ from, to }) => `${formatDate(from)} to ${formatDate(to)}`)(bookRange(params))
      : (({ key, from, last }) => `${key} (${formatDate(from)} to ${formatDate(last)})`)(quarterOfParams(params));
  const heading = [
    `${def.title} · ${def.form}`,
    `${settings["company.name"]}${settings["company.tin"] ? ` · TIN ${settings["company.tin"]}` : ""}`,
    settings["company.address"].replace(/[\r\n]+/g, ", "),
    `${scope.current ? `Branch ${scope.current.code}` : "All branches"} · ${period}`,
  ].filter(Boolean);
  const bytes = await buildReportWorkbook(
    def.title,
    heading,
    result.sections.map((s) => ({
      title: s.title,
      headers: s.columns.map((c) => c.label),
      rows: s.rows.map((r) => s.columns.map((c) => value(c, r.cells[c.key]))),
      totals: s.totals ? s.columns.map((c) => value(c, s.totals![c.key])) : undefined,
    })),
  );
  return xlsxResponse(bytes, `${def.title} ${def.period === "quarter" ? quarterOfParams(params).key : ""}`.trim());
}
