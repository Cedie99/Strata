import { Prisma } from "@prisma/client";
import { z } from "zod";
import { decimalString } from "@/core/forms";
import { dayString } from "@/modules/sales/schemas";
import { CASH_CATEGORIES } from "./module";

export const cashEntrySchema = z
  .object({
    branchId: z.string().min(1, "Choose a branch"),
    date: dayString(),
    direction: z.enum(["IN", "OUT"]),
    category: z.string().trim().min(1, "Choose a category"),
    amount: decimalString("Amount").refine((v) => new Prisma.Decimal(v).greaterThan(0), "Amount must be more than zero"),
    reference: z.string().trim().max(100).default(""),
    note: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    if (!CASH_CATEGORIES[v.direction].includes(v.category))
      ctx.addIssue({ code: "custom", path: ["category"], message: `Not a cash ${v.direction === "IN" ? "in" : "out"} category` });
  });

export type CashEntryInput = z.infer<typeof cashEntrySchema>;
