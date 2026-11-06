import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P } from "@/modules/sales/module";
import { InvoiceForm } from "./invoice-form";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requirePermission(P.invoicesPost);
  const scope = await getBranchScope();
  const [{ customerId }, customers, warehouses, products, settings] = await Promise.all([
    searchParams,
    db.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.warehouse.findMany({ where: { isActive: true, branchId: { in: scope.ids } }, orderBy: { code: "asc" }, include: { branch: true } }),
    db.product.findMany({ where: { isActive: true }, orderBy: { sku: "asc" } }),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader title="New sales invoice" />
      <Card className="max-w-4xl">
        <InvoiceForm
          customerId={customerId}
          today={toDateInput(new Date())}
          currency={settings["company.currency"]}
          customers={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})`, vatCode: c.vatCode }))}
          warehouses={warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name} (${w.branch.code})` }))}
          products={products.map((p) => ({
            value: p.id,
            label: `${p.sku} · ${p.name}`,
            unit: p.unit,
            price: p.price.toString(),
            cost: p.cost.toString(),
          }))}
        />
      </Card>
    </>
  );
}
