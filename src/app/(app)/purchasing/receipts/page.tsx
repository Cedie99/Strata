import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { receiptList } from "@/modules/purchasing/lists";
import { P } from "@/modules/purchasing/module";

export const metadata: Metadata = { title: "Receiving reports" };

export default async function ReceiptsPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.view);
  const list = await receiptList(await readGridQuery(searchParams));
  return (
    <>
      <PageHeader title="Receiving reports" description="Goods received against purchase orders. Receive from the purchase order page; bill them under Supplier bills." />
      <DataGrid
        {...list}
        searchPlaceholder="Search number, DR, PO or supplier"
        deleteHint="Receiving reports are permanent. Return goods with a stock movement."
        exportPath="/export/receipts"
        noun={["receipt", "receipts"]}
      />
    </>
  );
}
