import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/layout";
import { can, requireUser } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDateTime, formatQty } from "@/core/format";
import { P as FIN } from "@/modules/finance/module";
import { P as INV } from "@/modules/inventory/module";
import { getStockLevels } from "@/modules/inventory/queries";
import { getModules } from "@/modules/registry";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [user, modules] = await Promise.all([requireUser(), getModules()]);
  // Admin-built modules the user can open, shown as quick links.
  const custom = modules
    .filter((m) => m.id.startsWith("custom."))
    .map((m) => ({ ...m, nav: m.nav.filter((item) => can(user, item.permission)) }))
    .filter((m) => m.nav.length > 0);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Here is what is happening today." />
      <div className="space-y-6">
        {can(user, FIN.view) && (
          <Link href="/finance" className="block border border-border bg-surface p-4 hover:border-primary">
            <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Business dashboard</p>
            <p className="mt-1 font-semibold">Revenue, margins, receivables, cash flow, inventory and sales performance in one place →</p>
          </Link>
        )}
        {can(user, INV.view) && <InventorySummary />}
        {custom.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {custom.map((m) => (
              <Card key={m.id} title={m.name}>
                {m.description && <p className="mb-2 text-muted">{m.description}</p>}
                <ul className="space-y-1">
                  {m.nav.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="text-primary hover:underline">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
        {!can(user, INV.view) && !can(user, FIN.view) && custom.length === 0 && (
          <Card>
            <p className="text-muted">You have no modules yet. Ask an administrator to give your account a role.</p>
          </Card>
        )}
      </div>
    </>
  );
}

async function InventorySummary() {
  const scope = await getBranchScope();
  const [productCount, warehouseCount, products, levels, recent] = await Promise.all([
    db.product.count({ where: { isActive: true } }),
    db.warehouse.count({ where: { isActive: true, branchId: { in: scope.ids } } }),
    db.product.findMany({ where: { isActive: true } }),
    getStockLevels({ branchIds: scope.ids }),
    db.stockMovement.findMany({
      where: { warehouse: { branchId: { in: scope.ids } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { product: true, warehouse: true },
    }),
  ]);

  const onHand = new Map<string, number>();
  for (const l of levels) onHand.set(l.productId, (onHand.get(l.productId) ?? 0) + Number(l.qty.toString()));
  const low = products.filter((p) => (onHand.get(p.id) ?? 0) <= Number(p.reorderLevel.toString()));

  const stats = [
    { label: "Active products", value: productCount, href: "/inventory/products" },
    { label: "Warehouses", value: warehouseCount, href: "/inventory/warehouses" },
    { label: "Low on stock", value: low.length, href: "/inventory/stock", alert: true },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border border-border bg-surface p-5 hover:border-primary">
            <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">{s.label}</p>
            <p className={`mt-1 text-[28px] leading-none font-semibold tabular-nums ${s.alert && s.value > 0 ? "text-danger" : ""}`}>
              {s.value.toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Low on stock">
          {low.length === 0 ? (
            <p className="text-muted">All products are above their reorder level.</p>
          ) : (
            <ul className="space-y-1.5">
              {low.slice(0, 8).map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link href={`/inventory/products/${p.id}`} className="text-primary hover:underline">
                    {p.sku} · {p.name}
                  </Link>
                  <span className="tabular-nums text-danger">
                    {formatQty(onHand.get(p.id) ?? 0)} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Latest stock movements">
          {recent.length === 0 ? (
            <p className="text-muted">No movements yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>
                    {m.number || m.type} · {m.product.sku} @ {m.warehouse.code}
                    <span className="block text-xs text-muted">{formatDateTime(m.createdAt)}</span>
                  </span>
                  <span className="tabular-nums">{formatQty(m.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
