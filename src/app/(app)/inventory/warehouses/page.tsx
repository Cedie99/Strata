import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { warehouseList } from "@/modules/inventory/lists";
import { P } from "@/modules/inventory/module";

export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const canManage = can(user, P.warehousesManage);
  const list = await warehouseList(await readGridQuery(searchParams), { editable: canManage });

  return (
    <>
      <PageHeader title="Warehouses" />
      <Tabs tabs={listTabs("/inventory/warehouses", false)} />
      <DataGrid
        {...list}
        newHref={canManage ? "/inventory/warehouses/new" : undefined}
        canEdit={canManage}
        exportPath="/export/warehouses"
        importHref={canManage ? "/import/warehouses" : undefined}
      />
    </>
  );
}
