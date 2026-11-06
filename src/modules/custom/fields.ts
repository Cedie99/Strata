import { z } from "zod";
import { checkbox, decimalString, stringList } from "@/core/forms";
import { checkFormula, evaluate, parseFormula, type Value } from "./formula";

// Shared by the module builder (client) and the record actions (server).

export const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "decimal", label: "Decimal" },
  { value: "money", label: "Money (PHP)" },
  { value: "percent", label: "Percent" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "checkbox", label: "Yes / no" },
  { value: "select", label: "Choice list" },
  { value: "multiselect", label: "Multiple choice" },
  { value: "lookup", label: "Lookup (link to a record)" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Web link (URL)" },
  { value: "file", label: "File" },
  { value: "formula", label: "Calculated (formula)" },
  { value: "autonumber", label: "Auto number" },
  { value: "section", label: "— Section heading —" },
] as const;

export type FieldType = (typeof FIELD_TYPES)[number]["value"];

/** Types whose value the user never types in a form: assigned by the server, or uploaded. */
export const NOT_TYPED: FieldType[] = ["autonumber", "file", "section", "formula"];
/** Types that cannot have a default value or be unique. */
export const NO_DEFAULT: FieldType[] = ["autonumber", "file", "lookup", "section", "formula"];
export const NO_UNIQUE: FieldType[] = ["autonumber", "file", "checkbox", "multiselect", "textarea", "section", "formula"];
/** Types whose values are numbers (in formulas, lists and sorting). */
export const NUMERIC_TYPES: FieldType[] = ["number", "decimal", "money", "percent", "formula"];
export const FORMULA_FORMATS = [
  { value: "number", label: "Number" },
  { value: "money", label: "Money (PHP)" },
  { value: "percent", label: "Percent" },
] as const;
/** Layout only: a heading that starts a new part of the form. It holds no value. */
export const isData = (f: { type: FieldType }) => f.type !== "section";

export type CustomField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** "select" and "multiselect" choices. */
  options: string[];
  /** "lookup": what it links to, e.g. "product" or "custom:<record type id>" (see lookups.ts). */
  target: string;
  /** "decimal" and "formula": digits after the point. */
  decimals: number;
  /** "formula": the expression (see formula.ts), e.g. "qty * price", and how its result is shown. */
  formula: string;
  format: (typeof FORMULA_FORMATS)[number]["value"];
  /** Pre-filled on new records. Dates accept "today"; multiple choice takes a comma-separated list. */
  defaultValue: string;
  /** No two records of the record type may share the value. */
  unique: boolean;
  /** Show as a column in the list; unset = every type but long text. */
  inList?: boolean;
  /** Matched by the list's search box; unset = yes. */
  searchable?: boolean;
  /** Hint shown under the field. */
  help: string;
  /** Can be filled in on a new record but not changed afterwards. */
  locked: boolean;
  /**
   * "lookup": only offer linked records whose attribute `filterAttr` equals the value of this record's
   * field `filterBy`, e.g. Item Class filtered by Item Type. Empty = no filter.
   */
  filterBy: string;
  filterAttr: string;
  /** "lookup" to another record type: edit this record type as lines on that record's form (e.g. an item's U/M rows). */
  inline: boolean;
  /** Show (and require) the field only when field `showIf` has one of `showIfValue` (comma-separated; empty = any value). */
  showIf: string;
  showIfValue: string;
};

/** A file field stores "<attachment id>/<file name>"; files are regular attachments of the record. */
export type RecordData = Record<string, string | boolean | string[]>;

export const showsInList = (f: CustomField) => isData(f) && (f.inList ?? f.type !== "textarea");
export const isSearchable = (f: CustomField) => isData(f) && (f.searchable ?? true);

type RawValue = string | string[] | boolean | undefined;

/**
 * Whether a field applies, given the other values of the record (or of the form being filled in).
 * Ticked boxes count as "yes", unticked as "no"; with no values listed, any non-empty value counts.
 */
export function conditionMet(f: CustomField, fields: CustomField[], get: (key: string) => RawValue): boolean {
  if (!f.showIf) return true;
  const source = fields.find((x) => x.key === f.showIf);
  if (!source) return true;
  // A field that depends on a hidden field is hidden too.
  if (!conditionMet(source, fields.filter((x) => x.key !== f.key), get)) return false;
  const v = get(source.key);
  const have = (
    source.type === "checkbox"
      ? [v === true || v === "on" || v === "true" ? "yes" : "no"]
      : Array.isArray(v)
        ? v
        : [String(v ?? "")]
  ).map((x) => x.trim().toLowerCase());
  const wanted = f.showIfValue
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return wanted.length ? wanted.some((w) => have.includes(w)) : have.some((x) => x !== "" && x !== "no");
}

