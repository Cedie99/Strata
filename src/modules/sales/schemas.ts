import { Prisma } from "@prisma/client";
import { z } from "zod";
import { checkbox, decimalString } from "@/core/forms";
import { VAT_CODES } from "@/core/tax";
import { PAYMENT_METHODS } from "./module";

// Validation shared by the forms (actions.ts) and the Excel importers (importers.ts).

/** A YYYY-MM-DD day from an <input type="date">, as local midnight (see the note in schema.prisma). */
export const dayString = (label = "Date") =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD)`)
    .transform((v) => new Date(`${v}T00:00:00`))
    .refine((d) => !Number.isNaN(d.getTime()), `${label} is not a valid date`);

const positive = (label: string) =>
  decimalString(label).refine((v) => new Prisma.Decimal(v).greaterThan(0), `${label} must be more than zero`);

const vatCode = z.enum(VAT_CODES.map((v) => v.value) as [string, ...string[]]);
const notNegative = (label: string) =>
  decimalString(label).refine((v) => !new Prisma.Decimal(v).isNegative(), `${label} cannot be negative`);

/** A TIN as 123-456-789 or 123-456-789-00000, or blank. */
export const tinString = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\d{3}-?\d{3}-?\d{3}(-?\d{3,5})?$/.test(v), "Use the TIN format 123-456-789-00000");

export const customerSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20).toUpperCase(),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(50).default(""),
  address: z.string().trim().max(500).default(""),
  termsDays: z.coerce.number().int("Whole days only").min(0).max(365),
  tin: tinString,
  vatCode,
  cwtRate: z.string().trim().default("").transform((v) => v || "0").pipe(decimalString("Withholding rate")).refine((v) => {
    const d = new Prisma.Decimal(v);
    return !d.isNegative() && d.lessThanOrEqualTo(32);
  }, "Withholding rate must be between 0 and 32%"),
  cwtAtc: z.string().trim().toUpperCase().max(10).default(""),
  /** Most the customer may owe; blank or 0 = no limit. */
  creditLimit: z.string().trim().default("").transform((v) => v || "0").pipe(notNegative("Credit limit")),
  isActive: checkbox,
});

export const invoiceLineSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  qty: positive("Quantity"),
  unitPrice: decimalString("Price").refine((v) => !new Prisma.Decimal(v).isNegative(), "Price cannot be negative"),
  vatCode,
});

export const invoiceSchema = z.object({
  customerId: z.string().min(1, "Choose a customer"),
  warehouseId: z.string().min(1, "Choose the warehouse the goods leave from"),
  date: dayString("Invoice date"),
  /** Blank = invoice date + the customer's terms. */
  dueDate: z.union([z.literal(""), dayString("Due date")]).optional(),
  reference: z.string().trim().max(100).default(""),
  note: z.string().trim().max(1000).default(""),
  lines: z
    .string()
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invoice lines are unreadable" });
        return z.NEVER;
      }
    })
    .pipe(z.array(invoiceLineSchema).min(1, "Add at least one line").max(200)),
});

export const paymentSchema = z.object({
  invoiceId: z.string().min(1, "Choose an invoice"),
  date: dayString(),
  /** What the invoice is reduced by: cash received + tax withheld by the customer. */
  amount: positive("Amount"),
  cwt: z.string().trim().default("").transform((v) => v || "0").pipe(notNegative("Tax withheld")),
  atc: z.string().trim().toUpperCase().max(10).default(""),
  method: z.enum(PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]]),
  reference: z.string().trim().max(100).default(""),
  note: z.string().trim().max(1000).default(""),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
