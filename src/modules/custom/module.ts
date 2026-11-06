import type { CustomEntity, CustomModule } from "@prisma/client";
import type { ModuleDefinition } from "../types";

/** Default numbering for a record type with an Auto number field, e.g. VEHI-2026-000001. */
export const customSeriesDefaults = (name: string, entitySlug: string) => ({
  name,
  prefix: entitySlug.replace(/[^a-z0-9]/g, "").slice(0, 4).toUpperCase() || "DOC",
  perBranch: false,
  yearly: true,
});

/**
 * The ► submenu a module's record types appear in when it is placed inside another menu:
 * a shared name if one was given, otherwise the module's own name; none if it lists them directly.
 */
export const submenuOf = (m: Pick<CustomModule, "name" | "menu" | "menuGroup" | "menuFlat">) =>
  m.menu && !m.menuFlat ? m.menuGroup || m.name : undefined;

/** Permission keys for an admin-built module. */
export const customPermission = (slug: string, level: "view" | "manage" | "approve") => `custom.${slug}.${level}`;

export function toModuleDefinition(m: CustomModule & { entities: CustomEntity[] }): ModuleDefinition {
  const view = customPermission(m.slug, "view");
  return {
    id: `custom.${m.slug}`,
    name: m.name,
    description: m.description,
    permissions: [
      { key: view, label: "View records" },
      { key: customPermission(m.slug, "manage"), label: "Create, edit and delete records" },
      { key: customPermission(m.slug, "approve"), label: "Approve or reject records (record types with approval)" },
    ],
    nav: m.entities.map((e) => ({
      label: e.name,
      href: `/m/${m.slug}/${e.slug}`,
      permission: view,
      group: submenuOf(m),
    })),
    menu: m.menu || undefined,
  };
}
