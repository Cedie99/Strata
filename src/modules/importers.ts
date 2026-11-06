import "server-only";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { audit } from "@/core/audit";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { customSeriesType, nextNumber } from "@/core/numbering";
import { brokenRules, computeFormulas, NOT_TYPED, parseRules, recordSchema, type CustomField, type RecordData } from "./custom/fields";
import { lookupChoices, resolveLookups, uniqueErrors } from "./custom/lookups";
import { customSeriesDefaults } from "./custom/module";
import { requireCustomEntity } from "./custom/queries";
import { CASH_CATEGORIES, P as FIN } from "./finance/module";
import { recordCashEntry } from "./finance/posting";
import { cashEntrySchema } from "./finance/schemas";
import { MOVEMENT_TYPES, P as INV } from "./inventory/module";
import { P as SALES } from "./sales/module";
import { customerSchema } from "./sales/schemas";
import { journalForCostChange } from "./accounting/ledger";
import { recordMovement } from "./inventory/posting";
import { movementSchema, productSchema, warehouseSchema } from "./inventory/schemas";

// Excel imports. Every importer validates all rows; the caller runs it in one transaction and
// rolls everything back if any row fails, so a file is imported completely or not at all.

export type ImportColumn = { key: string; label: string; required?: boolean; hint?: string; sample?: string };
export type ImportRow = { rowNumber: number; values: Record<string, string> };
export type ImportResult = { errors: string[] } | { summary: string };

export type Importer = {
  title: string;
  listHref: string;
  columns: ImportColumn[];
  run(rows: ImportRow[], tx: Prisma.TransactionClient, userId: string): Promise<ImportResult>;
};

const YES = new Set(["yes", "y", "true", "1", "x", "on", "active"]);
/** Excel yes/no → the form value the zod `checkbox` helper expects. Blank counts as `fallback`. */
const yesNo = (v: string, fallback = true) => ((v ? YES.has(v.toLowerCase()) : fallback) ? "on" : undefined);

const zodErrors = (rowNumber: number, error: z.ZodError) =>
  Object.entries(error.flatten().fieldErrors).map(([k, msgs]) => `Row ${rowNumber}, ${k}: ${msgs?.[0]}`);

const activeColumn: ImportColumn = { key: "active", label: "Active", hint: "Yes or No (blank = Yes)", sample: "Yes" };

