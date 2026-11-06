import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { toDateInput } from "@/core/format";

const inputClass = "rounded-sm border border-border px-2 py-1";

/**
 * The bar above a report: its dates (a plain GET form, so the URL can be bookmarked and shared),
 * any extra fields, and EXPORT with the same parameters.
 */
export function ReportControls({
  dates,
  exportPath,
  params,
  children,
}: {
  dates: { asOf?: Date; from?: Date; to?: Date };
  exportPath: string;
  params: Record<string, string>;
  children?: ReactNode;
}) {
  const label = "flex flex-col gap-0.5 text-[11px] font-bold tracking-[0.06em] text-muted uppercase";
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3 border border-border bg-surface px-3 py-2">
      {children}
      {dates.asOf && (
        <label className={label}>
          As of
          <input type="date" name="f_asof" defaultValue={toDateInput(dates.asOf)} className={inputClass} />
        </label>
      )}
      {dates.from && (
        <label className={label}>
          From
          <input type="date" name="f_from" defaultValue={toDateInput(dates.from)} className={inputClass} />
        </label>
      )}
      {dates.to && (
        <label className={label}>
          To
          <input type="date" name="f_to" defaultValue={toDateInput(dates.to)} className={inputClass} />
        </label>
      )}
      <button type="submit" className={buttonClass("primary")}>
        Show
      </button>
      <a href={`${exportPath}?${new URLSearchParams(params)}`} className={`${buttonClass("tool")} ml-auto`} download>
        Export
      </a>
    </form>
  );
}

/** Report params from the page's search params: only the f_* keys the reports read. */
export const reportParams = (sp: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(Object.entries(sp).filter((e): e is [string, string] => /^f_\w+$/.test(e[0]) && typeof e[1] === "string" && e[1] !== ""));
