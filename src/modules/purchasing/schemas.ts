import { Prisma } from "@prisma/client";
import { z } from "zod";
import { checkbox, decimalString } from "@/core/forms";
import { dayString } from "@/modules/sales/schemas";
import { PAYMENT_METHODS } from "@/modules/sales/module";
import { VAT_CODES } from "./module";

const positive = (label: string) =>
  decimalString(label).refine((v) => new Prisma.Decimal(v).greaterThan(0), `${label} must be more than zero`);
const notNegative = (label: string) =>
  decimalString(label).refine((v) => !new Prisma.Decimal(v).isNegative(), `${label} cannot be negative`);
const vatCode = z.enum(VAT_CODES.map((v) => v.value) as [string, ...string[]]);

/** A JSON array posted in a hidden input (line grids). */
const jsonList = <T extends z.ZodTypeAny>(item: T, what: string, min = 1) =>
  z
    .string()
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: `${what} are unreadable` });
        return z.NEVER;
      }
    })
    .pipe(z.array(item).min(min, `Add at least one ${what.toLowerCase().replace(/s$/, "")}`).max(200));

const ewtRate = decimalString("Withholding rate").refine((v) => {
  const d = new Prisma.Decimal(v);
  return !d.isNegative() && d.lessThanOrEqualTo(32);
}, "Withholding rate must be between 0 and 32%");

export const supplierSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20).toUpperCase(),
  name: z.string().trim().min(1, "Name is required").max(200),
  tin: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^\d{3}-?\d{3}-?\d{3}(-?\d{3,5})?$/.test(v), "Use the TIN format 123-456-789-00000")
    .default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(50).default(""),
  address: z.string().trim().max(500).default(""),
  termsDays: z.coerce.number().int("Whole days only").min(0).max(365),
  vatRegistered: checkbox,
  ewtRate,
  isActive: checkbox,
});

export const orderSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  warehouseId: z.string().min(1, "Choose the warehouse the goods go to"),
  date: dayString("PO date"),
  expectedDate: z.union([z.literal(""), dayString("Expected date")]).optional(),
  reference: z.string().trim().max(100).default(""),
  note: z.string().trim().max(1000).default(""),
  lines: jsonList(
    z.object({ productId: z.string().min(1, "Choose a product"), qty: positive("Quantity"), unitCost: notNegative("Cost"), vatCode }),
    "Lines",
  ),
});

export const receiptSchema = z.object({
  orderId: z.string().min(1),
  reference: z.string().trim().max(100).default(""),
  note: z.string().trim().max(1000).default(""),
  lines: jsonList(z.object({ orderLineId: z.string().min(1), qty: positive("Quantity") }), "Lines"),
});

export const billSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  branchId: z.string().min(1, "Choose a branch"),
  supplierInvoiceNo: z.string().trim().min(1, "Enter the supplier's invoice or receipt number").max(50),
  date: dayString("Bill date"),
  dueDate: z.union([z.literal(""), dayString("Due date")]).optional(),
  ewtRate,
  atc: z.string().trim().max(10).toUpperCase().default(""),
  note: z.string().trim().max(1000).default(""),
  receiptLineIds: jsonList(z.string().min(1), "Received lines", 0),
  expenses: jsonList(
    z.object({
      accountId: z.string().min(1, "Choose an account"),
      description: z.string().trim().max(200),
      amount: positive("Amount"),
      vatCode,
    }),
    "Expense lines",
    0,
  ),
});

export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  date: dayString("Payment date"),
  method: z.enum(PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]]),
  reference: z.string().trim().max(100).default(""),
  note: z.string().trim().max(1000).default(""),
  allocations: jsonList(z.object({ billId: z.string().min(1), amount: positive("Amount") }), "Bills to pay"),
});

export type OrderInput = z.infer<typeof orderSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type BillInput = z.infer<typeof billSchema>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
