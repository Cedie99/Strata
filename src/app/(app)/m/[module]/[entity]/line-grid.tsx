"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyRow } from "@/components/ui/layout";
import {
  computeFormulas,
  defaultInput,
  displayValue,
  NO_DEFAULT,
  type CustomField,
  type RecordData,
} from "@/modules/custom/fields";

type Choice = { value: string; label: string; attrs?: Record<string, string>; retired?: boolean };

/** What the server sends for one grid (see lineGridsFor in modules/custom/lines.ts). */
export type LineGridData = {
  name: string;
  title: string;
  href: string;
  columns: CustomField[];
  allFields: CustomField[];
  choices: Record<string, Choice[]>;
  rows: { id: string; values: RecordData }[];
  canEdit: boolean;
};

type Row = { key: number; id?: string; values: Record<string, string | boolean> };

const cell = "w-full min-w-24 rounded-sm border border-border px-1.5 py-1 outline-none focus:border-primary";
const INPUT_TYPES: Partial<Record<CustomField["type"], string>> = { date: "date", datetime: "datetime-local", email: "email", phone: "tel", url: "url" };

const plain = (values: RecordData) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v])) as Record<string, string | boolean>;

/**
 * Child records edited as lines of the parent form. The whole grid travels as one JSON field and is
 * saved together with the parent; rows removed here are deleted when the parent is saved.
 */
export function LineGrid({ grid, readOnly }: { grid: LineGridData; readOnly: boolean }) {
  const editable = grid.canEdit && !readOnly;
  const [rows, setRows] = useState<Row[]>(() => grid.rows.map((r, i) => ({ key: i, id: r.id, values: plain(r.values) })));
  const [nextKey, setNextKey] = useState(grid.rows.length);

  const blank = (): Row["values"] =>
    Object.fromEntries(
      grid.columns
        .filter((f) => f.defaultValue && !NO_DEFAULT.includes(f.type))
        .map((f) => {
          const v = defaultInput(f);
          return [f.key, f.type === "checkbox" ? v === "on" : Array.isArray(v) ? v.join(", ") : v];
        }),
    );
  // Changing a column other lookups filter by clears them, as in the main form.
  const update = (key: number, patch: Row["values"]) => {
    const cleared = Object.fromEntries(grid.columns.filter((c) => c.filterBy && c.filterBy in patch).map((c) => [c.key, ""]));
    setRows((list) => list.map((r) => (r.key === key ? { ...r, values: { ...r.values, ...cleared, ...patch } } : r)));
  };

  const input = (row: Row, f: CustomField) => {
    const value = row.values[f.key];
    const calc = computeFormulas(grid.allFields, row.values);
    if (f.type === "formula") return <span className="font-medium">{displayValue(f, calc[f.key] as string) || "—"}</span>;
    if (f.type === "autonumber") return <span className="text-muted">{String(value || "on save")}</span>;
    if (!editable) {
      const labels = f.type === "lookup" ? new Map((grid.choices[f.key] ?? []).map((o) => [o.value, o.label])) : undefined;
      return displayValue(f, value, labels);
    }
    const label = `${f.label}, line ${rows.indexOf(row) + 1}`;
    if (f.type === "checkbox")
      return (
        <input type="checkbox" aria-label={label} className="size-4 accent-primary" checked={value === true} onChange={(e) => update(row.key, { [f.key]: e.target.checked })} />
      );
    if (f.type === "select" || f.type === "lookup") {
      let options: Choice[] = f.type === "select" ? f.options.map((o) => ({ value: o, label: o })) : (grid.choices[f.key] ?? []);
      // A filter on another column of the same line (e.g. Class by Type); filters on other fields are not applied here.
      const by = f.filterBy && grid.columns.some((c) => c.key === f.filterBy) ? String(row.values[f.filterBy] ?? "") : null;
      if (by !== null) options = by ? options.filter((o) => o.attrs?.[f.filterAttr] === by) : [];
      options = options.filter((o) => !o.retired || o.value === value);
      return (
        <select aria-label={label} className={cell} value={String(value ?? "")} onChange={(e) => update(row.key, { [f.key]: e.target.value })}>
          <option value="">{by === "" ? "—" : "Choose…"}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        aria-label={label}
        className={cell}
        type={INPUT_TYPES[f.type] ?? "text"}
        inputMode={["number", "decimal", "money", "percent"].includes(f.type) ? "decimal" : undefined}
        value={String(value ?? "")}
        onChange={(e) => update(row.key, { [f.key]: e.target.value })}
      />
    );
  };

  return (
    <div className="space-y-2">
      {editable && (
        <input type="hidden" name={grid.name} value={JSON.stringify(rows.map((r) => ({ id: r.id, values: r.values })))} />
      )}
      <DataTable>
        <thead>
          <tr>
            <th className="w-10">#</th>
            {grid.columns.map((c) => (
              <th key={c.key}>
                {c.label}
                {c.required && editable && <span className="ml-0.5 text-danger">*</span>}
              </th>
            ))}
            {editable && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={grid.columns.length + 2}>No lines yet.</EmptyRow>}
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="text-muted">
                {r.id ? (
                  <Link href={`${grid.href}/${r.id}`} className="hover:underline" title="Open this line as a record">
                    {i + 1}
                  </Link>
                ) : (
                  i + 1
                )}
              </td>
              {grid.columns.map((c) => (
                <td key={c.key}>{input(r, c)}</td>
              ))}
              {editable && (
                <td>
                  <button
                    type="button"
                    className="px-1 text-muted hover:text-danger"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
      {editable && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setRows((list) => [...list, { key: nextKey, values: blank() }]);
              setNextKey((k) => k + 1);
            }}
          >
            Add line
          </Button>
          <span className="text-xs text-muted">Lines are saved, changed and removed when you save this record.</span>
        </div>
      )}
    </div>
  );
}
