import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { DataTable, EmptyRow, PageHeader, sectionLabel } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formatDate, toDateInput } from "@/core/format";
import type { GridCell, GridColumn } from "@/core/grid";
import { getSettings } from "@/core/settings";
import { recentQuarters } from "@/core/tax";
import { reportParams } from "@/app/(app)/accounting/report-controls";
import { REPORTS } from "@/modules/tax/catalog";
import { P } from "@/modules/tax/module";
import { bookRange, quarterOfParams } from "@/modules/tax/reports";

type Props = { params: Promise<{ report: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: REPORTS[(await params).report]?.title ?? "BIR" };
}

const inputClass = "rounded-sm border border-border px-2 py-1";
const labelClass = "flex flex-col gap-0.5 text-[11px] font-bold tracking-[0.06em] text-muted uppercase";

/** One BIR book, list or worksheet: period controls, checks, the table(s), totals and notes. */
export default async function BirReportPage({ params, searchParams }: Props) {
  await requirePermission(P.view);
  const { report } = await params;
  const def = REPORTS[report];
  if (!def) notFound();
  const query = reportParams(await searchParams);
  const [scope, settings] = await Promise.all([getBranchScope(), getSettings()]);
  const result = await def.build(scope.ids, query);

  const range = def.period === "range" ? bookRange(query) : null;
  const quarter = def.period === "quarter" ? quarterOfParams(query) : null;
  const periodText = range ? `${formatDate(range.from)} to ${formatDate(range.to)}` : `${quarter!.key} (${formatDate(quarter!.from)} to ${formatDate(quarter!.last)})`;
  const exportParams = new URLSearchParams(range ? { f_from: toDateInput(range.from), f_to: toDateInput(range.to) } : { f_q: quarter!.key });
  const where = scope.current ? `${scope.current.code} · ${scope.current.name}` : "All your branches";
  const missingCompany = def.dat && (!settings["company.tin"] || !settings["company.rdo"]);

  return (
    <>
      <PageHeader title={def.title} description={`${def.form}. ${where}, ${periodText}.`} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 border border-border bg-surface px-3 py-2">
        {range && (
          <>
            <label className={labelClass}>
              From
              <input type="date" name="f_from" defaultValue={toDateInput(range.from)} className={inputClass} />
            </label>
            <label className={labelClass}>
              To
              <input type="date" name="f_to" defaultValue={toDateInput(range.to)} className={inputClass} />
            </label>
          </>
        )}
        {quarter && (
          <label className={labelClass}>
            Quarter
            <select name="f_q" defaultValue={quarter.key} className={inputClass}>
              {[...new Set([quarter.key, ...recentQuarters()])].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={buttonClass("primary")}>
          Show
        </button>
        <span className="ml-auto flex flex-wrap gap-2">
          {def.dat && (
            <a href={`/tax/${report}/dat?${exportParams}`} className={buttonClass("tool")} download>
              BIR data file (.DAT)
            </a>
          )}
          <a href={`/export/bir/${report}?${exportParams}`} className={buttonClass("tool")} download>
            Export
          </a>
        </span>
      </form>

      {missingCompany && (
        <p className="mb-3 border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
          Fill in the company TIN and RDO code under Setup → Global Setup → Company settings before using the data file.
        </p>
      )}
      {result.checks && result.checks.length > 0 && (
        <ul className="mb-4 space-y-1 border border-border bg-surface px-3 py-2">
          {result.checks.map((c) => (
            <li key={c.label} className="flex flex-wrap gap-x-2">
              <span className={c.ok ? "font-semibold text-ok" : "font-semibold text-danger"}>{c.ok ? "✓" : "⚠"}</span>
              <span className="font-medium">{c.label}:</span>
              <span className={c.ok ? "text-muted" : "text-danger"}>{c.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-6">
        {result.sections.map((s, i) => (
          <section key={i}>
            {s.title && <h2 className={`mb-1 px-1 ${sectionLabel}`}>{s.title}</h2>}
            {s.description && <p className="mb-2 px-1 text-xs text-muted">{s.description}</p>}
            <DataTable>
              <thead>
                <tr>
                  {s.columns.map((c) => (
                    <th key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.length === 0 && <EmptyRow colSpan={s.columns.length}>Nothing in this period.</EmptyRow>}
                {s.rows.map((r) => (
                  <tr key={r.id} className={isStrong(r.cells) ? "font-semibold" : undefined}>
                    {s.columns.map((c, ci) => (
                      <td key={c.key} className={cellClass(c, r.cells[c.key])}>
                        {ci === firstTextColumn(s.columns) && r.href ? (
                          <Link href={r.href} className="text-primary hover:underline">
                            {cellText(r.cells[c.key])}
                          </Link>
                        ) : (
                          cellText(r.cells[c.key])
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {s.totals && s.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    {s.columns.map((c) => (
                      <td key={c.key} className={c.align === "right" ? "text-right tabular-nums" : undefined}>
                        {cellText(s.totals![c.key])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </DataTable>
          </section>
        ))}
      </div>

      {result.notes && result.notes.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-6 text-xs text-muted">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {def.dat && <li>The data file follows the BIR RELIEF layout. Check it with the BIR validation module before submitting.</li>}
        </ul>
      )}
      {!result.notes && def.dat && <p className="mt-4 text-xs text-muted">The data file follows the BIR RELIEF layout. Check it with the BIR validation module before submitting.</p>}
    </>
  );
}

const cellText = (c: GridCell | undefined) => (c === undefined ? "" : typeof c === "string" ? c : c.text);
const isStrong = (cells: Record<string, GridCell>) => Object.values(cells).some((c) => typeof c === "object" && c.hint === "SUBTOTAL");
/** The cell that links to the document: the first column, or the second after a row number. */
const firstTextColumn = (cols: GridColumn[]) => (cols[0]?.key === "seq" ? 1 : 0);
function cellClass(col: GridColumn, cell: GridCell | undefined) {
  const tone = typeof cell === "object" ? cell.tone : undefined;
  return [
    col.align === "right" ? "text-right tabular-nums" : "",
    col.mono ? "font-mono" : "",
    tone === "danger" ? "text-danger" : tone === "muted" ? "text-muted" : tone === "ok" ? "text-ok" : "",
  ]
    .filter(Boolean)
    .join(" ") || undefined;
}
