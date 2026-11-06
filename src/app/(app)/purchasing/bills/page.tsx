import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { billList } from "@/modules/purchasing/lists";
import { P } from "@/modules/purchasing/module";

export const metadata: Metadata = { title: "Supplier bills" };

export default async function BillsPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await billList(await readGridQuery(searchParams));
  return (
    <>
      <PageHeader title="Supplier bills" description="Suppliers' invoices (accounts payable vouchers). Bills are never edited; void an unpaid one to reverse it." />
      <DataGrid
        {...list}
        searchPlaceholder="Search number, supplier invoice or supplier"
        newHref={can(user, P.billsPost) ? "/purchasing/bills/new" : undefined}
        deleteHint="Bills are never deleted. Open one and void it instead."
        exportPath="/export/bills"
        noun={["bill", "bills"]}
      />
    </>
  );
}
