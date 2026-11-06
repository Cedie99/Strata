import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { payablesList } from "@/modules/purchasing/lists";
import { P } from "@/modules/purchasing/module";

export const metadata: Metadata = { title: "Payables" };

export default async function PayablesPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.view);
  const list = await payablesList(await readGridQuery(searchParams));
  return (
    <>
      <PageHeader title="Payables" description="Every bill with money still owed, oldest due date first, with its age. Open one to pay it." />
      <DataGrid
        {...list}
        searchPlaceholder="Search bill, supplier invoice or supplier"
        deleteHint="Payables clear when payments are recorded."
        exportPath="/export/payables"
        noun={["bill", "bills"]}
      />
    </>
  );
}
