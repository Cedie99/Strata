"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionState } from "@/core/forms";
import {
  columnFilterParams,
  columnType,
  GRID_PAGE_SIZE,
  type ColumnFilter,
  type GridCell,
  type GridColumn,
  type GridFilter,
  type GridQuery,
  type GridRow,
} from "@/core/grid";
import { Button, buttonClass, LinkButton } from "./button";
import { ColumnFilterMenu, describeColumnFilter } from "./column-filter";
import { ConfirmDialog } from "./confirm-dialog";
import { ActiveFilterChips, countActive, FiltersPanel } from "./grid-filters";
import { tableClass } from "./layout";

const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const tones = { danger: "text-danger font-semibold", ok: "text-ok", muted: "text-muted" };
const EMPTY = new Set(["", "-", "—"]);
// "Oct 28, 2026, 10:17 AM" → date part and time part.
const DATE_TIME = /^(.*?),?\s(\d{1,2}:\d{2}(?:\s?[AP]M)?)$/i;
const BADGES = {
  ok: "bg-ok/12 text-ok ring-ok/25",
  muted: "bg-muted/10 text-muted ring-muted/20",
  danger: "bg-danger/10 text-danger ring-danger/25",
};

/** One grid cell, styled by column kind so long, dense lists stay easy to scan. */
function CellView({ column, cell, selected }: { column: GridColumn; cell: GridCell; selected: boolean }) {
  const { text, tone, hint } = typeof cell === "string" ? { text: cell, tone: undefined, hint: undefined } : cell;
  if (EMPTY.has(text)) return <span className={selected ? "opacity-60" : "text-muted/60"}>—</span>;

  if (column.kind === "status") {
    const t = tone ?? (/^(active|yes|open|posted|approved)$/i.test(text) ? "ok" : "muted");
    return (
      <span
        className={`inline-block rounded-full px-2 py-px text-[11px] font-semibold ring-1 ring-inset ${selected ? "bg-white/15 text-white ring-white/30" : BADGES[t]}`}
      >
        {text}
      </span>
    );
  }
  if (column.kind === "date") {
    const m = DATE_TIME.exec(text);
    if (m)
      return (
        <>
          {m[1]} <span className={selected ? "opacity-75" : "text-muted"}>{m[2]}</span>
        </>
      );
  }
  return (
    <>
      <span className={selected || !tone ? undefined : tones[tone]}>{text}</span>
      {hint && (
        <span
          className={`ml-1.5 rounded-sm px-1 py-px text-[10px] font-bold tracking-wide ${selected ? "bg-white/20" : tone === "danger" ? "bg-danger text-white" : "bg-muted/15 text-muted"}`}
        >
          {hint}
        </span>
      )}
    </>
  );
}

/**
 * The standard list screen: search box, NEW / EDIT / DELETE, a selectable grid,
 * a pager and an A–Z bar. Search, letter and page travel in the URL so the server
 * does the filtering; selection lives here.
 *
 * Click a row to select it, double-click (or Enter) to open it.
 */
