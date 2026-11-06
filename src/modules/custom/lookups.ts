import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/core/db";
import { itemClassPath } from "@/modules/inventory/queries";
import { APPROVAL_STATUSES, displayValue, isActiveRecord, isData, parseData, parseFields, uniqueKey, type CustomField, type RecordData } from "./fields";

/**
 * What a Lookup field can link to: built-in lists, or the records of any admin-built record type
 * ("custom:<record type id>", shown by the record's first field). The record stores the linked id.
 *
 * Each target also lists the attributes its records can be filtered by, so a lookup can depend on
 * another field of the form (Item Class filtered by Item Type, Warehouse filtered by Branch, …).
 * To offer another built-in list, add it to BUILT_IN and to optionsFor().
 */
const BUILT_IN: LookupTarget[] = [
  { value: "itemtype", label: "Item types", attrs: [] },
  {
    value: "itemclass",
    label: "Item classes",
    attrs: [
      { value: "itemType", label: "Item type" },
      { value: "parent", label: "Parent class" },
    ],
  },
  { value: "product", label: "Products", attrs: [] },
  { value: "warehouse", label: "Warehouses", attrs: [{ value: "branch", label: "Branch" }] },
  { value: "customer", label: "Customers", attrs: [] },
  { value: "branch", label: "Branches", attrs: [] },
  { value: "user", label: "Users", attrs: [] },
];

const MAX_OPTIONS = 5000;

/** `retired`: kept so stored values still show a name, but not offered as a new choice. */
export type LookupOption = { value: string; label: string; attrs?: Record<string, string>; retired?: boolean };
export type LookupTarget = { value: string; label: string; attrs: { value: string; label: string }[] };

/** Every lookup target with its filterable attributes, for the module builder. */
export async function getLookupTargets(): Promise<LookupTarget[]> {
  const entities = await db.customEntity.findMany({
    include: { module: { select: { name: true } } },
    orderBy: [{ module: { name: "asc" } }, { sortOrder: "asc" }],
  });
  return [
    ...BUILT_IN,
    ...entities.map((e) => ({
      value: `custom:${e.id}`,
      label: `${e.module.name} › ${e.name}`,
      attrs: parseFields(e.fields)
        .filter((f) => isData(f) && f.type !== "file")
        .map((f) => ({ value: f.key, label: f.label })),
    })),
  ];
}

const asText = (v: RecordData[string] | undefined) => (Array.isArray(v) ? v.join(",") : String(v ?? ""));

/** The records a lookup target offers, as id + label (+ filterable attributes), sorted by label. */
async function optionsFor(target: string): Promise<LookupOption[]> {
  const take = MAX_OPTIONS;
  const sort = (list: LookupOption[]) => list.sort((a, b) => a.label.localeCompare(b.label));
  switch (target) {
    case "itemtype":
      // Retired types stay so records that chose them still show the name; new choices skip them (see lookupChoices).
      return (await db.itemType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })).map((t) => ({
        value: t.id,
        label: t.isActive ? t.name : `${t.name} (retired)`,
        retired: !t.isActive,
      }));
    case "product":
      return (await db.product.findMany({ take, orderBy: { sku: "asc" } })).map((p) => ({
        value: p.id,
        label: `${p.sku} · ${p.name}`,
      }));
    case "warehouse":
      return (await db.warehouse.findMany({ take, orderBy: { code: "asc" } })).map((w) => ({
        value: w.id,
        label: `${w.code} · ${w.name}`,
        attrs: { branch: w.branchId },
      }));
    case "customer":
      return (await db.customer.findMany({ take, orderBy: { code: "asc" } })).map((c) => ({
        value: c.id,
        label: `${c.code} · ${c.name}`,
      }));
    case "branch":
      return (await db.branch.findMany({ take, orderBy: { code: "asc" } })).map((b) => ({
        value: b.id,
        label: `${b.code} · ${b.name}`,
      }));
    case "user":
      return (await db.user.findMany({ take, orderBy: { name: "asc" } })).map((u) => ({ value: u.id, label: u.name }));
    case "itemclass": {
      const classes = await db.itemClass.findMany({ take, select: { id: true, parentId: true, itemTypeId: true, description: true } });
      const byId = new Map(classes.map((c) => [c.id, c]));
      return sort(
        classes.map((c) => ({
          value: c.id,
          // Filtered by item type, the type is already chosen, so the label leaves it out.
          label: itemClassPath(byId, c.id),
          attrs: { itemType: c.itemTypeId, parent: c.parentId ?? "" },
        })),
      );
    }
  }
  if (target.startsWith("custom:")) {
    const entity = await db.customEntity.findUnique({ where: { id: target.slice(7) } });
    if (!entity) return [];
    const fields = parseFields(entity.fields);
    // Named by the first field that reads well on its own (not another lookup, a file or a heading).
    const first = fields.find((f) => isData(f) && !["lookup", "file", "checkbox"].includes(f.type));
    const records = await db.customRecord.findMany({
      where: { entityId: entity.id },
      take,
      select: { id: true, data: true, status: true },
    });
    return sort(
      records.map((r) => {
        const data = parseData(r.data);
        const label = first ? displayValue(first, data[first.key]) : r.id;
        // With approval on, only approved records are offered as new choices.
        const active = isActiveRecord(r.status);
        return {
          value: r.id,
          label: active ? label : `${label} (${APPROVAL_STATUSES[r.status as keyof typeof APPROVAL_STATUSES]?.toLowerCase() ?? r.status})`,
          retired: !active,
          attrs: Object.fromEntries(fields.filter(isData).map((f) => [f.key, asText(data[f.key])])),
        };
      }),
    );
  }
  return [];
}

