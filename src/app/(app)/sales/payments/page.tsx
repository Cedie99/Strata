import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { paymentList } from "@/modules/sales/lists";
import { P } from "@/modules/sales/module";

export const metadata: Metadata = { title: "Payments received" };

export default async function PaymentsPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.view);
  const list = await paymentList(await readGridQuery(searchParams));

  return (
    <>
      <PageHeader title="Payments received" description="Record a payment from its invoice (Receivables lists every invoice still owed)." />
      <DataGrid
        {...list}
        searchPlaceholder="Search number, reference, invoice or customer"
        canEdit={false}
        deleteHint="Payments are never deleted."
        exportPath="/export/payments"
        noun={["payment", "payments"]}
      />
    </>
  );
}
