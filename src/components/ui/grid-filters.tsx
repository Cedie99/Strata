"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { GridFilter } from "@/core/grid";
import { Button } from "./button";

const inputClass =
  "w-full rounded-sm border border-border bg-surface px-2 py-1 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";
const labelClass = "mb-1 block text-[11px] font-bold tracking-[0.06em] text-muted uppercase";

/** URL keys a filter uses. */
export const filterKeys = (f: GridFilter) =>
  f.type === "date"
    ? [`f_${f.key}_from`, `f_${f.key}_to`]
    : f.type === "number"
      ? [`f_${f.key}_min`, `f_${f.key}_max`]
      : [`f_${f.key}`];

/** A short description of an active filter, e.g. "Status: Active" or "Date: Oct 1 – Oct 31". */
function describe(f: GridFilter, values: Record<string, string>) {
  const [a, b] = filterKeys(f).map((k) => values[k]);
  if (!a && !b) return null;
  if (f.type === "select") return `${f.label}: ${f.options?.find((o) => o.value === a)?.label ?? a}`;
  if (f.type === "text") return `${f.label} contains “${a}”`;
  if (f.type === "date") return `${f.label}: ${a ? `from ${a}` : ""}${a && b ? " " : ""}${b ? `to ${b}` : ""}`;
  return `${f.label}: ${a ? `≥ ${a}` : ""}${a && b ? " and " : ""}${b ? `≤ ${b}` : ""}`;
}

export function countActive(filters: GridFilter[], values: Record<string, string>) {
  return filters.filter((f) => describe(f, values)).length;
}

/**
 * The Filters panel: one field per filter, sent as a GET form so filters live in the URL
 * (shareable, kept while paging, used by Export). Search text and the A–Z letter are kept.
 */
export function FiltersPanel({
  action,
  filters,
  values,
  keep,
  clearHref,
}: {
  action: string;
  filters: GridFilter[];
  values: Record<string, string>;
  keep: Record<string, string>;
  clearHref: string;
}) {
  return (
    <form
      action={action}
      // Leave empty fields out of the URL, so links stay short and shareable.
      onSubmit={(e) => {
        for (const el of e.currentTarget.elements)
          if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name && el.value === "") el.disabled = true;
      }}
      className="mb-1.5 border border-border bg-row-alt px-3 py-3"
    >
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-3">
        {filters.map((f) => {
          const [k1, k2] = filterKeys(f);
          return (
            <div key={f.key} className={f.type === "date" ? "min-w-0 sm:col-span-2 sm:max-w-md" : "min-w-0"}>
              <span className={labelClass}>{f.label}</span>
              {f.type === "select" && (
                <select name={k1} defaultValue={values[k1] ?? ""} className={inputClass} aria-label={f.label}>
                  <option value="">Any</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              {f.type === "text" && (
                <input
                  name={k1}
                  defaultValue={values[k1] ?? ""}
                  placeholder="Contains…"
                  className={inputClass}
                  aria-label={f.label}
                />
              )}
              {(f.type === "date" || f.type === "number") && (
                <div className="flex items-center gap-1.5">
                  <input
                    name={k1}
                    type={f.type === "date" ? "date" : "number"}
                    step="any"
                    defaultValue={values[k1] ?? ""}
                    placeholder="Min"
                    aria-label={`${f.label} ${f.type === "date" ? "from" : "minimum"}`}
                    className={`${inputClass} min-w-0`}
                  />
                  <span className="text-muted">–</span>
                  <input
                    name={k2}
                    type={f.type === "date" ? "date" : "number"}
                    step="any"
                    defaultValue={values[k2] ?? ""}
                    placeholder="Max"
                    aria-label={`${f.label} ${f.type === "date" ? "to" : "maximum"}`}
                    className={`${inputClass} min-w-0`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit">Apply filters</Button>
        <Link href={clearHref} className="px-2 text-[12px] font-semibold text-muted hover:text-danger">
          Clear all
        </Link>
      </div>
    </form>
  );
}

/** The active filters as chips; ✕ removes one. */
export function ActiveFilterChips({
  filters,
  values,
  hrefWithout,
}: {
  filters: GridFilter[];
  values: Record<string, string>;
  hrefWithout: (keys: string[]) => string;
}) {
  const active = filters.map((f) => ({ f, text: describe(f, values) })).filter((a) => a.text);
  if (active.length === 0) return null;
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Filtered by</span>
      {active.map(({ f, text }) => (
        <Link
          key={f.key}
          href={hrefWithout(filterKeys(f))}
          title="Remove this filter"
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/8 px-2.5 py-0.5 text-[12px] font-semibold text-primary hover:border-danger hover:bg-danger/8 hover:text-danger"
        >
          {text}
          <span aria-hidden>✕</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Filters button + panel + chips for pages that are not a DataGrid (e.g. the audit log).
 * `keep` holds other URL values to preserve, such as a selected tab.
 */
export function FilterBar({
  filters,
  values,
  keep = {},
}: {
  filters: GridFilter[];
  values: Record<string, string>;
  keep?: Record<string, string>;
}) {
  const pathname = usePathname();
  const active = countActive(filters, values);
  const [open, setOpen] = useState(active > 0);
  const hrefWith = (vals: Record<string, string>) => {
    const s = new URLSearchParams({ ...keep, ...vals }).toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const hrefWithout = (keys: string[]) =>
    hrefWith(Object.fromEntries(Object.entries(values).filter(([k]) => !keys.includes(k))));

  return (
    <div>
      <Button
        variant="tool"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`mb-1.5 ${open || active ? "border-primary! text-primary" : ""}`}
      >
        <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden>
          <path d="M1 2h14l-5.5 6.5V14l-3-1.5v-4z" />
        </svg>
        Filters
        {active > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-text">{active}</span>
        )}
      </Button>
      {open && (
        <FiltersPanel action={pathname} filters={filters} values={values} keep={keep} clearHref={hrefWith({})} />
      )}
      <ActiveFilterChips filters={filters} values={values} hrefWithout={hrefWithout} />
    </div>
  );
}
