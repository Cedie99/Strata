import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { saveWarehouse } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { WarehouseForm } from "../warehouse-form";

export const metadata: Metadata = { title: "Edit warehouse" };

export default async function EditWarehousePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.warehousesManage);
  const { id } = await params;
  const [warehouse, scope, attachments] = await Promise.all([
    db.warehouse.findUnique({ where: { id } }),
    getBranchScope(),
    db.attachment.count({ where: { entity: "Warehouse", entityId: id } }),
  ]);
  if (!warehouse || !scope.mayUse(warehouse.branchId)) notFound();

  return (
    <>
      <PageHeader title={`${warehouse.code} · ${warehouse.name}`} />
      <Tabs tabs={recordTabs("/inventory/warehouses", `/inventory/warehouses/${id}`, "general", attachments)} />
      <Card className="max-w-2xl">
        <WarehouseForm action={saveWarehouse.bind(null, id)} values={warehouse} branches={scope.allowed} />
      </Card>
    </>
  );
}
