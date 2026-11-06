import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Card, DataTable, EmptyRow, PageHeader, recordTabs, sectionLabel, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDateTime, formatQty } from "@/core/format";
import { saveProduct } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { getStockLevels } from "@/modules/inventory/queries";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id } });
  if (!product) notFound();

  const scope = await getBranchScope();
  const [levels, warehouses, recent, attachments] = await Promise.all([
    getStockLevels({ productId: id, branchIds: scope.ids }),
    db.warehouse.findMany({ where: { branchId: { in: scope.ids } } }),
    db.stockMovement.findMany({
      where: { productId: id, warehouse: { branchId: { in: scope.ids } } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { warehouse: true },
    }),
    db.attachment.count({ where: { entity: "Product", entityId: id } }),
  ]);
  const warehouseName = new Map(warehouses.map((w) => [w.id, `${w.code} · ${w.name}`]));

  return (
    <>
      <PageHeader
        title={`${product.sku} · ${product.name}`}
        actions={
          can(user, P.stockPost) && (
            <LinkButton href={`/inventory/movements/new?productId=${id}`} variant="secondary">
              Post movement
            </LinkButton>
          )
        }
      />
      <Tabs tabs={recordTabs("/inventory/products", `/inventory/products/${id}`, "general", attachments)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card title="Details">
          <ProductForm
            action={saveProduct.bind(null, id)}
            readOnly={!can(user, P.productsManage)}
            values={{
              sku: product.sku,
              name: product.name,
              description: product.description,
              unit: product.unit,
              cost: product.cost.toString(),
              price: product.price.toString(),
              reorderLevel: product.reorderLevel.toString(),
              isActive: product.isActive,
            }}
          />
        </Card>
        <div className="space-y-6">
          <Card title="Stock by warehouse">
            {levels.length === 0 ? (
              <p className="text-muted">No stock.</p>
            ) : (
              <ul className="space-y-1">
                {levels.map((l) => (
                  <li key={l.warehouseId} className="flex justify-between gap-2">
                    <span>{warehouseName.get(l.warehouseId)}</span>
                    <span className="tabular-nums">
                      {formatQty(l.qty)} {product.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <h2 className={`mt-8 mb-2 px-1 ${sectionLabel}`}>Recent movements</h2>
      <DataTable>
        <thead>
          <tr>
            <th>When</th>
            <th>Number</th>
            <th>Type</th>
            <th>Warehouse</th>
            <th className="text-right">Qty</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {recent.length === 0 && <EmptyRow colSpan={6}>No movements yet.</EmptyRow>}
          {recent.map((m) => (
            <tr key={m.id}>
              <td>{formatDateTime(m.createdAt)}</td>
              <td className="font-mono">{m.number || "-"}</td>
              <td>{m.type}</td>
              <td>{m.warehouse.code}</td>
              <td className="text-right tabular-nums">{formatQty(m.qty)}</td>
              <td>{m.reference}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
