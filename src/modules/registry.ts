import "server-only";
import { cache } from "react";
import { db } from "@/core/db";
import type { ModuleDefinition } from "./types";
import { adminModule } from "./admin/module";
import { submenuOf, toModuleDefinition } from "./custom/module";
import { accountingModule } from "./accounting/module";
import { financeModule } from "./finance/module";
import { inventoryModule } from "./inventory/module";
import { purchasingModule } from "./purchasing/module";
import { salesModule } from "./sales/module";
import { approvalsModule } from "./approvals/module";
import { taxModule } from "./tax/module";

/**
 * Modules written in code. To add one: create src/modules/<id>/module.ts,
 * add its pages under src/app/(app)/<id>/, add its tables to prisma/schema.prisma,
 * then list it here. The menu and Roles screen pick it up automatically.
 *
 * Administrators can also build modules without code under Setup → Modules; those are stored in
 * the database and merged in by getModules(). They get their own menu, or appear inside a
 * built-in module's menu (e.g. an "Item Master" under Inventory).
 */
export const BUILT_IN_MODULES: ModuleDefinition[] = [inventoryModule, salesModule, purchasingModule, financeModule, accountingModule, taxModule, approvalsModule, adminModule];

/** Every installed module: built-in ones plus active admin-built ones (memoised per request). */
export const getModules = cache(async (): Promise<ModuleDefinition[]> => {
  const custom = await db.customModule.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { entities: { orderBy: { sortOrder: "asc" } } },
  });
  const admin = BUILT_IN_MODULES.at(-1)!;
  const placed = (m: ModuleDefinition) => {
    const host = BUILT_IN_MODULES.find((b) => b.id === m.menu);
    // Named after where it lives, so the Roles screen and dashboard read "Inventory › Item Master".
    return host ? { ...m, name: `${host.name} › ${m.name}` } : { ...m, menu: undefined };
  };
  // Admin-built modules sit between the built-in ones and Setup, which stays last.
  return [...BUILT_IN_MODULES.slice(0, -1), ...custom.map(toModuleDefinition).map(placed), admin];
});

/** Built-in modules a custom module can be placed in. */
export const MENU_HOSTS = BUILT_IN_MODULES.map((m) => ({ value: m.id, label: m.name }));

/** MENU_HOSTS plus the submenu names already used in each (built-in and custom), for the module builder. */
export async function getMenuHosts() {
  const used = await db.customModule.findMany({
    where: { menu: { not: "" }, menuFlat: false },
    select: { name: true, menu: true, menuGroup: true, menuFlat: true },
  });
  return BUILT_IN_MODULES.map((m) => ({
    value: m.id,
    label: m.name,
    groups: [
      ...new Set([
        ...m.nav.flatMap((n) => (n.group ? [n.group] : [])),
        ...used.filter((u) => u.menu === m.id).map((u) => submenuOf(u)!),
      ]),
    ].sort((a, b) => a.localeCompare(b)),
  }));
}

export async function getAllPermissions() {
  return (await getModules()).flatMap((m) => m.permissions.map((p) => p.key));
}
