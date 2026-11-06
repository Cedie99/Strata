// Seeds roles, a main branch, an admin login and a little sample inventory. Safe to re-run.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";

async function main() {
  const admin = await db.role.upsert({
    where: { name: "Administrator" },
    update: {},
    create: {
      name: "Administrator",
      description: "Full access",
      isSystem: true,
      permissions: { create: [{ permission: "*" }] },
    },
  });

  await db.role.upsert({
    where: { name: "Inventory Clerk" },
    update: {},
    create: {
      name: "Inventory Clerk",
      description: "Views inventory and posts stock movements",
      permissions: { create: ["inventory.view", "inventory.stock.post"].map((permission) => ({ permission })) },
    },
  });

  await db.role.upsert({
    where: { name: "Sales Clerk" },
    update: {},
    create: {
      name: "Sales Clerk",
      description: "Posts sales invoices and records customer payments",
      permissions: {
        create: ["sales.view", "sales.customers.manage", "sales.invoices.post", "sales.payments.post", "inventory.view"].map((permission) => ({ permission })),
      },
    },
  });

  await db.role.upsert({
    where: { name: "Finance" },
    update: {},
    create: {
      name: "Finance",
      description: "Sees the business dashboard, keeps the cash book and records payments",
      permissions: {
        create: ["finance.view", "finance.cash.post", "sales.view", "sales.payments.post", "inventory.view"].map((permission) => ({ permission })),
      },
    },
  });

  await db.role.upsert({
    where: { name: "Accountant" },
    update: {},
    create: {
      name: "Accountant",
      description: "Keeps the books: journals, chart of accounts, period close and financial statements",
      permissions: {
        create: [
          "accounting.view",
          "accounting.accounts.manage",
          "accounting.journal.post",
          "accounting.periods.manage",
          "finance.view",
          "sales.view",
          "inventory.view",
        ].map((permission) => ({ permission })),
      },
    },
  });

  const branch = await db.branch.upsert({
    where: { code: "MAIN" },
    update: {},
    create: { code: "MAIN", name: "Main Branch" },
  });

  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!existing) {
    await db.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: "Administrator",
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
        roles: { create: [{ roleId: admin.id }] },
        branches: { create: [{ branchId: branch.id }] },
      },
    });
    console.log(`Created admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (change it after signing in)`);
  }

  if ((await db.product.count()) === 0) {
    const [main, north] = await Promise.all([
      db.warehouse.create({ data: { code: "MAIN", name: "Main Warehouse", branchId: branch.id } }),
      db.warehouse.create({ data: { code: "NORTH", name: "North Depot", branchId: branch.id } }),
    ]);
    const products = await Promise.all([
      db.product.create({ data: { sku: "DSL-001", name: "Diesel", unit: "L", cost: "52.50", price: "58.90", reorderLevel: "5000" } }),
      db.product.create({ data: { sku: "GAS-091", name: "Unleaded 91", unit: "L", cost: "55.10", price: "61.40", reorderLevel: "5000" } }),
      db.product.create({ data: { sku: "LUB-4T1", name: "Engine Oil 4T 1L", unit: "pc", cost: "180", price: "245", reorderLevel: "50" } }),
    ]);
    const receipts = [
      { product: products[0], warehouse: main, qty: "20000" },
      { product: products[1], warehouse: main, qty: "3000" },
      { product: products[2], warehouse: north, qty: "120" },
    ];
    for (const r of receipts) {
      await db.stockMovement.create({
        data: { productId: r.product.id, warehouseId: r.warehouse.id, qty: r.qty, type: "RECEIPT", reference: "OPENING" },
      });
    }
    console.log("Added sample warehouses, products and opening stock.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
