import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P } from "@/modules/purchasing/module";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ supplierId?: string }> }) {
  await requirePermission(P.ordersManage);
  const scope = await getBranchScope();
  const [{ supplierId }, suppliers, warehouses, products, settings] = await Promise.all([
    searchParams,
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { isActive: true, branchId: { in: scope.ids } }, orderBy: { code: "asc" }, include: { branch: true } }),
    db.product.findMany({ where: { isActive: true }, orderBy: { sku: "asc" } }),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader title="New purchase order" description="Nothing is posted yet: stock and payables change when the goods are received and billed." />
      <Card className="max-w-5xl">
        <OrderForm
          supplierId={supplierId}
          today={toDateInput(new Date())}
          currency={settings["company.currency"]}
          suppliers={suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.code})`, vatRegistered: s.vatRegistered }))}
          warehouses={warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name} (${w.branch.code})` }))}
          products={products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}`, unit: p.unit, cost: p.cost.toDecimalPlaces(2).toString() }))}
        />
      </Card>
    </>
  );
}
