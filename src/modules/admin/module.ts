import type { ModuleDefinition } from "../types";

export const P = {
  usersView: "admin.users.view",
  usersManage: "admin.users.manage",
  rolesManage: "admin.roles.manage",
  modulesManage: "admin.modules.manage",
  branchesManage: "admin.branches.manage",
  /** See and work in every branch, not just the ones assigned to the user. */
  branchesAll: "admin.branches.all",
  numberingManage: "admin.numbering.manage",
  auditView: "admin.audit.view",
  settingsManage: "admin.settings.manage",
  brandingManage: "admin.branding.manage",
} as const;

export const adminModule: ModuleDefinition = {
  id: "admin",
  name: "Setup",
  description: "Users, roles, branches, numbering, custom modules, audit log, settings and branding.",
  permissions: [
    { key: P.usersView, label: "View users" },
    { key: P.usersManage, label: "Create and edit users" },
    { key: P.rolesManage, label: "Manage roles and permissions" },
    { key: P.modulesManage, label: "Build and change custom modules" },
    { key: P.branchesManage, label: "Create and edit branches" },
    { key: P.branchesAll, label: "See all branches (not only assigned ones)" },
    { key: P.numberingManage, label: "Change document numbering" },
    { key: P.auditView, label: "View audit log" },
    { key: P.settingsManage, label: "Change company settings" },
    { key: P.brandingManage, label: "Change branding (name, logo, fonts, colours)" },
  ],
  nav: [
    { label: "Company settings", href: "/admin/settings", permission: P.settingsManage, group: "Global Setup" },
    { label: "Branding", href: "/admin/branding", permission: P.brandingManage, group: "Global Setup" },
    { label: "Branches", href: "/admin/branches", permission: P.branchesManage, group: "Global Setup" },
    { label: "Document numbering", href: "/admin/numbering", permission: P.numberingManage, group: "Global Setup" },
    { label: "Users", href: "/admin/users", permission: P.usersView, group: "Security" },
    { label: "Roles", href: "/admin/roles", permission: P.rolesManage, group: "Security" },
    { label: "Audit log", href: "/admin/audit", permission: P.auditView, group: "Security" },
    { label: "Modules", href: "/admin/modules", permission: P.modulesManage, group: "Customization" },
    // Inventory set-up lists live under SETUP; their pages and permissions belong to the Inventory module.
    { label: "Item Classes", href: "/inventory/item-classes", permission: "inventory.view", group: "Inventory/WMS" },
    { label: "Item Types", href: "/inventory/item-types", permission: "inventory.view", group: "Inventory/WMS" },
  ],
};
