import { Prisma } from "@prisma/client";
import { z } from "zod";
import { checkbox, decimalString } from "@/core/forms";
import { MOVEMENT_TYPES } from "./module";

// Validation shared by the forms (actions.ts) and the Excel importers (importers.ts).

export const productSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(40).toUpperCase(),
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).default(""),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  cost: decimalString("Cost"),
  price: decimalString("Price"),
  reorderLevel: decimalString("Reorder level"),
  isActive: checkbox,
});

export const warehouseSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20).toUpperCase(),
  name: z.string().trim().min(1, "Name is required").max(200),
  address: z.string().trim().max(500).default(""),
  branchId: z.string().min(1, "Choose a branch"),
  isActive: checkbox,
});

export const movementSchema = z
  .object({
    type: z.enum(MOVEMENT_TYPES),
    productId: z.string().min(1, "Choose a product"),
    warehouseId: z.string().min(1, "Choose a warehouse"),
    toWarehouseId: z.string().optional(),
    qty: decimalString("Quantity"),
    reference: z.string().trim().max(100).default(""),
    note: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    const qty = new Prisma.Decimal(v.qty);
    if (qty.isZero()) ctx.addIssue({ code: "custom", path: ["qty"], message: "Quantity cannot be zero" });
    if (v.type !== "ADJUSTMENT" && qty.isNegative())
      ctx.addIssue({ code: "custom", path: ["qty"], message: "Use a positive quantity; the type decides the direction" });
    if (v.type === "TRANSFER") {
      if (!v.toWarehouseId) ctx.addIssue({ code: "custom", path: ["toWarehouseId"], message: "Choose the destination" });
      else if (v.toWarehouseId === v.warehouseId)
        ctx.addIssue({ code: "custom", path: ["toWarehouseId"], message: "Destination must differ from source" });
    }
  });

export type MovementInput = z.infer<typeof movementSchema>;

export const itemClassSchema = z.object({
  itemTypeId: z.string().min(1, "Choose an item type"),
  parentId: z
    .string()
    .optional()
    .transform((v) => v || null),
  description: z.string().trim().min(1, "Description is required").max(100).toUpperCase(),
});

export const itemTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  isActive: checkbox,
});
