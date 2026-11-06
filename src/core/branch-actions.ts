"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { BRANCH_COOKIE, getBranchScope } from "./branches";

/** Picks the branch shown in lists ("" = all the user's branches). */
export async function pickBranch(formData: FormData) {
  const id = String(formData.get("branchId") ?? "");
  const scope = await getBranchScope();
  const store = await cookies();
  if (id && scope.mayUse(id)) {
    store.set(BRANCH_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  } else {
    store.delete(BRANCH_COOKIE);
  }
  revalidatePath("/", "layout");
}