/** "Fuel Card No." → "fuel_card_no". Used for field keys and URL slugs. */
export function slugify(label: string, sep = "_") {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^${sep}+|${sep}+$`, "g"), "")
    .slice(0, 40);
}

export const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Field keys use lowercase letters, digits and _"),
  label: z.string().trim().min(1, "Every field needs a label").max(100),
  type: z.enum(FIELD_TYPES.map((t) => t.value) as [FieldType, ...FieldType[]]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  target: z.string().max(60).default(""),
  decimals: z.number().int().min(0).max(4).default(2),
  formula: z.string().trim().max(1000).default(""),
  format: z.enum(["number", "money", "percent"]).default("number"),
  defaultValue: z.string().trim().max(500).default(""),
  unique: z.boolean().default(false),
  inList: z.boolean().optional(),
  searchable: z.boolean().optional(),
  help: z.string().trim().max(200).default(""),
  locked: z.boolean().default(false),
  filterBy: z.string().max(40).default(""),
  filterAttr: z.string().max(60).default(""),
  inline: z.boolean().default(false),
  showIf: z.string().max(40).default(""),
  showIfValue: z.string().trim().max(500).default(""),
});

export const fieldListSchema = z
  .array(fieldSchema)
  .max(50, "At most 50 fields per record type")
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.key)) ctx.addIssue({ code: "custom", path: [i, "key"], message: `Two fields share the key "${f.key}"` });
      seen.add(f.key);
      if ((f.type === "select" || f.type === "multiselect") && f.options.length === 0)
        ctx.addIssue({ code: "custom", path: [i, "options"], message: `"${f.label}" needs at least one choice` });
      if (f.type === "lookup" && !f.target)
        ctx.addIssue({ code: "custom", path: [i, "target"], message: `Choose what "${f.label}" links to` });
      const other = (key: string) => fields.find((x) => x.key === key && x.key !== f.key && isData(x));
      if (f.filterBy && (!other(f.filterBy) || !f.filterAttr))
        ctx.addIssue({ code: "custom", path: [i, "filterBy"], message: `Finish or clear the filter of "${f.label}"` });
      if (f.type === "formula") {
        const known = new Set(fields.filter((x) => isData(x) && x.key !== f.key).map((x) => x.key));
        const problem = f.formula ? checkFormula(f.formula, known) : "enter a formula, e.g. qty * price";
        if (problem) ctx.addIssue({ code: "custom", path: [i, "formula"], message: `Formula of "${f.label}": ${problem}` });
      }
      if (f.showIf && !other(f.showIf))
        ctx.addIssue({ code: "custom", path: [i, "showIf"], message: `"${f.label}" is shown depending on a field that no longer exists` });
      if (f.defaultValue && !NO_DEFAULT.includes(f.type) && f.type !== "checkbox") {
        const check = valueSchema({ ...f, required: true }).safeParse(defaultInput(f));
        if (!check.success)
          ctx.addIssue({ code: "custom", path: [i, "defaultValue"], message: `Default of "${f.label}": ${check.error.issues[0].message}` });
      }
    });
    if (fields.filter((f) => f.type === "autonumber").length > 1)
      ctx.addIssue({ code: "custom", message: "A record type can have only one Auto number field" });
  });

export function parseFields(json: string): CustomField[] {
  const parsed = fieldListSchema.safeParse(JSON.parse(json || "[]"));
  return parsed.success ? parsed.data : [];
}

export function parseData(json: string): RecordData {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A field's default as form input: "today" becomes the current date (and time), lists become arrays. */
export function defaultInput(f: CustomField, now = new Date()): string | string[] {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (f.defaultValue.toLowerCase() === "today") {
    if (f.type === "date") return today;
    if (f.type === "datetime") return `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }
  if (f.type === "multiselect")
    return f.defaultValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (f.type === "checkbox") return ["yes", "true", "on", "1"].includes(f.defaultValue.toLowerCase()) ? "on" : "";
  return f.defaultValue;
}

const decimals = (label: string, places: number) =>
  z
    .string()
    .trim()
    .regex(
      places === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+(\\.\\d{1,${places}})?$`),
      places === 0 ? `${label} must be a whole number` : `${label} must be a number with up to ${places} decimals`,
    );

/** The zod schema for one submitted (non-empty) value of a field. */
function valueSchema(f: CustomField): z.ZodTypeAny {
  switch (f.type) {
    case "checkbox":
      return checkbox;
    case "number":
    case "percent":
      return decimalString(f.label);
    case "decimal":
      return decimals(f.label, f.decimals);
    case "money":
      return decimals(f.label, 2);
    case "date":
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${f.label} must be a date`);
    case "datetime":
      return z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, `${f.label} must be a date and time`);
    case "select":
      return z.enum(f.options as [string, ...string[]], { message: `Choose a value for ${f.label}` });
    case "multiselect":
      return stringList.pipe(
        z
          .array(z.enum(f.options as [string, ...string[]], { message: `Choose values of ${f.label} from the list` }))
          .min(f.required ? 1 : 0, `${f.label} is required`),
      );
    case "email":
      return z.string().trim().email(`${f.label} must be an email address`).max(200);
    case "phone":
      return z.string().trim().regex(/^[0-9+()\-.\s]{3,30}$/, `${f.label} must be a phone number`);
    case "url":
      return z
        .string()
        .trim()
        .max(1000)
        .url(`${f.label} must be a web address`)
        .refine((v) => /^https?:\/\//i.test(v), `${f.label} must start with http:// or https://`);
    case "lookup":
      return z.string().min(1, `Choose a value for ${f.label}`).max(60);
    default:
      return z.string().trim().max(f.type === "textarea" ? 5000 : 500);
  }
}

