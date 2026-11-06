import "server-only";
import type { CustomEntity } from "@prisma/client";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import {
  dateCell,
  filterGrid,
  finishGrid,
  type FilterDef,
  type GridCell,
  type GridColumn,
  type GridList,
  type GridQuery,
} from "@/core/grid";
import { APPROVAL_STATUSES, displayValue, isSearchable, NUMERIC_TYPES, parseData, showsInList, type CustomField, type RecordData } from "./fields";
import { lookupLabels } from "./lookups";

const NUMERIC = new Set<string>(NUMERIC_TYPES);

/** Records of one admin-built record type. Values live in a JSON column, so filtering happens in memory. */
export async function recordList(
  entity: CustomEntity & { module: { slug: string } },
  fields: CustomField[],
  query: GridQuery,
  { all }: { all?: boolean } = {},
): Promise<GridList> {
  const base = `/m/${entity.module.slug}/${entity.slug}`;
  const records = (
    await db.customRecord.findMany({ where: { entityId: entity.id }, orderBy: { createdAt: "desc" } })
  ).map((r) => ({ ...r, values: parseData(r.data) }));
  const columns = fields.filter((f) => showsInList(f) || all);
  const firstField = columns[0];
  const labels = await lookupLabels(fields);
  const show = (f: CustomField, r: { values: RecordData }) => displayValue(f, r.values[f.key], labels.get(f.key));
  type R = (typeof records)[number];

  // Choice lists and yes/no fields get a dropdown in the Filters panel; every column also has its own
  // header filter (text, number or date conditions).
  const filters: FilterDef<R>[] = fields.flatMap((f): FilterDef<R>[] => {
    const raw = (r: R) => r.values[f.key];
    if (f.type === "select")
      return [
        {
          key: f.key,
          label: f.label,
          type: "select",
          options: f.options.map((o) => ({ value: o, label: o })),
          get: (r) => String(raw(r) ?? ""),
        },
      ];
    if (f.type === "lookup")
      return [
        {
          key: f.key,
          label: f.label,
          type: "select",
          options: [...(labels.get(f.key) ?? [])].map(([value, label]) => ({ value, label })),
          get: (r) => String(raw(r) ?? ""),
        },
      ];
    if (f.type === "checkbox")
      return [
        {
          key: f.key,
          label: f.label,
          type: "select",
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
          get: (r) => (raw(r) === true ? "yes" : "no"),
        },
      ];
    return [];
  });
  // Records of a record type with approval: filter by where they are in it.
  const statusText = (r: R) => APPROVAL_STATUSES[(r.status || "APPROVED") as keyof typeof APPROVAL_STATUSES] ?? r.status;
  if (entity.approval)
    filters.unshift({
      key: "__status",
      label: "Status",
      type: "select",
      options: Object.entries(APPROVAL_STATUSES).map(([value, label]) => ({ value, label })),
      get: (r) => r.status || "APPROVED",
    });
  const matched = filterGrid(records, query, {
    text: (r) => fields.filter(isSearchable).map((f) => show(f, r)).join(" "),
    first: (r) => (firstField ? show(firstField, r) : ""),
    filters,
    all: true,
  });
  const gridColumns: GridColumn[] = [
    { key: "__created", label: "Date Created", kind: "date" },
    ...(entity.approval ? [{ key: "__status", label: "Status", kind: "status" as const }] : []),
    ...columns.map((f) => ({
      key: f.key,
      label: f.label,
      align: NUMERIC.has(f.type) ? ("right" as const) : undefined,
      kind: f.type === "date" || f.type === "datetime" ? ("date" as const) : undefined,
    })),
  ];
  const rows = matched.rows.map((r) => ({
    id: r.id,
    href: `${base}/${r.id}`,
    cells: {
      __created: dateCell(r.createdAt, formatDateTime),
      ...(entity.approval && {
        __status: { text: statusText(r), tone: r.status === "REJECTED" ? ("danger" as const) : undefined },
      }),
      ...Object.fromEntries(
        columns.map((f): [string, GridCell] => {
          const text = show(f, r);
          if (text === "—") return [f.key, text];
          if (NUMERIC.has(f.type)) return [f.key, { text, value: Number(r.values[f.key]) }];
          if (f.type === "datetime") return [f.key, { text, value: `${r.values[f.key]}:00` }];
          // Stored as YYYY-MM-DD; noon keeps the same calendar day in every time zone.
          if (f.type === "date") return [f.key, { text, value: `${text}T12:00:00` }];
          return [f.key, text];
        }),
      ),
    },
  }));
  return finishGrid(rows, gridColumns, query, { all, filters: matched.filters });
}
