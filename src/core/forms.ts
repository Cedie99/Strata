import { z } from "zod";

/** What every server action used with <ActionForm> returns. */
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  ok?: string;
} | undefined;

export function fromZod(error: z.ZodError): ActionState {
  return { error: "Please fix the highlighted fields.", fieldErrors: error.flatten().fieldErrors };
}

/** Turns FormData into a plain object; repeated keys (checkbox groups) become arrays. */
export function formObject(formData: FormData) {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).map(String);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

// Decimal amounts travel as strings and go to Prisma as strings, never JS floats.
export const decimalString = (label = "Value") =>
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d{1,4})?$/, `${label} must be a number with up to 4 decimals`);

export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.undefined()])
  .transform((v) => v !== undefined);

export const stringList = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));