/**
 * Builds the zod schema that validates a submitted record form for these fields.
 * `skip` leaves fields out (locked fields when editing); uploaded files are checked separately.
 */
export function recordSchema(fields: CustomField[], skip: Set<string> = new Set(), input?: Record<string, RawValue>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (NOT_TYPED.includes(f.type) || skip.has(f.key)) continue;
    // Fields hidden by their "show only when" condition are neither required nor saved.
    if (input && !conditionMet(f, fields, (k) => input[k])) continue;
    let base = valueSchema(f);
    if (f.type === "checkbox" || f.type === "multiselect") {
      // Unticked boxes are simply missing from the form; the schema handles that itself.
    } else if (f.required) {
      base = z.string({ required_error: `${f.label} is required` }).trim().min(1, `${f.label} is required`).pipe(base);
    } else {
      // Empty optional fields are stored as "".
      base = z.union([z.literal("").transform(() => ""), base, z.undefined().transform(() => "")]);
    }
    shape[f.key] = base;
  }
  return z.object(shape);
}

/** A file field's stored value → { id, name }, or null when empty. */
export function fileValue(value: unknown) {
  if (typeof value !== "string" || !value.includes("/")) return null;
  const at = value.indexOf("/");
  return { id: value.slice(0, at), name: value.slice(at + 1) };
}

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** How a stored value is shown in tables. `labels` turns lookup ids into names. */
export function displayValue(field: CustomField, value: RecordData[string] | undefined, labels?: Map<string, string>) {
  if (field.type === "section") return "";
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (value === undefined || value === "" || value === false) return "—";
  const text = String(value);
  switch (field.type) {
    case "money":
      return money.format(Number(text));
    case "percent":
      return `${text}%`;
    case "formula":
      return field.format === "money" ? money.format(Number(text)) : field.format === "percent" ? `${text}%` : text;
    case "decimal":
      return Number(text).toFixed(field.decimals);
    case "datetime":
      return text.replace("T", " ");
    case "lookup":
      return labels?.get(text) ?? "(removed)";
    case "file":
      return fileValue(text)?.name ?? "—";
    default:
      return text;
  }
}

/** Value used to compare records for "unique" fields: case and surrounding spaces ignored. */
export const uniqueKey = (value: RecordData[string] | undefined) =>
  Array.isArray(value) ? value.join(",") : String(value ?? "").trim().toLowerCase();

/** A record's values as formula variables: numbers for number-like fields, yes/no for Yes/no, text otherwise. */
export function formulaVars(fields: CustomField[], data: Record<string, unknown>) {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return (name: string): Value => {
    const f = byKey.get(name);
    const v = data[name];
    if (f?.type === "checkbox") return v === true || v === "on" || v === "true";
    if (f && NUMERIC_TYPES.includes(f.type)) return Number(v) || 0;
    return Array.isArray(v) ? v.join(", ") : String(v ?? "");
  };
}

/**
 * Works out every calculated field, in form order (so a formula may use the result of one above it).
 * Results are stored as text with the field's decimals; a formula that fails gives "".
 */
export function computeFormulas<T extends Record<string, unknown>>(fields: CustomField[], data: T): T {
  const out: Record<string, unknown> = { ...data };
  for (const f of fields) {
    if (f.type !== "formula") continue;
    try {
      const result = Number(evaluate(parseFormula(f.formula), formulaVars(fields, out)));
      out[f.key] = Number.isFinite(result) ? result.toFixed(f.decimals) : "";
    } catch {
      out[f.key] = "";
    }
  }
  return out as T;
}

/** A rule every saved record of a record type must satisfy, e.g. { check: "price >= cost", message: "…" }. */
export type RecordRule = { check: string; message: string };

export const ruleSchema = z.object({
  check: z.string().trim().min(1, "Every rule needs a check").max(1000),
  message: z.string().trim().min(1, "Every rule needs a message").max(200),
});

export function parseRules(json: string): RecordRule[] {
  const parsed = z.array(ruleSchema).safeParse(JSON.parse(json || "[]"));
  return parsed.success ? parsed.data : [];
}

/** Messages of the rules a record breaks. A rule whose check no longer parses is skipped. */
export function brokenRules(rules: RecordRule[], fields: CustomField[], data: Record<string, unknown>) {
  const vars = formulaVars(fields, data);
  return rules.flatMap((r) => {
    try {
      const ok = evaluate(parseFormula(r.check), vars);
      return ok === false || ok === 0 || ok === "" ? [r.message] : [];
    } catch {
      return [];
    }
  });
}

export const APPROVAL_STATUSES = { PENDING: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected" } as const;
/** Records without a status were created before approval was switched on; they count as approved. */
export const isActiveRecord = (status: string) => status === "" || status === "APPROVED";
