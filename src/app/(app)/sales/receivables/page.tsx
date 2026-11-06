import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { receivablesList } from "@/modules/sales/lists";
import { P } from "@/modules/sales/module";

export const metadata: Metadata = { title: "Receivables" };

export default async function ReceivablesPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.view);
  const list = await receivablesList(await readGridQuery(searchParams));

  return (
    <>
      <PageHeader title="Receivables" description="Every invoice with money still owed, oldest due date first. Open one to record a payment." />
      <DataGrid
        {...list}
        searchPlaceholder="Search invoice, reference or customer"
        deleteHint="Receivables clear when payments are recorded."
        exportPath="/export/receivables"
        noun={["invoice", "invoices"]}
      />
    </>
  );
}
