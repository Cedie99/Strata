import type { Metadata } from "next";
import { Card, PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { saveWarehouse } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { WarehouseForm } from "../warehouse-form";

export const metadata: Metadata = { title: "New warehouse" };

export default async function NewWarehousePage() {
  await requirePermission(P.warehousesManage);
  const scope = await getBranchScope();
  return (
    <>
      <PageHeader title="New warehouse" />
      <Tabs tabs={recordTabs("/inventory/warehouses", null, "general")} />
      <Card className="max-w-2xl">
        <WarehouseForm action={saveWarehouse.bind(null, null)} branches={scope.allowed} />
      </Card>
    </>
  );
}
