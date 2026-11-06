// Search, A–Z bar, column filters and paging for list pages rendered with <DataGrid>, and the row
// shape shared by the grid and the Excel export.

/**
 * A grid cell: display text, an optional colour, a small tag shown after it (e.g. "LOW"),
 * and an optional raw value used when exporting to Excel.
 */
export type GridCell = string | { text: string; tone?: "danger" | "ok" | "muted"; hint?: string; value?: string | number };
/**
 * align "right" = numbers (right-aligned, digits lined up); mono = codes and document numbers;
 * kind "date" fades the time part; kind "status" shows the value as a coloured badge.
 */
export type GridColumn = { key: string; label: string; align?: "right"; mono?: boolean; kind?: "date" | "status" };
export type GridRow = { id: string; href?: string; cells: Record<string, GridCell> };

/**
 * A filter shown in the grid's Filters panel. In the URL it is `f_<key>` (select, text),
 * `f_<key>_from` / `f_<key>_to` (date) or `f_<key>_min` / `f_<key>_max` (number).
 */
export type GridFilter = {
  key: string;
  label: string;
  type: "select" | "text" | "date" | "number";
  options?: { value: string; label: string }[];
};

/** A filter plus how to read its value from a row, for lists filtered in memory. Server side only. */
export type FilterDef<T> = GridFilter & { get: (row: T) => string | number | Date | null | undefined };

/** Everything a list screen (and its export) needs. */
export type GridList = { columns: GridColumn[]; rows: GridRow[]; total: number; query: GridQuery; filters?: GridFilter[] };

export const GRID_PAGE_SIZE = 50;

/**
 * `filters` holds the raw f_* URL values of the Filters panel, e.g. { f_status: "active", f_price_min: "10" };
 * `columns` holds the column header filters (c_*, see "Column filters" below).
 */
export type GridQuery = {
  q: string;
  letter: string;
  page: number;
  filters: Record<string, string>;
  columns: Record<string, ColumnFilter>;
};
export type GridSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Reads search, letter, page and f_* filters from page search params or a URLSearchParams. */
export async function readGridQuery(searchParams: GridSearchParams | URLSearchParams): Promise<GridQuery> {
  const raw: Record<string, string> = {};
  const entries =
    searchParams instanceof URLSearchParams ? [...searchParams.entries()] : Object.entries(await searchParams);
  for (const [k, v] of entries) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value.trim() !== "") raw[k] = value.trim();
  }
  const filters = Object.fromEntries(Object.entries(raw).filter(([k]) => /^f_[\w]+$/.test(k)));
  return {
    q: raw.q ?? "",
    letter: /^([A-Z]|#)$/.test(raw.letter ?? "") ? raw.letter : "",
    page: Math.max(1, Number(raw.page) || 1),
    filters,
    columns: parseColumnFilters(raw),
  };
}

/** "#" matches values that do not start with a letter. */
export function startsWithLetter(value: string, letter: string) {
  if (!letter) return true;
  const first = value.trim().charAt(0).toUpperCase();
  return letter === "#" ? !/[A-Z]/.test(first) : first === letter;
}

