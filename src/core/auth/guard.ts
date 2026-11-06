import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: Set<string>;
};

/** The signed-in user for this request (memoised per request), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await readSession();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles.map((r) => r.role.name),
    permissions: new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission))),
  };
});

export function can(user: CurrentUser | null, permission: string) {
  return !!user && (user.permissions.has("*") || user.permissions.has(permission));
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Use at the top of every page and server action that needs a permission. */
export async function requirePermission(permission: string) {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/forbidden");
  return user;
}
