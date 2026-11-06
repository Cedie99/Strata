import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { customerList } from "@/modules/sales/lists";
import { P } from "@/modules/sales/module";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await customerList(await readGridQuery(searchParams));
  const canManage = can(user, P.customersManage);

  return (
    <>
      <PageHeader title="Customers" />
      <Tabs tabs={listTabs("/sales/customers", false)} />
      <DataGrid
        {...list}
        newHref={canManage ? "/sales/customers/new" : undefined}
        exportPath="/export/customers"
        importHref={canManage ? "/import/customers" : undefined}
        noun={["customer", "customers"]}
      />
    </>
  );
}