/** Distinct values of a column as select options, sorted. */
export function optionsOf<T>(rows: T[], get: (row: T) => string | null | undefined) {
  const values = [...new Set(rows.map(get).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  return values.map((v) => ({ value: v, label: v }));
}

/** Start/end of the day for a YYYY-MM-DD filter value (local time), or undefined. */
export function dayBound(value: string | undefined, end: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (end) d.setDate(d.getDate() + 1);
  return d;
}

const toNumber = (v: string | undefined) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

/** Does a row pass one filter? Unset filters always pass. */
function passes<T>(row: T, def: FilterDef<T>, f: Record<string, string>) {
  const value = def.get(row);
  switch (def.type) {
    case "select": {
      const want = f[`f_${def.key}`];
      return want === undefined || String(value ?? "") === want;
    }
    case "text": {
      const want = f[`f_${def.key}`]?.toLowerCase();
      return want === undefined || String(value ?? "").toLowerCase().includes(want);
    }
    case "date": {
      const from = dayBound(f[`f_${def.key}_from`], false);
      const to = dayBound(f[`f_${def.key}_to`], true);
      if (!from && !to) return true;
      const d = value instanceof Date ? value : value ? new Date(String(value)) : null;
      return !!d && !Number.isNaN(d.getTime()) && (!from || d >= from) && (!to || d < to);
    }
    case "number": {
      const min = toNumber(f[`f_${def.key}_min`]);
      const max = toNumber(f[`f_${def.key}_max`]);
      if (min === undefined && max === undefined) return true;
      const n = typeof value === "number" ? value : toNumber(String(value ?? ""));
      return n !== undefined && (min === undefined || n >= min) && (max === undefined || n <= max);
    }
  }
}

/** Filter definitions without their row readers, for sending to the browser. */
export const publicFilters = <T>(defs: FilterDef<T>[]): GridFilter[] =>
  defs.map(({ key, label, type, options }) => ({ key, label, type, options }));

/**
 * Filters and pages rows in memory. `text` is what the search box looks in,
 * `first` is the value the A–Z bar filters on (usually the first column),
 * `filters` are the column filters offered in the Filters panel.
 */
export function filterGrid<T>(
  rows: T[],
  query: GridQuery,
  opts: { text: (row: T) => string; first: (row: T) => string; filters?: FilterDef<T>[]; all?: boolean },
) {
  const needle = query.q.toLowerCase();
  const defs = opts.filters ?? [];
  const matches = rows.filter(
    (r) =>
      startsWithLetter(opts.first(r), query.letter) &&
      (!needle || opts.text(r).toLowerCase().includes(needle)) &&
      defs.every((d) => passes(r, d, query.filters)),
  );
  const pages = Math.max(1, Math.ceil(matches.length / GRID_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  return {
    // `all` skips paging, for exports.
    rows: opts.all ? matches : matches.slice((page - 1) * GRID_PAGE_SIZE, page * GRID_PAGE_SIZE),
    total: matches.length,
    query: { ...query, page },
    filters: publicFilters(defs),
  };
}

// ───────────────────────── Column filters ─────────────────────────
// The funnel menu on each column header: up to two conditions joined by and/or.
// In the URL: c_<column>=<op>:<value>, c2_<column>=<op>:<value>, cj_<column>=or.

export type ColumnOp =
  | "eq"
  | "neq"
  | "contains"
  | "ncontains"
  | "starts"
  | "ends"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "empty"
  | "nempty";
export type ColumnCondition = { op: ColumnOp; value: string };
export type ColumnFilter = { a: ColumnCondition; b?: ColumnCondition; join: "and" | "or" };
export type ColumnType = "text" | "number" | "date";

export const columnType = (c: GridColumn): ColumnType =>
  c.kind === "date" ? "date" : c.align === "right" ? "number" : "text";

export const COLUMN_OPS: Record<ColumnType, { op: ColumnOp; label: string }[]> = {
  text: [
    { op: "contains", label: "Contains" },
    { op: "eq", label: "Is equal to" },
    { op: "neq", label: "Is not equal to" },
    { op: "starts", label: "Starts with" },
    { op: "ends", label: "Ends with" },
    { op: "ncontains", label: "Does not contain" },
    { op: "empty", label: "Is empty" },
    { op: "nempty", label: "Is not empty" },
  ],
  number: [
    { op: "eq", label: "Is equal to" },
    { op: "neq", label: "Is not equal to" },
    { op: "gt", label: "Is greater than" },
    { op: "gte", label: "Is greater than or equal to" },
    { op: "lt", label: "Is less than" },
    { op: "lte", label: "Is less than or equal to" },
    { op: "empty", label: "Is empty" },
    { op: "nempty", label: "Is not empty" },
  ],
  date: [
    { op: "eq", label: "Is on" },
    { op: "neq", label: "Is not on" },
    { op: "gt", label: "Is after" },
    { op: "gte", label: "Is on or after" },
    { op: "lt", label: "Is before" },
    { op: "lte", label: "Is on or before" },
    { op: "empty", label: "Is empty" },
    { op: "nempty", label: "Is not empty" },
  ],
};
const ALL_OPS = new Set(Object.values(COLUMN_OPS).flatMap((list) => list.map((o) => o.op)));
/** Operators that need no value. */
export const NO_VALUE_OPS = new Set<ColumnOp>(["empty", "nempty"]);

function parseCondition(raw: string | undefined): ColumnCondition | undefined {
  if (!raw) return undefined;
  const i = raw.indexOf(":");
  const op = (i < 0 ? raw : raw.slice(0, i)) as ColumnOp;
  const value = i < 0 ? "" : raw.slice(i + 1);
  if (!ALL_OPS.has(op) || (!NO_VALUE_OPS.has(op) && value.trim() === "")) return undefined;
  return { op, value };
}

/** Column filters from raw URL values (only c_, c2_ and cj_ keys are read). */
export function parseColumnFilters(raw: Record<string, string>): Record<string, ColumnFilter> {
  const out: Record<string, ColumnFilter> = {};
  for (const [k, v] of Object.entries(raw)) {
    const m = /^c_(\w+)$/.exec(k);
    const a = m && parseCondition(v);
    if (!m || !a) continue;
    out[m[1]] = { a, b: parseCondition(raw[`c2_${m[1]}`]), join: raw[`cj_${m[1]}`] === "or" ? "or" : "and" };
  }
  return out;
}

/** The URL parameters for a set of column filters. */
export function columnFilterParams(filters: Record<string, ColumnFilter>): [string, string][] {
  const params: [string, string][] = [];
  for (const [key, f] of Object.entries(filters)) {
    params.push([`c_${key}`, `${f.a.op}:${f.a.value}`]);
    if (f.b) params.push([`c2_${key}`, `${f.b.op}:${f.b.value}`]);
    if (f.b && f.join === "or") params.push([`cj_${key}`, "or"]);
  }
  return params;
}

const EMPTY_TEXT = new Set(["", "-", "—"]);
const cellText = (cell: GridCell | undefined) => (cell === undefined ? "" : typeof cell === "string" ? cell : cell.text);
const cellNumber = (cell: GridCell | undefined) => {
  if (cell !== undefined && typeof cell === "object" && typeof cell.value === "number") return cell.value;
  const t = cellText(cell).replace(/[^\d.-]/g, "");
  return t === "" || t === "-" ? undefined : Number(t);
};
/** Local calendar day (YYYY-MM-DD) of a date cell; date cells carry an ISO value (see dateCell). */
const cellDay = (cell: GridCell | undefined) => {
  const iso = cell !== undefined && typeof cell === "object" && typeof cell.value === "string" ? cell.value : cellText(cell);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("en-CA");
};

const compare = <V>(op: ColumnOp, a: V, b: V) =>
  op === "eq"
    ? a === b
    : op === "neq"
      ? a !== b
      : op === "gt"
        ? a > b
        : op === "gte"
          ? a >= b
          : op === "lt"
            ? a < b
            : op === "lte"
              ? a <= b
              : false;

/** Does one cell satisfy one condition? Text matching ignores case. */
export function matchCondition(type: ColumnType, cell: GridCell | undefined, { op, value }: ColumnCondition) {
  const text = cellText(cell).trim();
  if (op === "empty") return EMPTY_TEXT.has(text);
  if (op === "nempty") return !EMPTY_TEXT.has(text);
  if (type === "number") {
    const n = cellNumber(cell);
    const want = Number(value.replace(/,/g, ""));
    return n === undefined || Number.isNaN(want) ? op === "neq" : compare(op, n, want);
  }
  if (type === "date") {
    const day = cellDay(cell);
    return day === undefined ? op === "neq" : compare(op, day, value);
  }
  const t = text.toLowerCase();
  const v = value.trim().toLowerCase();
  if (op === "contains") return t.includes(v);
  if (op === "ncontains") return !t.includes(v);
  if (op === "starts") return t.startsWith(v);
  if (op === "ends") return t.endsWith(v);
  return compare(op, t, v);
}

/** A grid cell for a date: shows the formatted date and time, keeps the exact moment for filtering. */
export const dateCell = (d: Date, format: (d: Date) => string): GridCell => ({ text: format(d), value: d.toISOString() });

/** Rows that pass every column header filter. */
export function applyColumnFilters(rows: GridRow[], columns: GridColumn[], query: GridQuery) {
  const active = Object.entries(query.columns)
    .map(([key, f]) => ({ f, col: columns.find((c) => c.key === key) }))
    .filter((x): x is { f: ColumnFilter; col: GridColumn } => !!x.col);
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every(({ f, col }) => {
      const type = columnType(col);
      const a = matchCondition(type, r.cells[col.key], f.a);
      if (!f.b) return a;
      const b = matchCondition(type, r.cells[col.key], f.b);
      return f.join === "or" ? a || b : a && b;
    }),
  );
}

/**
 * The last step of an in-memory list: applies the column filters to the built rows, then pages them
 * (or returns everything with `all`, for exports). Only the page is returned, since it is sent to the browser.
 */
export function finishGrid(
  rows: GridRow[],
  columns: GridColumn[],
  query: GridQuery,
  { all, filters }: { all?: boolean; filters?: GridFilter[] } = {},
): GridList {
  const matched = applyColumnFilters(rows, columns, query);
  const pages = Math.max(1, Math.ceil(matched.length / GRID_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  return {
    columns,
    filters,
    total: matched.length,
    query: { ...query, page },
    rows: all ? matched : matched.slice((page - 1) * GRID_PAGE_SIZE, page * GRID_PAGE_SIZE),
  };
}