/**
 * Choices for every lookup field of a record type, keyed by field key (for the record form).
 * Only the attribute a field is filtered by is kept, so the page stays small.
 */
export async function lookupChoices(fields: CustomField[]) {
  const lookups = fields.filter((f) => f.type === "lookup");
  const byTarget = new Map<string, Promise<LookupOption[]>>();
  for (const f of lookups) if (!byTarget.has(f.target)) byTarget.set(f.target, optionsFor(f.target));
  const out: Record<string, LookupOption[]> = {};
  for (const f of lookups) {
    const list = await byTarget.get(f.target)!;
    out[f.key] = list.map(({ value, label, attrs, retired }) => ({
      value,
      label,
      ...(f.filterBy && f.filterAttr && { attrs: { [f.filterAttr]: attrs?.[f.filterAttr] ?? "" } }),
      ...(retired && { retired }),
    }));
  }
  return out;
}

/** id → label for every lookup field, for showing records in lists and exports. */
export async function lookupLabels(fields: CustomField[]) {
  const choices = await lookupChoices(fields);
  return new Map(Object.entries(choices).map(([key, list]) => [key, new Map(list.map((o) => [o.value, o.label]))]));
}

/**
 * Checks lookup values point at existing records, and that filtered lookups match the field they
 * depend on (an Item Class of the chosen Item Type). `context` is the whole record after saving,
 * for when the field depended on is not being changed. Imports may give the label instead of the
 * id (e.g. "SKU-001 · Engine oil", or just "SKU-001"), which is converted here.
 */
export async function resolveLookups(
  fields: CustomField[],
  data: RecordData,
  choices?: Record<string, LookupOption[]>,
  context: RecordData = data,
) {
  const all = choices ?? (await lookupChoices(fields));
  const fieldErrors: Record<string, string[]> = {};
  for (const f of fields) {
    const value = data[f.key];
    if (f.type !== "lookup" || typeof value !== "string" || !value) continue;
    const want = f.filterBy ? asText(context[f.filterBy] ?? data[f.filterBy]) : null;
    const list = (all[f.key] ?? []).filter((o) => want === null || o.attrs?.[f.filterAttr] === want);
    const lower = value.trim().toLowerCase();
    const hit =
      list.find((o) => o.value === value) ??
      list.find((o) => o.label.toLowerCase() === lower) ??
      list.find((o) => o.label.toLowerCase().split(" · ")[0] === lower);
    if (hit) data[f.key] = hit.value;
    else {
      const by = fields.find((x) => x.key === f.filterBy);
      fieldErrors[f.key] = [
        by && (all[f.key] ?? []).some((o) => o.value === value)
          ? `This ${f.label} does not belong to the chosen ${by.label}`
          : `"${value}" is not in the list of ${f.label}`,
      ];
    }
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

/** Fields marked unique whose value another record of the record type already has. */
export async function uniqueErrors(
  tx: Prisma.TransactionClient,
  entityId: string,
  fields: CustomField[],
  data: RecordData,
  exceptId?: string | null,
) {
  const unique = fields.filter((f) => f.unique && uniqueKey(data[f.key]) !== "");
  if (!unique.length) return null;
  const others = await tx.customRecord.findMany({
    where: { entityId, id: exceptId ? { not: exceptId } : undefined },
    select: { data: true },
  });
  const fieldErrors: Record<string, string[]> = {};
  for (const f of unique) {
    const mine = uniqueKey(data[f.key]);
    if (others.some((r) => uniqueKey(parseData(r.data)[f.key]) === mine))
      fieldErrors[f.key] = [`Another record already has this ${f.label}`];
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

/**
 * Record types with a lookup to this one, and their records that point at `recordId`:
 * shown on the record's page as related lists (an item's U/M rows, a vehicle's trips, …).
 */
export async function relatedRecords(entityId: string, recordId: string) {
  const entities = await db.customEntity.findMany({
    where: { module: { isActive: true } },
    include: { module: true },
    orderBy: [{ module: { name: "asc" } }, { sortOrder: "asc" }],
  });
  const out = [];
  for (const e of entities) {
    const fields = parseFields(e.fields);
    for (const link of fields.filter((f) => f.type === "lookup" && !f.inline && f.target === `custom:${entityId}`)) {
      const records = (await db.customRecord.findMany({ where: { entityId: e.id }, orderBy: { createdAt: "asc" } }))
        .map((r) => ({ id: r.id, values: parseData(r.data) }))
        .filter((r) => r.values[link.key] === recordId);
      out.push({ entity: e, fields, link, records });
    }
  }
  return out;
}
