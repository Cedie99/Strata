import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { supplierList } from "@/modules/purchasing/lists";
import { P } from "@/modules/purchasing/module";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await supplierList(await readGridQuery(searchParams));
  return (
    <>
      <PageHeader title="Suppliers" />
      <DataGrid
        {...list}
        searchPlaceholder="Search code, name, TIN, email or phone"
        newHref={can(user, P.suppliersManage) ? "/purchasing/suppliers/new" : undefined}
        deleteHint="Suppliers are never deleted. Open one and untick Active instead."
        exportPath="/export/suppliers"
        noun={["supplier", "suppliers"]}
      />
    </>
  );
}
