"use client";

import { useState } from "react";
import type { ActionState } from "@/core/forms";
import { Button } from "@/components/ui/button";
import { ActionForm, CheckboxField, FieldErrors, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { sectionLabel } from "@/components/ui/layout";
import {
  FIELD_TYPES,
  FORMULA_FORMATS,
  isSearchable,
  NO_DEFAULT,
  NO_UNIQUE,
  showsInList,
  slugify,
  type CustomField,
  type FieldType,
  type RecordRule,
} from "@/modules/custom/fields";

export type ModuleValues = {
  name: string;
  slug: string;
  description: string;
  menu: string;
  menuGroup: string;
  menuFlat: boolean;
  isActive: boolean;
  entities: {
    id: string;
    name: string;
    slug: string;
    recordCount: number;
    fields: CustomField[];
    formLayout: string;
    approval: boolean;
    rules: RecordRule[];
  }[];
};

// `saved` marks keys/slugs already stored: records and links depend on them, so they stay fixed.
// `open` shows the field's Options panel.
type FieldDraft = Omit<CustomField, "options" | "inList" | "searchable"> & {
  options: string;
  inList: boolean;
  searchable: boolean;
  saved: boolean;
  open: boolean;
};
type EntityDraft = {
  id?: string;
  name: string;
  slug: string;
  recordCount: number;
  saved: boolean;
  fields: FieldDraft[];
  formLayout: "sections" | "tabs";
  approval: boolean;
  rules: RecordRule[];
};

const inputClass =
  "w-full rounded-sm border border-border px-2 py-1 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

const newField = (): FieldDraft => ({
  key: "",
  label: "",
  type: "text",
  required: false,
  options: "",
  target: "",
  decimals: 2,
  formula: "",
  format: "number",
  defaultValue: "",
  unique: false,
  inList: true,
  searchable: true,
  help: "",
  locked: false,
  inline: false,
  filterBy: "",
  filterAttr: "",
  showIf: "",
  showIfValue: "",
  saved: false,
  open: false,
});

const DEFAULT_HINTS: Partial<Record<FieldType, string>> = {
  date: 'A date (YYYY-MM-DD) or "today"',
  datetime: 'YYYY-MM-DDTHH:MM or "today"',
  multiselect: "Choices separated by commas",
  select: "One of the choices",
};

/** How many settings differ from a plain field, shown on the Options button. */
const settingsCount = (f: FieldDraft) =>
  [f.defaultValue, f.unique, !f.inList, !f.searchable, f.help, f.locked, f.showIf].filter(Boolean).length;

type LookupTarget = { value: string; label: string; attrs: { value: string; label: string }[] };
const newEntity = (): EntityDraft => ({
  name: "",
  slug: "",
  recordCount: 0,
  saved: false,
  fields: [newField()],
  formLayout: "sections",
  approval: false,
  rules: [],
});

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function ModuleForm({
  action,
  values,
  menus,
  lookupTargets,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: ModuleValues;
  /** What Lookup fields can link to (built-in lists and every record type). */
  lookupTargets: LookupTarget[];
  /** Built-in menus the module can be placed in, with the submenu names already used in each. */
  menus: { value: string; label: string; groups: string[] }[];
}) {
  const [menu, setMenu] = useState(values?.menu ?? "");
  const [layout, setLayout] = useState(values?.menuFlat ? "flat" : values?.menuGroup ? "named" : "module");
  const suggestions = menus.find((m) => m.value === menu)?.groups ?? [];
  const hostLabel = menus.find((m) => m.value === menu)?.label.toUpperCase();
  const editing = !!values;
  const [name, setName] = useState(values?.name ?? "");
  const [slug, setSlug] = useState(values?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);
  const [entities, setEntities] = useState<EntityDraft[]>(
    values?.entities.map((e) => ({
      ...e,
      formLayout: e.formLayout === "tabs" ? "tabs" : "sections",
      saved: true,
      fields: e.fields.map((f) => ({
        ...f,
        options: f.options.join(", "),
        inList: showsInList(f),
        searchable: isSearchable(f),
        saved: true,
        open: false,
      })),
    })) ?? [newEntity()],
  );

  const updateEntity = (i: number, patch: Partial<EntityDraft>) =>
    setEntities((list) => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const updateField = (i: number, k: number, patch: Partial<FieldDraft>) =>
    setEntities((list) =>
      list.map((e, j) => (j === i ? { ...e, fields: e.fields.map((f, l) => (l === k ? { ...f, ...patch } : f)) } : e)),
    );

  const payload = JSON.stringify(
    entities.map((e) => ({
      id: e.id,
      name: e.name,
      slug: e.slug,
      formLayout: e.formLayout,
      approval: e.approval,
      rules: e.rules,
      fields: e.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        options:
          f.type === "select" || f.type === "multiselect"
            ? f.options
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean)
            : [],
        target: f.type === "lookup" ? f.target : "",
        decimals: f.decimals,
        formula: f.type === "formula" ? f.formula : "",
        format: f.format,
        defaultValue: NO_DEFAULT.includes(f.type) ? "" : f.defaultValue,
        unique: !NO_UNIQUE.includes(f.type) && f.unique,
        inList: f.inList,
        searchable: f.searchable,
        help: f.help,
        locked: f.locked,
        inline: f.type === "lookup" && f.target.startsWith("custom:") && f.inline,
        filterBy: f.type === "lookup" ? f.filterBy : "",
        filterAttr: f.type === "lookup" && f.filterBy ? f.filterAttr : "",
        showIf: f.showIf,
        showIfValue: f.showIf ? f.showIfValue : "",
      })),
    })),
  );

  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="name"
          label="Module name"
          placeholder="e.g. Fleet"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value, "-"));
          }}
          required
        />
        <TextField
          name={editing ? "slug_locked" : "slug"}
          label="URL name"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          readOnly={editing}
          hint={
            editing ? "Fixed after creation (used in links and permissions)." : `Pages will live at /m/${slug || "…"}`
          }
          required
        />
      </div>
      <TextField name="description" label="Description" defaultValue={values?.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="menu"
          label="Show in menu"
          value={menu}
          onChange={(e) => setMenu(e.target.value)}
          options={[
            { value: "", label: "Its own menu (named after the module)" },
            ...menus.map((m) => ({ value: m.value, label: `Inside ${m.label.toUpperCase()}` })),
          ]}
          hint="E.g. put an Item Master inside SETUP or INVENTORY. Links and permissions stay the same."
        />
        {menu && (
          <SelectField
            name="menuLayout"
            label={`Appear in ${hostLabel} as`}
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            options={[
              { value: "module", label: `A submenu: ${name.trim() || "module name"} ► record types` },
              { value: "named", label: "A submenu with another name (can be shared)" },
              { value: "flat", label: "Record types listed directly (no submenu)" },
            ]}
          />
        )}
        {menu && layout === "named" && (
          <>
            <TextField
              name="menuGroup"
              label="Submenu name"
              list="menu-groups"
              maxLength={60}
              defaultValue={values?.menuGroup}
              placeholder="e.g. Inventory / WMS"
              hint="Modules with the same submenu name appear together in one ► flyout."
              required
            />
            <datalist id="menu-groups">
              {suggestions.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </>
        )}
      </div>
      {menu && (
        <p className="text-muted">
          Menu preview:{" "}
          <span className="font-semibold text-text">
            {[
              hostLabel,
              layout === "flat" ? null : layout === "named" ? "(submenu name)" : name.trim() || "Module name",
            ]
              .filter(Boolean)
              .join(" ► ")}{" "}
            ► {entities.map((e) => e.name || "…").join(", ")}
          </span>
        </p>
      )}
      <CheckboxField name="isActive" label="Active (shown in the menu)" defaultChecked={values?.isActive ?? true} />

      <div className="space-y-4">
        <div>
          <h3 className={sectionLabel}>Record types</h3>
          <p className="text-muted">
            Each record type gets its own list, form and sidebar link, e.g. &quot;Vehicles&quot; and &quot;Trips&quot;.
          </p>
        </div>
        <FieldErrors name="entities" />
        <input type="hidden" name="entities" value={payload} />

        {entities.map((entity, i) => (
          <div key={entity.id ?? `new-${i}`} className="space-y-3 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-48 flex-1 space-y-1">
                <span className={`block ${sectionLabel}`}>Record type name</span>
                <input
                  className={inputClass}
                  placeholder="e.g. Vehicles"
                  value={entity.name}
                  onChange={(e) =>
                    updateEntity(i, {
                      name: e.target.value,
                      ...(!entity.saved && { slug: slugify(e.target.value, "-") }),
                    })
                  }
                />
                <span className="block text-xs text-muted">
                  /m/{slug || "…"}/{entity.slug || "…"}
                  {entity.saved && ` · ${entity.recordCount} record(s)`}
                </span>
              </label>
              <div className="flex gap-1 pb-5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEntities((l) => move(l, i, i - 1))}
                  aria-label="Move up"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEntities((l) => move(l, i, i + 1))}
                  aria-label="Move down"
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={entity.recordCount > 0}
                  title={entity.recordCount > 0 ? "Delete its records first" : undefined}
                  onClick={() => setEntities((l) => l.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            </div>

            <EntitySettings entity={entity} onChange={(patch) => updateEntity(i, patch)} />

            <div className="space-y-2">
              <p className={sectionLabel}>Fields</p>
              {entity.fields.map((field, k) => (
                <div
                  key={k}
                  className="grid gap-2 rounded-md bg-bg p-3 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-start"
                >
                  <div>
                    <input
                      className={inputClass}
                      placeholder="Field label, e.g. Plate number"
                      aria-label="Field label"
                      value={field.label}
                      onChange={(e) =>
                        updateField(i, k, {
                          label: e.target.value,
                          ...(!field.saved && { key: slugify(e.target.value) }),
                        })
                      }
                    />
                    <span className="mt-1 block font-mono text-xs text-muted">{field.key || "…"}</span>
                    {(field.type === "select" || field.type === "multiselect") && (
                      <input
                        className={`${inputClass} mt-2`}
                        placeholder="Choices, separated by commas"
                        aria-label="Choices"
                        value={field.options}
                        onChange={(e) => updateField(i, k, { options: e.target.value })}
                      />
                    )}
                    {field.type === "lookup" && (
                      <select
                        className={`${inputClass} mt-2`}
                        aria-label="Links to"
                        value={field.target}
                        onChange={(e) => updateField(i, k, { target: e.target.value, filterBy: "", filterAttr: "" })}
                      >
                        <option value="">Links to… (choose a list)</option>
                        {lookupTargets.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {field.type === "lookup" && field.target.startsWith("custom:") && (
                      <label className="mt-2 flex items-start gap-2 text-[13px]">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-primary"
                          checked={field.inline}
                          onChange={(e) => updateField(i, k, { inline: e.target.checked })}
                        />
                        <span>
                          Edit {entity.name || "these records"} as lines on the linked record&apos;s form
                          <span className="block text-xs text-muted">
                            e.g. U/M rows inside Item Master. Otherwise they show as a related list under it.
                          </span>
                        </span>
                      </label>
                    )}
                    {field.type === "lookup" && (lookupTargets.find((t) => t.value === field.target)?.attrs.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                        <span>Only show those whose</span>
                        <select
                          className={`${inputClass} w-auto`}
                          aria-label="Filter attribute"
                          value={field.filterAttr}
                          onChange={(e) => updateField(i, k, { filterAttr: e.target.value })}
                        >
                          <option value="">(no filter)</option>
                          {lookupTargets
                            .find((t) => t.value === field.target)!
                            .attrs.map((a) => (
                              <option key={a.value} value={a.value}>
                                {a.label}
                              </option>
                            ))}
                        </select>
                        <span>matches this form&apos;s</span>
                        <select
                          className={`${inputClass} w-auto`}
                          aria-label="Filter by field"
                          value={field.filterBy}
                          onChange={(e) => updateField(i, k, { filterBy: e.target.value })}
                        >
                          <option value="">(choose a field)</option>
                          {entity.fields
                            .filter((o) => o !== field && o.key && o.type !== "section")
                            .map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label || o.key}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    {field.type === "formula" && (
                      <div className="mt-2 space-y-1">
                        <input
                          className={`${inputClass} font-mono`}
                          placeholder="e.g. qty * price   or   round(amount * 12 / 100, 2)"
                          aria-label="Formula"
                          value={field.formula}
                          onChange={(e) => updateField(i, k, { formula: e.target.value })}
                        />
                        <span className="block text-xs text-muted">
                          Use field keys:{" "}
                          {entity.fields
                            .filter((o) => o !== field && o.key && o.type !== "section")
                            .map((o) => o.key)
                            .join(", ") || "add other fields first"}
                          . Functions: round, floor, ceil, abs, min, max, if, empty, len, days(from, to).
                        </span>
                        <select
                          className={`${inputClass} w-auto`}
                          aria-label="Show result as"
                          value={field.format}
                          onChange={(e) => updateField(i, k, { format: e.target.value as FieldDraft["format"] })}
                        >
                          {FORMULA_FORMATS.map((f) => (
                            <option key={f.value} value={f.value}>
                              Show as {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {(field.type === "decimal" || field.type === "formula") && (
                      <label className="mt-2 flex items-center gap-2 text-[13px]">
                        Decimal places
                        <input
                          type="number"
                          min={0}
                          max={4}
                          className={`${inputClass} w-16`}
                          value={field.decimals}
                          onChange={(e) => updateField(i, k, { decimals: Math.min(4, Math.max(0, Number(e.target.value) || 0)) })}
                        />
                      </label>
                    )}
                  </div>
                  <select
                    className={inputClass}
                    aria-label="Field type"
                    value={field.type}
                    onChange={(e) => updateField(i, k, { type: e.target.value as FieldType })}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={field.required}
                      onChange={(e) => updateField(i, k, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      aria-expanded={field.open}
                      title="Default value, unique, list and search, help text, locking"
                      onClick={() => updateField(i, k, { open: !field.open })}
                    >
                      Options{settingsCount(field) > 0 && ` (${settingsCount(field)})`} {field.open ? "▴" : "▾"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label="Move field up"
                      onClick={() => updateEntity(i, { fields: move(entity.fields, k, k - 1) })}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label="Move field down"
                      onClick={() => updateEntity(i, { fields: move(entity.fields, k, k + 1) })}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label="Remove field"
                      onClick={() => updateEntity(i, { fields: entity.fields.filter((_, l) => l !== k) })}
                    >
                      ✕
                    </Button>
                  </div>
                  {field.open && (
                    <FieldOptions
                      field={field}
                      siblings={entity.fields.filter((o) => o !== field && o.key && o.type !== "section")}
                      onChange={(patch) => updateField(i, k, patch)}
                    />
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => updateEntity(i, { fields: [...entity.fields, newField()] })}
              >
                Add field
              </Button>
            </div>
          </div>
        ))}

        <Button type="button" variant="secondary" onClick={() => setEntities((l) => [...l, newEntity()])}>
          Add record type
        </Button>
      </div>

      <SubmitButton>{editing ? "Save module" : "Create module"}</SubmitButton>
    </ActionForm>
  );
}

/** The per-field settings panel: default value, unique, list column, search, help text and locking. */
function FieldOptions({
  field,
  siblings,
  onChange,
}: {
  field: FieldDraft;
  /** The record type's other fields, for "show only when". */
  siblings: FieldDraft[];
  onChange: (patch: Partial<FieldDraft>) => void;
}) {
  const source = siblings.find((o) => o.key === field.showIf);
  const check = (label: string, key: "unique" | "inList" | "searchable" | "locked", hint: string, disabled = false) => (
    <label className={`flex items-start gap-2 ${disabled ? "opacity-50" : ""}`} title={hint}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-primary"
        checked={field[key] && !disabled}
        disabled={disabled}
        onChange={(e) => onChange({ [key]: e.target.checked })}
      />
      <span>
        {label}
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="grid gap-3 border-t border-border pt-3 sm:col-span-4 sm:grid-cols-2">
      <label className="block space-y-1">
        <span className={`block ${sectionLabel}`}>Default value</span>
        {field.type === "checkbox" ? (
          <select className={inputClass} value={field.defaultValue} onChange={(e) => onChange({ defaultValue: e.target.value })}>
            <option value="">No (unticked)</option>
            <option value="yes">Yes (ticked)</option>
          </select>
        ) : (
          <input
            className={inputClass}
            disabled={NO_DEFAULT.includes(field.type)}
            placeholder={NO_DEFAULT.includes(field.type) ? "Not available for this type" : DEFAULT_HINTS[field.type] ?? "Pre-filled on new records"}
            value={NO_DEFAULT.includes(field.type) ? "" : field.defaultValue}
            onChange={(e) => onChange({ defaultValue: e.target.value })}
          />
        )}
      </label>
      <label className="block space-y-1">
        <span className={`block ${sectionLabel}`}>Help text</span>
        <input
          className={inputClass}
          maxLength={200}
          placeholder="Shown under the field, e.g. As printed on the OR/CR"
          value={field.help}
          onChange={(e) => onChange({ help: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
        <span className={sectionLabel}>Show only when</span>
        <select
          className={`${inputClass} w-auto`}
          aria-label="Show only when field"
          value={field.showIf}
          onChange={(e) => onChange({ showIf: e.target.value, showIfValue: "" })}
        >
          <option value="">(always shown)</option>
          {siblings.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label || o.key}
            </option>
          ))}
        </select>
        {source && (
          <>
            <span>is</span>
            {source.type === "checkbox" ? (
              <select className={`${inputClass} w-auto`} value={field.showIfValue} onChange={(e) => onChange({ showIfValue: e.target.value })}>
                <option value="yes">ticked</option>
                <option value="no">not ticked</option>
              </select>
            ) : (
              <input
                className={`${inputClass} w-64`}
                list={`choices-${source.key}`}
                placeholder="any value, or values separated by commas"
                value={field.showIfValue}
                onChange={(e) => onChange({ showIfValue: e.target.value })}
              />
            )}
            <datalist id={`choices-${source.key}`}>
              {source.options
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean)
                .map((o) => (
                  <option key={o} value={o} />
                ))}
            </datalist>
          </>
        )}
      </div>
      <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
        {check("Unique", "unique", "No two records may have the same value.", NO_UNIQUE.includes(field.type))}
        {check("Show in list", "inList", "Appears as a column in the list.")}
        {check("Searchable", "searchable", "Found by the list's search box.")}
        {check("Lock after creation", "locked", "Filled in once; read-only afterwards.")}
      </div>
    </div>
  );
}

/** Record type settings: form layout, approval, and rules every saved record must pass. */
function EntitySettings({ entity, onChange }: { entity: EntityDraft; onChange: (patch: Partial<EntityDraft>) => void }) {
  const keys = entity.fields.filter((f) => f.key && f.type !== "section").map((f) => f.key);
  const setRule = (n: number, patch: Partial<RecordRule>) =>
    onChange({ rules: entity.rules.map((r, j) => (j === n ? { ...r, ...patch } : r)) });
  return (
    <div className="space-y-3 rounded-md bg-bg p-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2">
          <span className={sectionLabel}>Form layout</span>
          <select
            className={`${inputClass} w-auto`}
            value={entity.formLayout}
            onChange={(e) => onChange({ formLayout: e.target.value as EntityDraft["formLayout"] })}
          >
            <option value="sections">One page (section headings as jump links)</option>
            <option value="tabs">Tabs (one per section heading and line grid)</option>
          </select>
        </label>
        <label className="flex items-start gap-2" title="Maker-checker: the person who saved a record cannot approve it">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={entity.approval}
            onChange={(e) => onChange({ approval: e.target.checked })}
          />
          <span>
            Require approval
            <span className="block text-xs text-muted">
              New and changed records wait as Pending until another person with &ldquo;Approve records&rdquo; approves them.
              Only approved records can be picked in lookups.
            </span>
          </span>
        </label>
      </div>
      <div className="space-y-1.5">
        <p className={sectionLabel}>Rules (checked every time a record is saved or imported)</p>
        {entity.rules.map((r, n) => (
          <div key={n} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className={`${inputClass} font-mono`}
              placeholder="Must be true, e.g. price >= cost"
              aria-label="Rule check"
              value={r.check}
              onChange={(e) => setRule(n, { check: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Message when it is not, e.g. Price cannot be below cost"
              aria-label="Rule message"
              value={r.message}
              onChange={(e) => setRule(n, { message: e.target.value })}
            />
            <Button
              type="button"
              variant="secondary"
              aria-label="Remove rule"
              onClick={() => onChange({ rules: entity.rules.filter((_, j) => j !== n) })}
            >
              ✕
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => onChange({ rules: [...entity.rules, { check: "", message: "" }] })}>
            Add rule
          </Button>
          <span className="text-xs text-muted">
            Same language as calculated fields{keys.length ? `; field keys: ${keys.join(", ")}` : ""}. Use and / or / not, = != &lt; &gt;,
            empty(x).
          </span>
        </div>
      </div>
    </div>
  );
}
