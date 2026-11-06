import { Prisma } from "@prisma/client";
import { z } from "zod";
import { checkbox, decimalString } from "@/core/forms";
import { dayString } from "@/modules/sales/schemas";
import { ACCOUNT_TYPES } from "./module";

export const accountSchema = z.object({
  code: z.string().trim().regex(/^\d{4,6}$/, "Use 4 to 6 digits, e.g. 6150"),
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(ACCOUNT_TYPES.map((t) => t.value) as [string, ...string[]]),
  isActive: checkbox,
});

const amount = (label: string) => z.union([z.literal(""), decimalString(label)]).transform((v) => new Prisma.Decimal(v || "0"));

export const manualLineSchema = z
  .object({
    accountId: z.string().min(1, "Choose an account"),
    branchId: z.string().min(1, "Choose a branch"),
    debit: amount("Debit"),
    credit: amount("Credit"),
    memo: z.string().trim().max(200).default(""),
  })
  .refine((l) => !l.debit.isNegative() && !l.credit.isNegative(), "Amounts cannot be negative")
  .refine((l) => l.debit.isZero() !== l.credit.isZero(), "Each line needs either a debit or a credit");

export const manualJournalSchema = z.object({
  date: dayString(),
  memo: z.string().trim().min(3, "Say what the entry is for").max(500),
  lines: z
    .string()
    .transform((v, ctx) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "The lines are unreadable" });
        return z.NEVER;
      }
    })
    .pipe(z.array(manualLineSchema).min(2, "A journal entry needs at least two lines").max(100)),
});
