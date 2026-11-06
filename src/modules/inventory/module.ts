import type { ModuleDefinition } from "../types";

export const P = {
  view: "inventory.view",
  productsManage: "inventory.products.manage",
  warehousesManage: "inventory.warehouses.manage",
  stockPost: "inventory.stock.post",
  classesManage: "inventory.classes.manage",
} as const;

export const MOVEMENT_TYPES = ["RECEIPT", "ISSUE", "ADJUSTMENT", "TRANSFER"] as const;

export const inventoryModule: ModuleDefinition = {
  id: "inventory",
  name: "Inventory",
  description: "Products, warehouses and the stock ledger.",
  permissions: [
    { key: P.view, label: "View products, warehouses and stock" },
    { key: P.productsManage, label: "Create and edit products" },
    { key: P.warehousesManage, label: "Create and edit warehouses" },
    { key: P.stockPost, label: "Post stock movements" },
    { key: P.classesManage, label: "Create, edit and delete item types and classes" },
  ],
  nav: [
    { label: "Stock on hand", href: "/inventory/stock", permission: P.view },
    { label: "Movements", href: "/inventory/movements", permission: P.view },
    { label: "Products", href: "/inventory/products", permission: P.view },
    { label: "Warehouses", href: "/inventory/warehouses", permission: P.view },
  ],
};