/** Finds the importer for /import/<path>, checking the user may use it. */
export async function getImporter(path: string[]): Promise<Importer> {
  const key = path.join("/");

  if (key === "products") {
    await requirePermission(INV.productsManage);
    return {
      title: "Products",
      listHref: "/inventory/products",
      columns: [
        { key: "sku", label: "SKU", required: true, hint: "Existing SKUs are updated, new ones created", sample: "DSL-001" },
        { key: "name", label: "Name", required: true, sample: "Diesel" },
        { key: "description", label: "Description" },
        { key: "unit", label: "Unit", required: true, hint: "pc, L, kg, box…", sample: "L" },
        { key: "cost", label: "Cost", required: true, sample: "52.50" },
        { key: "price", label: "Price", required: true, sample: "58.90" },
        { key: "reorderLevel", label: "Reorder level", hint: "Blank = 0", sample: "5000" },
        activeColumn,
      ],
      async run(rows, tx, userId) {
        const errors: string[] = [];
        let created = 0;
        let updated = 0;
        for (const { rowNumber, values } of rows) {
          const parsed = productSchema.safeParse({
            ...values,
            reorderLevel: values.reorderLevel || "0",
            isActive: yesNo(values.active),
          });
          if (!parsed.success) {
            errors.push(...zodErrors(rowNumber, parsed.error));
            continue;
          }
          const before = await tx.product.findUnique({ where: { sku: parsed.data.sku } });
          const after = await tx.product.upsert({ where: { sku: parsed.data.sku }, create: parsed.data, update: parsed.data });
          await audit({ userId, action: before ? "import-update" : "import", entity: "Product", entityId: after.id, before, after }, tx);
          if (before) await journalForCostChange(tx, userId, after, before.cost, after.cost, "Cost change (import)");
          if (before) updated++;
          else created++;
        }
        return errors.length ? { errors } : { summary: `${created} product(s) created, ${updated} updated.` };
      },
    };
  }

  if (key === "warehouses") {
    await requirePermission(INV.warehousesManage);
    const scope = await getBranchScope();
    const branchByCode = new Map(scope.allowed.map((b) => [b.code, b]));
    return {
      title: "Warehouses",
      listHref: "/inventory/warehouses",
      columns: [
        { key: "code", label: "Code", required: true, hint: "Existing codes are updated, new ones created", sample: "MAIN" },
        { key: "name", label: "Name", required: true, sample: "Main Warehouse" },
        { key: "branch", label: "Branch code", required: true, hint: "A branch you work in", sample: scope.allowed[0]?.code },
        { key: "address", label: "Address" },
        activeColumn,
      ],
      async run(rows, tx, userId) {
        const errors: string[] = [];
        let created = 0;
        let updated = 0;
        for (const { rowNumber, values } of rows) {
          const branch = branchByCode.get(values.branch.toUpperCase());
          if (!branch) {
            errors.push(`Row ${rowNumber}: unknown branch "${values.branch}" (or not one of yours)`);
            continue;
          }
          const parsed = warehouseSchema.safeParse({ ...values, branchId: branch.id, isActive: yesNo(values.active) });
          if (!parsed.success) {
            errors.push(...zodErrors(rowNumber, parsed.error));
            continue;
          }
          const before = await tx.warehouse.findUnique({ where: { code: parsed.data.code } });
          if (before && !scope.mayUse(before.branchId)) {
            errors.push(`Row ${rowNumber}: warehouse ${parsed.data.code} belongs to a branch you cannot change`);
            continue;
          }
          const after = await tx.warehouse.upsert({ where: { code: parsed.data.code }, create: parsed.data, update: parsed.data });
          await audit({ userId, action: before ? "import-update" : "import", entity: "Warehouse", entityId: after.id, before, after }, tx);
          if (before) updated++;
          else created++;
        }
        return errors.length ? { errors } : { summary: `${created} warehouse(s) created, ${updated} updated.` };
      },
    };
  }

  if (key === "movements") {
    await requirePermission(INV.stockPost);
    const scope = await getBranchScope();
    return {
      title: "Stock movements",
      listHref: "/inventory/movements",
      columns: [
        { key: "type", label: "Type", required: true, hint: MOVEMENT_TYPES.join(", "), sample: "RECEIPT" },
        { key: "sku", label: "SKU", required: true, sample: "DSL-001" },
        { key: "warehouse", label: "Warehouse code", required: true, sample: "MAIN" },
        { key: "toWarehouse", label: "To warehouse code", hint: "Only for TRANSFER" },
        { key: "qty", label: "Qty", required: true, hint: "ADJUSTMENT may be negative", sample: "1000" },
        { key: "reference", label: "Reference", hint: "e.g. OPENING, PO-1001", sample: "OPENING" },
        { key: "note", label: "Note" },
      ],
      async run(rows, tx, userId) {
        const [products, warehouses] = await Promise.all([
          tx.product.findMany({ select: { id: true, sku: true } }),
          tx.warehouse.findMany({ select: { id: true, code: true } }),
        ]);
        const productBySku = new Map(products.map((p) => [p.sku, p.id]));
        const warehouseByCode = new Map(warehouses.map((w) => [w.code, w.id]));
        const errors: string[] = [];
        const numbers: string[] = [];
        for (const { rowNumber, values } of rows) {
          const parsed = movementSchema.safeParse({
            ...values,
            type: values.type.toUpperCase(),
            productId: productBySku.get(values.sku.toUpperCase()) ?? "",
            warehouseId: warehouseByCode.get(values.warehouse.toUpperCase()) ?? "",
            toWarehouseId: values.toWarehouse ? (warehouseByCode.get(values.toWarehouse.toUpperCase()) ?? "?") : undefined,
          });
          if (!parsed.success) {
            errors.push(...zodErrors(rowNumber, parsed.error));
            continue;
          }
          // Rows are posted in order, so a later ISSUE can use stock received earlier in the same file.
          const result = await recordMovement(tx, userId, parsed.data, scope.mayUse);
          if ("error" in result) errors.push(`Row ${rowNumber}: ${result.error}`);
          else numbers.push(result.number);
        }
        if (errors.length) return { errors };
        return { summary: `${numbers.length} movement(s) posted${numbers.length ? `: ${numbers[0]} to ${numbers.at(-1)}` : ""}.` };
      },
    };
  }

  if (key === "customers") {
    await requirePermission(SALES.customersManage);
    return {
      title: "Customers",
      listHref: "/sales/customers",
      columns: [
        { key: "code", label: "Code", required: true, hint: "Existing codes are updated, new ones created", sample: "ACME" },
        { key: "name", label: "Name", required: true, sample: "Acme Trading Corp." },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address" },
        { key: "termsDays", label: "Terms (days)", hint: "Blank = 30", sample: "30" },
        { key: "tin", label: "TIN", sample: "123-456-789-00000" },
        { key: "vatCode", label: "VAT", hint: "VAT, ZERO or EXEMPT; blank = VAT", sample: "VAT" },
        { key: "cwtRate", label: "Withholds (%)", hint: "Percent the customer withholds (Form 2307); blank = 0", sample: "1" },
        { key: "cwtAtc", label: "Withholding ATC", hint: "e.g. WC158", sample: "WC158" },
        { key: "creditLimit", label: "Credit limit", hint: "Blank or 0 = no limit", sample: "100000" },
        activeColumn,
      ],
      async run(rows, tx, userId) {
        const errors: string[] = [];
        let created = 0;
        let updated = 0;
        for (const { rowNumber, values } of rows) {
          const parsed = customerSchema.safeParse({
            ...values,
            termsDays: values.termsDays || "30",
            vatCode: (values.vatCode || "VAT").toUpperCase(),
            isActive: yesNo(values.active),
          });
          if (!parsed.success) {
            errors.push(...zodErrors(rowNumber, parsed.error));
            continue;
          }
          const before = await tx.customer.findUnique({ where: { code: parsed.data.code } });
          const after = await tx.customer.upsert({ where: { code: parsed.data.code }, create: parsed.data, update: parsed.data });
          await audit({ userId, action: before ? "import-update" : "import", entity: "Customer", entityId: after.id, before, after }, tx);
          if (before) updated++;
          else created++;
        }
        return errors.length ? { errors } : { summary: `${created} customer(s) created, ${updated} updated.` };
      },
    };
  }

  if (key === "cash") {
    await requirePermission(FIN.cashPost);
    const scope = await getBranchScope();
    const branchByCode = new Map(scope.allowed.map((b) => [b.code, b]));
    return {
      title: "Cash book",
      listHref: "/finance/cash",
      columns: [
        { key: "date", label: "Date", required: true, hint: "YYYY-MM-DD", sample: "2026-10-01" },
        { key: "branch", label: "Branch code", required: true, hint: "A branch you work in", sample: scope.allowed[0]?.code },
        { key: "direction", label: "Direction", required: true, hint: "IN or OUT", sample: "IN" },
        {
          key: "category",
          label: "Category",
          required: true,
          hint: `IN: ${CASH_CATEGORIES.IN.join(", ")}. OUT: ${CASH_CATEGORIES.OUT.join(", ")}`,
          sample: "Opening balance",
        },
        { key: "amount", label: "Amount", required: true, hint: "Positive; Direction decides the sign", sample: "250000" },
        { key: "reference", label: "Reference" },
        { key: "note", label: "Description" },
      ],
      async run(rows, tx, userId) {
        const errors: string[] = [];
        const numbers: string[] = [];
        for (const { rowNumber, values } of rows) {
          const branch = branchByCode.get(values.branch.toUpperCase());
          if (!branch) {
            errors.push(`Row ${rowNumber}: unknown branch "${values.branch}" (or not one of yours)`);
            continue;
          }
          const parsed = cashEntrySchema.safeParse({ ...values, branchId: branch.id, direction: values.direction.toUpperCase() });
          if (!parsed.success) {
            errors.push(...zodErrors(rowNumber, parsed.error));
            continue;
          }
          const result = await recordCashEntry(tx, userId, parsed.data, scope.mayUse);
          if ("error" in result) errors.push(`Row ${rowNumber}: ${result.error}`);
          else numbers.push(result.number);
        }
        return errors.length ? { errors } : { summary: `${numbers.length} cash entr${numbers.length === 1 ? "y" : "ies"} recorded.` };
      },
    };
  }

  if (path[0] === "m" && path.length === 3) {
    const { entity, fields } = await requireCustomEntity(path[1], path[2], "manage");
    const inputFields = fields.filter((f) => !NOT_TYPED.includes(f.type));
    const auto = fields.find((f) => f.type === "autonumber");
    return {
      title: entity.name,
      listHref: `/m/${path[1]}/${path[2]}`,
      columns: inputFields.map((f) => ({
        key: f.key,
        label: f.label,
        required: f.required,
        hint: importHint(f),
      })),
      async run(rows, tx, userId) {
        const errors: string[] = [];
        let created = 0;
        const choices = await lookupChoices(fields);
        const rules = parseRules(entity.rules);
        for (const { rowNumber, values } of rows) {
          const input = Object.fromEntries(
            inputFields.map((f) => {
              const raw = values[f.key];
              if (f.type === "checkbox") return [f.key, yesNo(raw ?? "", false)];
              if (f.type === "multiselect")
                return [f.key, (raw ?? "").split(",").map((v) => v.trim()).filter(Boolean)];
              // Excel gives dates and times as "YYYY-MM-DD HH:MM"; the field stores "YYYY-MM-DDTHH:MM".
              if (f.type === "datetime") return [f.key, raw?.trim().replace(" ", "T").slice(0, 16)];
              return [f.key, raw];
            }),
          );
          // Fields hidden by a "show only when" condition are skipped, as in the form.
          const parsed = recordSchema(fields, new Set(), input).safeParse(input);
          if (!parsed.success) {
            errors.push(...zodErrors(rowNumber, parsed.error));
            continue;
          }
          const data: RecordData = { ...parsed.data };
          const problems = (await resolveLookups(fields, data, choices)) ?? (await uniqueErrors(tx, entity.id, fields, data));
          if (problems) {
            errors.push(...Object.values(problems).flat().map((m) => `Row ${rowNumber}: ${m}`));
            continue;
          }
          Object.assign(data, computeFormulas(fields, data));
          const broken = brokenRules(rules, fields, data);
          if (broken.length) {
            errors.push(...broken.map((m) => `Row ${rowNumber}: ${m}`));
            continue;
          }
          if (auto) {
            data[auto.key] = await nextNumber(tx, customSeriesType(entity.id), {
              defaults: customSeriesDefaults(`${entity.module.name} / ${entity.name}`, entity.slug),
            });
          }
          const record = await tx.customRecord.create({
            // Imported records wait for approval like typed ones when the record type needs it.
            data: { entityId: entity.id, data: JSON.stringify(data), createdById: userId, status: entity.approval ? "PENDING" : "" },
          });
          await audit({ userId, action: "import", entity: `${entity.module.name} / ${entity.name}`, entityId: record.id, after: data }, tx);
          created++;
        }
        return errors.length ? { errors } : { summary: `${created} record(s) created.` };
      },
    };
  }

  notFound();
}

/** The note under a column of a custom record type's import template. */
function importHint(f: CustomField) {
  const unique = f.unique ? " Must be unique." : "";
  switch (f.type) {
    case "select":
      return `One of: ${f.options.join(", ")}${unique}`;
    case "multiselect":
      return `Any of: ${f.options.join(", ")} (separate with commas)`;
    case "checkbox":
      return "Yes or No";
    case "date":
      return `A date (YYYY-MM-DD)${unique}`;
    case "datetime":
      return `A date and time (YYYY-MM-DD HH:MM)${unique}`;
    case "number":
    case "percent":
      return `A number${unique}`;
    case "decimal":
      return `A number with up to ${f.decimals} decimals${unique}`;
    case "money":
      return `An amount with up to 2 decimals${unique}`;
    case "lookup":
      return `The name or code exactly as shown in the app${unique}`;
    case "email":
      return `An email address${unique}`;
    case "url":
      return `A web address starting with http:// or https://${unique}`;
    default:
      return unique.trim() || undefined;
  }
}
