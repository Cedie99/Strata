import "server-only";
import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { parseFields } from "./fields";
import { customPermission } from "./module";

/**
 * Loads an active module's record type from its URL slugs and checks the user may see it.
 * 404s for unknown or deactivated modules.
 */
export async function requireCustomEntity(moduleSlug: string, entitySlug: string, level: "view" | "manage" = "view") {
  const entity = await db.customEntity.findFirst({
    where: { slug: entitySlug, module: { slug: moduleSlug, isActive: true } },
    include: { module: true },
  });
  if (!entity) notFound();
  const user = await requirePermission(customPermission(moduleSlug, level));
  return { user, entity, fields: parseFields(entity.fields) };
}
