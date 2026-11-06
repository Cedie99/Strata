import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { invoiceList } from "@/modules/sales/lists";
import { P } from "@/modules/sales/module";

export const metadata: Metadata = { title: "Sales invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await invoiceList(await readGridQuery(searchParams));

  return (
    <>
      <PageHeader title="Sales invoices" description="Posting an invoice issues its stock. Invoices are never edited; void an unpaid one to reverse it." />
      <DataGrid
        {...list}
        searchPlaceholder="Search number, reference or customer"
        newHref={can(user, P.invoicesPost) ? "/sales/invoices/new" : undefined}
        deleteHint="Invoices are never deleted. Open one and void it instead."
        exportPath="/export/invoices"
        noun={["invoice", "invoices"]}
      />
    </>
  );
}
