import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { supplierPaymentList } from "@/modules/purchasing/lists";
import { P } from "@/modules/purchasing/module";

export const metadata: Metadata = { title: "Payments made" };

export default async function SupplierPaymentsPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await supplierPaymentList(await readGridQuery(searchParams));
  return (
    <>
      <PageHeader title="Payments made" description="Payments to suppliers (check vouchers), net of the withholding tax kept for the BIR." />
      <DataGrid
        {...list}
        searchPlaceholder="Search number, check no. or supplier"
        newHref={can(user, P.paymentsPost) ? "/purchasing/payments/new" : undefined}
        deleteHint="Payments are permanent."
        exportPath="/export/payments-made"
        noun={["payment", "payments"]}
      />
    </>
  );
}
