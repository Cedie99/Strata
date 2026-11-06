"use client";

import { useState, type FormEvent } from "react";
import type { ActionState } from "@/core/forms";
import {
  ActionForm,
  CheckboxField,
  FieldErrors,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useFieldErrorNames,
} from "@/components/ui/form";
import { sectionLabel } from "@/components/ui/layout";
import { computeFormulas, conditionMet, displayValue, fileValue, type CustomField, type RecordData } from "@/modules/custom/fields";
import { formulaRefs, parseFormula } from "@/modules/custom/formula";
import { LineGrid, type LineGridData } from "./line-grid";

/** Field keys a calculated field reads (none if its formula does not parse). */
const refsOf = (f: CustomField) => {
  try {
    return [...formulaRefs(parseFormula(f.formula))];
  } catch {
    return [];
  }
};

const INPUT_TYPES: Partial<Record<CustomField["type"], string>> = {
  date: "date",
  datetime: "datetime-local",
  email: "email",
  phone: "tel",
  url: "url",
};
const DECIMAL_TYPES = new Set(["number", "decimal", "money", "percent"]);

type Choice = { value: string; label: string; attrs?: Record<string, string>; retired?: boolean };
type Group = { key: string; label: string; fields: CustomField[]; grid?: LineGridData };

/** The tab strip of a tabbed record form; a red dot marks tabs whose fields the last save flagged. */
function TabStrip({
  groups,
  active,
  onPick,
  groupOf,
}: {
  groups: Group[];
  active: string;
  onPick: (key: string) => void;
  groupOf: (name: string) => string | undefined;
}) {
  const flagged = new Set([...useFieldErrorNames()].map(groupOf));
  return (
    <div role="tablist" className="-mx-4 -mt-4 mb-4 flex flex-wrap gap-0.5 border-b border-border bg-row-alt px-3 pt-2">
      {groups.map((g) => (
        <button
          key={g.key}
          type="button"
          role="tab"
          aria-selected={g.key === active}
          onClick={() => onPick(g.key)}
          className={`-mb-px flex items-center gap-1.5 border px-4 py-1.5 text-[13.5px] ${
            g.key === active
              ? "border-border border-t-2 border-t-accent border-b-surface bg-surface font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          {g.label}
          {flagged.has(g.key) && <span className="size-1.5 rounded-full bg-danger" aria-label="has errors" />}
        </button>
      ))}
    </div>
  );
}

/**
 * The form of an admin-built record type. It follows the form's own values as they change, so
 * filtered lookups (Item Class by Item Type) and "show only when" fields update while filling in.
 * Section headings split the form into parts with jump links at the top.
 */
export function RecordForm({
  action,
  fields,
  values,
  choices = {},
  layout = "sections",
  lineGrids = [],
  editing = false,
  readOnly = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: CustomField[];
  /** Stored values, or the fields' defaults on a new record. */
  values?: RecordData;
  /** Lookup choices by field key. */
  choices?: Record<string, Choice[]>;
  /** "tabs": each section heading (and each line grid) becomes a tab. */
  layout?: "sections" | "tabs";
  /** Child record types edited as lines of this record. */
  lineGrids?: LineGridData[];
  /** Locked fields cannot be changed on an existing record. */
  editing?: boolean;
  readOnly?: boolean;
}) {
  const [live, setLive] = useState<RecordData>(values ?? {});
  // Only fields other fields depend on are followed; the rest stay uncontrolled.
  const watched = new Set(
    fields.flatMap((f) => [f.filterBy, f.showIf, ...(f.type === "formula" ? refsOf(f) : [])]).filter(Boolean),
  );
  const onChange = (e: FormEvent<HTMLFieldSetElement>) => {
    const el = e.target as HTMLInputElement;
    if (!watched.has(el.name)) return;
    const field = fields.find((f) => f.key === el.name);
    const form = el.form;
    if (!field || !form) return;
    const value =
      field.type === "checkbox"
        ? el.checked
        : field.type === "multiselect"
          ? new FormData(form).getAll(el.name).map(String)
          : el.value;
    setLive((v) => ({ ...v, [el.name]: value }));
  };
  const sections = fields.filter((f) => f.type === "section");
  const tabbed = layout === "tabs" && (sections.length > 0 || lineGrids.length > 0);
  // Tabs: fields before the first heading form "General"; each heading starts a tab; each line grid gets its own.
  const groups: Group[] = [];
  for (const f of fields) {
    if (f.type === "section") groups.push({ key: f.key, label: f.label, fields: tabbed ? [] : [f] });
    else if (groups.length) groups[groups.length - 1].fields.push(f);
    else groups.push({ key: "__general", label: "General", fields: [f] });
  }
  for (const grid of lineGrids) groups.push({ key: grid.name, label: grid.title, fields: [], grid });
  const [tab, setTab] = useState(groups[0]?.key ?? "");
  const groupOf = (name: string) =>
    groups.find((g) => g.fields.some((f) => f.key === name) || g.grid?.name === name)?.key;
  // Calculated fields preview as the user types; the server works them out again when saving.
  const calculated = computeFormulas(fields, { ...values, ...live });

  const renderField = (f: CustomField) => {
    if (!conditionMet(f, fields, (k) => live[k])) return null;
    const value = values?.[f.key];
    const locked = editing && f.locked;
    const hint = [f.help, locked ? "Cannot be changed after the record is created." : ""].filter(Boolean).join(" ");
    const common = { name: f.key, label: f.label, required: f.required && !locked, disabled: locked, hint: hint || undefined };
    switch (f.type) {
      case "section":
        return (
          <h3
            key={f.key}
            id={`section-${f.key}`}
            className="scroll-mt-4 border-b border-border pt-3 pb-1 text-[17px] font-semibold text-muted first:pt-0"
          >
            {f.label}
          </h3>
        );
      case "formula":
        return (
          <TextField
            key={f.key}
            name={`${f.key}_display`}
            label={f.label}
            value={displayValue(f, calculated[f.key] as string)}
            hint={[f.help, `= ${f.formula}`].filter(Boolean).join(" · ")}
            readOnly
          />
        );
      case "autonumber":
        return (
          <TextField
            key={f.key}
            name={`${f.key}_display`}
            label={f.label}
            value={String(value ?? "")}
            placeholder="Assigned when saved"
            readOnly
          />
        );
      case "checkbox":
        return (
          <div key={f.key}>
            <CheckboxField name={f.key} label={f.label} defaultChecked={value === true} disabled={locked} />
            {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
          </div>
        );
      case "textarea":
        return <TextAreaField key={f.key} {...common} defaultValue={String(value ?? "")} />;
      case "select":
      case "lookup": {
        let options: Choice[] = f.type === "select" ? f.options.map((o) => ({ value: o, label: o })) : (choices[f.key] ?? []);
        const by = f.filterBy ? fields.find((x) => x.key === f.filterBy) : undefined;
        const want = by ? String(live[by.key] ?? "") : "";
        if (by) options = want ? options.filter((o) => o.attrs?.[f.filterAttr] === want) : [];
        // The stored value is kept only while it still fits the filter (a new Item Type clears the Item Class).
        const stored = String(value ?? "");
        const fits = !by || String(values?.[by.key] ?? "") === want;
        const current = fits ? stored : "";
        // Retired choices (e.g. a retired item type) stay only on records that already have them.
        options = options.filter((o) => !o.retired || o.value === current);
        // A linked record that was deleted since still shows, so saving does not silently clear it.
        if (current && !options.some((o) => o.value === current)) options = [{ value: current, label: "(removed)" }, ...options];
        const placeholder = by && !want ? `Choose ${by.label} first` : options.length ? "Choose…" : "Nothing to choose";
        return (
          <SelectField
            // Re-created when the filter changes, so the choice resets to fit it.
            key={`${f.key}:${want}`}
            {...common}
            defaultValue={current}
            options={[{ value: "", label: placeholder }, ...options.map(({ value, label }) => ({ value, label }))]}
          />
        );
      }
      case "multiselect": {
        const picked = new Set(Array.isArray(value) ? value : []);
        return (
          <fieldset key={f.key} disabled={locked} className="space-y-1">
            <legend className={`mb-1 ${sectionLabel}`}>
              {f.label}
              {f.required && !locked && <span className="ml-0.5 text-danger">*</span>}
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {f.options.map((o) => (
                <CheckboxField key={o} name={f.key} value={o} label={o} defaultChecked={picked.has(o)} />
              ))}
            </div>
            {hint && <span className="block text-xs text-muted">{hint}</span>}
            <FieldErrors name={f.key} />
          </fieldset>
        );
      }
      case "file": {
        const file = fileValue(value);
        return (
          <div key={f.key} className="space-y-1">
            <TextField
              {...common}
              type="file"
              required={f.required && !locked && !file}
              hint={[hint, "Up to 10 MB. Choosing a new file replaces this one; the old file stays under Attachments."]
                .filter(Boolean)
                .join(" ")}
            />
            {file && (
              <p className="text-[13px]">
                Current file:{" "}
                <a href={`/files/${file.id}?inline=1`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {file.name}
                </a>
              </p>
            )}
          </div>
        );
      }
      default:
        return (
          <TextField
            key={f.key}
            {...common}
            type={INPUT_TYPES[f.type] ?? "text"}
            inputMode={DECIMAL_TYPES.has(f.type) ? "decimal" : undefined}
            placeholder={f.type === "money" ? "0.00" : f.type === "percent" ? "e.g. 12.5 (%)" : f.type === "url" ? "https://…" : undefined}
            defaultValue={String(value ?? "")}
          />
        );
    }
  };

  return (
    <ActionForm action={action}>
      {tabbed && <TabStrip groups={groups} active={tab} onPick={setTab} groupOf={groupOf} />}
      {!tabbed && sections.length > 1 && (
        <nav className="-mt-1 mb-1 flex flex-wrap gap-x-1 text-[13px]" aria-label="Form sections">
          {sections.map((s, i) => (
            <span key={s.key}>
              {i > 0 && <span className="mr-1 text-muted">|</span>}
              <a href={`#section-${s.key}`} className="text-primary hover:underline">
                {s.label}
              </a>
            </span>
          ))}
        </nav>
      )}
      <fieldset
        disabled={readOnly}
        className="space-y-4"
        onChange={onChange}
        // A required field left empty on a hidden tab: show that tab so the browser's message is visible.
        onInvalidCapture={(e) => {
          const name = (e.target as HTMLInputElement).name;
          const owner = tabbed && groupOf(name);
          if (owner && owner !== tab) setTab(owner);
        }}
      >
        {groups.map((g) => (
          <div
            key={g.key}
            role={tabbed ? "tabpanel" : undefined}
            className={tabbed && g.key !== tab ? "hidden" : "space-y-4"}
          >
            {g.fields.map(renderField)}
            {g.grid && (
              <div className="space-y-1.5">
                {!tabbed && <h3 className="border-b border-border pt-3 pb-1 text-[17px] font-semibold text-muted">{g.label}</h3>}
                <LineGrid grid={g.grid} readOnly={readOnly} />
              </div>
            )}
          </div>
        ))}
        {!readOnly && <SubmitButton>Save</SubmitButton>}
      </fieldset>
    </ActionForm>
  );
}
