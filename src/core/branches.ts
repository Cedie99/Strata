import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { can, requireUser } from "@/core/auth/guard";
import { db } from "@/core/db";
import { P as ADMIN } from "@/modules/admin/module";

export const BRANCH_COOKIE = "erp_branch";

/**
 * The branches this user may work in, and the one picked in the title bar.
 * `ids` is what lists filter on: the picked branch, or every allowed branch when "All branches" is picked.
 * Always check writes against `allowed`, never only against what the form offered.
 */
export const getBranchScope = cache(async () => {
  const user = await requireUser();
  const allowed = await db.branch.findMany({
    where: { isActive: true, ...(can(user, ADMIN.branchesAll) ? {} : { users: { some: { userId: user.id } } }) },
    orderBy: { code: "asc" },
  });
  const pickedId = (await cookies()).get(BRANCH_COOKIE)?.value;
  const current = allowed.find((b) => b.id === pickedId) ?? (allowed.length === 1 ? allowed[0] : null);
  const allowedIds = new Set(allowed.map((b) => b.id));
  return {
    allowed,
    current,
    ids: current ? [current.id] : [...allowedIds],
    mayUse: (branchId: string) => allowedIds.has(branchId),
  };
});
