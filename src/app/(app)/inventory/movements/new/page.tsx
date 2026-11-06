import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { P } from "@/modules/inventory/module";
import { MovementForm } from "./movement-form";

export const metadata: Metadata = { title: "Post movement" };

export default async function NewMovementPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  await requirePermission(P.stockPost);
  const scope = await getBranchScope();
  const [{ productId }, products, warehouses] = await Promise.all([
    searchParams,
    db.product.findMany({ where: { isActive: true }, orderBy: { sku: "asc" } }),
    // Only the branch picked in the title bar; pick "All branches" to transfer between branches.
    db.warehouse.findMany({
      where: { isActive: true, branchId: { in: scope.ids } },
      orderBy: { code: "asc" },
      include: { branch: true },
    }),
  ]);

  return (
    <>
      <PageHeader title="Post stock movement" />
      <Card className="max-w-2xl">
        <MovementForm
          productId={productId}
          products={products.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name} (${p.unit})` }))}
          warehouses={warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name} (${w.branch.code})` }))}
        />
      </Card>
    </>
  );
}
