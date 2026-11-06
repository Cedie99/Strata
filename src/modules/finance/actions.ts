"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formObject, fromZod, type ActionState } from "@/core/forms";
import { runPosting } from "@/core/posting";
import { P } from "./module";
import { recordCashEntry } from "./posting";
import { cashEntrySchema } from "./schemas";

export async function saveCashEntry(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.cashPost);
  const parsed = cashEntrySchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await runPosting((tx) => recordCashEntry(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };
  if ("error" in result.value) return { error: result.value.error };

  revalidatePath("/", "layout");
  redirect(`/finance/cash?q=${encodeURIComponent(result.value.number)}`);
}
