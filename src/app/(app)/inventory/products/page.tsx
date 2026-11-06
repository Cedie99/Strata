import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { productList } from "@/modules/inventory/lists";
import { P } from "@/modules/inventory/module";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await productList(await readGridQuery(searchParams));
  const canManage = can(user, P.productsManage);

  return (
    <>
      <PageHeader title="Products" />
      <Tabs tabs={listTabs("/inventory/products", false)} />
      <DataGrid
        {...list}
        newHref={canManage ? "/inventory/products/new" : undefined}
        exportPath="/export/products"
        importHref={canManage ? "/import/products" : undefined}
      />
    </>
  );
}