export function DataGrid({
  columns,
  rows: serverRows,
  query,
  total: serverTotal,
  newHref,
  canEdit = true,
  onDelete,
  deleteHint = "These records cannot be deleted. Mark them inactive instead.",
  letters = true,
  searchPlaceholder = "Search",
  exportPath,
  importHref,
  filters = [],
  noun = ["record", "records"],
}: {
  columns: GridColumn[];
  rows: GridRow[];
  query: GridQuery;
  total: number;
  /** Target of NEW; the button is disabled without it. */
  newHref?: string;
  canEdit?: boolean;
  /** Deletes the selected ids; the button is disabled without it. */
  onDelete?: (ids: string[]) => Promise<ActionState>;
  deleteHint?: string;
  letters?: boolean;
  searchPlaceholder?: string;
  /** Excel download of every row matching the current search/letter, e.g. "/export/products". */
  exportPath?: string;
  /** Page for uploading rows from Excel. */
  importHref?: string;
  /** Column filters offered in the Filters panel (see GridFilter). */
  filters?: GridFilter[];
  /** What the rows are, singular and plural, for the delete dialog ("Delete 2 roles?"). */
  noun?: [string, string];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  // Rows the server has confirmed deleted are hidden at once; the refreshed list (a few seconds later) agrees.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const rows = serverRows.filter((r) => !removed.has(r.id));
  const total = serverTotal - (serverRows.length - rows.length);
  const [pending, startTransition] = useTransition();
  const activeFilters = countActive(filters, query.filters);
  const [showFilters, setShowFilters] = useState(activeFilters > 0);

  const visible = rows.filter((r) => selected.has(r.id));
  const allChecked = rows.length > 0 && visible.length === rows.length;
  const pages = Math.max(1, Math.ceil(total / GRID_PAGE_SIZE));
  const from = total === 0 ? 0 : (query.page - 1) * GRID_PAGE_SIZE + 1;

  // Every link keeps the search, letter and filters; changing any of them goes back to page 1.
  const href = (patch: Partial<GridQuery>) => {
    const next = { ...query, ...patch };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.letter) params.set("letter", next.letter);
    for (const [k, v] of Object.entries(next.filters)) params.set(k, v);
    for (const [k, v] of columnFilterParams(next.columns)) params.set(k, v);
    if (next.page > 1) params.set("page", String(next.page));
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const withoutFilters = (keys: string[]) =>
    href({ page: 1, filters: Object.fromEntries(Object.entries(query.filters).filter(([k]) => !keys.includes(k))) });
  /** Hidden inputs that carry the current filters through a GET form. */
  const keepFilters = [...Object.entries(query.filters), ...columnFilterParams(query.columns)].map(([k, v]) => (
    <input key={k} type="hidden" name={k} value={v} />
  ));
  /** Sets (or with null, removes) one column header filter and goes back to page 1. */
  const columnHref = (key: string, filter: ColumnFilter | null) => {
    const next = { ...query.columns };
    if (filter) next[key] = filter;
    else delete next[key];
    return href({ page: 1, columns: next });
  };
  const activeColumns = columns.filter((c) => query.columns[c.key]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const open = (row: GridRow) => row.href && router.push(row.href);

  // DELETE opens the confirmation dialog; the dialog runs the delete and shows any refusal inside it.
  const askDelete = () => {
    if (!onDelete || visible.length === 0) return;
    setError(undefined);
    setConfirming(true);
  };
  const remove = () => {
    if (!onDelete) return;
    startTransition(async () => {
      const result = await onDelete(visible.map((r) => r.id));
      if (result?.error) setError(result.error);
      else {
        setRemoved((prev) => new Set([...prev, ...visible.map((r) => r.id)]));
        setSelected(new Set());
        setConfirming(false);
      }
    });
  };

  const editable = canEdit && visible.length === 1 && !!visible[0].href;
  // The main identifier of each record (first column that is not a date or a number) is bold to anchor the row.
  const primaryKey = columns.find((c) => c.kind !== "date" && c.align !== "right")?.key;

  return (
    <div className="px-1">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full max-w-xl items-center gap-1.5">
          <form action={pathname} className="relative w-full max-w-sm">
            {query.letter && <input type="hidden" name="letter" value={query.letter} />}
            {keepFilters}
            <input
              name="q"
              defaultValue={query.q}
              placeholder={searchPlaceholder}
              aria-label="Search"
              className="w-full border border-border py-1 pr-7 pl-2 text-[13.5px] placeholder:text-muted/80 focus:border-primary focus:outline-none"
            />
            <button aria-label="Search" className="absolute top-0 right-1 bottom-0 text-muted hover:text-text">
              <svg viewBox="0 0 16 16" className="size-4 fill-none stroke-current stroke-2" aria-hidden>
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M10 10l4.5 4.5" />
              </svg>
            </button>
          </form>
          {filters.length > 0 && (
            <Button
              variant="tool"
              type="button"
              aria-expanded={showFilters}
              onClick={() => setShowFilters((v) => !v)}
              className={`shrink-0 ${showFilters || activeFilters ? "border-primary! text-primary" : ""}`}
            >
              <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden>
                <path d="M1 2h14l-5.5 6.5V14l-3-1.5v-4z" />
              </svg>
              Filters
              {activeFilters > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-text">
                  {activeFilters}
                </span>
              )}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {importHref && (
            <LinkButton variant="tool" href={importHref} title="Upload rows from an Excel file">
              Import
            </LinkButton>
          )}
          {exportPath && (
            <a
              className={buttonClass("tool")}
              href={`${exportPath}${href({ page: 1 }).slice(pathname.length)}`}
              title="Download the rows matching the current filter as an Excel file"
              download
            >
              Export
            </a>
          )}
          <Button variant="tool" type="button" disabled={!newHref} onClick={() => newHref && router.push(newHref)}>
            New
          </Button>
          <Button
            variant="tool"
            type="button"
            disabled={!editable}
            title={canEdit ? "Select one row to edit" : "This list is read-only"}
            onClick={() => editable && open(visible[0])}
          >
            Edit
          </Button>
          <Button
            variant="tool"
            type="button"
            disabled={!onDelete || visible.length === 0 || pending}
            title={onDelete ? "Delete the selected rows" : deleteHint}
            onClick={askDelete}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {showFilters && filters.length > 0 && (
        <FiltersPanel
          action={pathname}
          filters={filters}
          values={query.filters}
          keep={{ ...(query.q && { q: query.q }), ...(query.letter && { letter: query.letter }) }}
          clearHref={withoutFilters(Object.keys(query.filters))}
        />
      )}
      <ActiveFilterChips filters={filters} values={query.filters} hrefWithout={withoutFilters} />
      {activeColumns.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Column filters</span>
          {activeColumns.map((c) => (
            <Link
              key={c.key}
              href={columnHref(c.key, null)}
              title="Remove this filter"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/8 px-2.5 py-0.5 text-[12px] font-semibold text-primary hover:border-danger hover:bg-danger/8 hover:text-danger"
            >
              {c.label} {describeColumnFilter(columnType(c), query.columns[c.key])}
              <span aria-hidden>✕</span>
            </Link>
          ))}
          {activeColumns.length > 1 && (
            <Link
              href={href({ page: 1, columns: {} })}
              className="px-1 text-[12px] font-semibold text-muted hover:text-danger"
            >
              Clear all
            </Link>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Delete ${visible.length} ${visible.length === 1 ? noun[0] : noun[1]}?`}
        items={visible.map((r) => {
          const cell = primaryKey ? r.cells[primaryKey] : undefined;
          return (typeof cell === "object" ? cell.text : cell) || r.id;
        })}
        pending={pending}
        error={error}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        This cannot be undone. The audit log keeps a copy of what was deleted.
      </ConfirmDialog>

      <div className="max-h-[calc(100vh-17rem)] min-h-40 overflow-auto border border-border bg-surface">
        <table className={`${tableClass} [&_th]:sticky [&_th]:top-0 [&_th]:z-10`}>
          <thead>
            <tr>
              <th className="w-7">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="align-middle"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </th>
              {columns.map((c) => (
                <th key={c.key}>
                  <div className={`flex items-center gap-1.5 ${c.align === "right" ? "justify-end" : ""}`}>
                    <span>{c.label}</span>
                    <ColumnFilterMenu
                      label={c.label}
                      type={columnType(c)}
                      current={query.columns[c.key]}
                      onApply={(filter) => router.push(columnHref(c.key, filter))}
                    />
                  </div>
                </th>
              ))}
              <th className="w-full" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="py-6! text-center text-muted">
                  {query.q || query.letter ? "Nothing matches this filter." : "No records yet."}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isSelected = selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => setSelected(new Set([row.id]))}
                  onDoubleClick={() => open(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open(row);
                    if (e.key === " ") {
                      e.preventDefault();
                      toggle(row.id);
                    }
                  }}
                  className={`cursor-default outline-none ${
                    isSelected ? "bg-row-selected! text-white" : "hover:bg-row-hover focus-visible:bg-row-hover"
                  }`}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      className="align-middle"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  {columns.map((c) => {
                    const cell = row.cells[c.key] ?? "";
                    const text = typeof cell === "string" ? cell : cell.text;
                    return (
                      <td
                        key={c.key}
                        title={text.length > 28 ? text : undefined}
                        className={`max-w-80 overflow-hidden text-ellipsis ${c.align === "right" ? "text-right tabular-nums" : ""} ${
                          c.mono ? "font-mono text-[12px] tracking-tight" : ""
                        } ${c.key === primaryKey ? "font-semibold" : ""}`}
                      >
                        <CellView column={c} cell={cell} selected={isSelected} />
                      </td>
                    );
                  })}
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-x border-b border-border px-3 py-1.5 text-[12px] text-muted">
        <div className="flex items-center gap-2">
          <PageLink href={href({ page: 1 })} disabled={query.page <= 1} label="First page">
            ⏮
          </PageLink>
          <PageLink href={href({ page: query.page - 1 })} disabled={query.page <= 1} label="Previous page">
            ◀
          </PageLink>
          <form action={pathname} className="flex items-center gap-1.5">
            {query.q && <input type="hidden" name="q" value={query.q} />}
            {query.letter && <input type="hidden" name="letter" value={query.letter} />}
            {keepFilters}
            Page
            <input
              key={query.page}
              name="page"
              defaultValue={query.page}
              aria-label="Page number"
              inputMode="numeric"
              className="w-10 border border-border px-1 text-center font-semibold text-text"
            />
            of {pages}
          </form>
          <PageLink href={href({ page: query.page + 1 })} disabled={query.page >= pages} label="Next page">
            ▶
          </PageLink>
          <PageLink href={href({ page: pages })} disabled={query.page >= pages} label="Last page">
            ⏭
          </PageLink>
        </div>
        <span>
          <span className="font-semibold text-text">
            {from.toLocaleString()}–{Math.min(query.page * GRID_PAGE_SIZE, total).toLocaleString()}
          </span>{" "}
          of <span className="font-semibold text-text">{total.toLocaleString()}</span> items
        </span>
      </div>

      {letters && (
        <div className="flex overflow-x-auto border-x border-b border-border">
          {[["All", ""], ...LETTERS.map((l) => [l, l])].map(([label, value]) => (
            <Link
              key={label}
              href={href({ letter: value, page: 1 })}
              className={`flex-1 px-1.5 py-1.5 text-center text-[12px] font-semibold ${
                query.letter === value
                  ? "bg-row-alt font-bold text-text shadow-[inset_0_-2px_0_var(--accent)]"
                  : "text-muted hover:bg-row-hover hover:text-text"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: string;
}) {
  return disabled ? (
    <span className="px-1 text-muted opacity-40" aria-hidden>
      {children}
    </span>
  ) : (
    <Link href={href} aria-label={label} className="px-1 hover:text-primary">
      {children}
    </Link>
  );
}
