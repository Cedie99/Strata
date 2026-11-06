export type NavItem = {
  label: string;
  href: string;
  /** Hidden from users without this permission. */
  permission: string;
  /** Submenu (flyout) this item sits in, e.g. "Security". Items with the same group share one submenu. */
  group?: string;
};

export type ModuleDefinition = {
  id: string;
  name: string;
  description: string;
  /** Every permission key the module checks, with a label for the Roles screen. */
  permissions: { key: string; label: string }[];
  nav: NavItem[];
  /** Show the nav items inside another module's menu (its id, e.g. "inventory") instead of a menu of their own. */
  menu?: string;
};
