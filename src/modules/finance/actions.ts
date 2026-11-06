"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formObject, type ActionState } from "@/core/forms";
import { submit } from "@/modules/approvals/engine";
import { P } from "./module";

export async function saveCashEntry(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.cashPost);
  const scope = await getBranchScope();
  // Cash out over a limit waits for approval; everything else is posted at once.
  const result = await submit("CashOut", formObject(formData), user, scope);
  if ("state" in result) return result.state;
  revalidatePath("/", "layout");
  redirect(result.redirect);
}
