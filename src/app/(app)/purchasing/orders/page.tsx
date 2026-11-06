import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { orderList } from "@/modules/purchasing/lists";
import { P } from "@/modules/purchasing/module";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function OrdersPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await orderList(await readGridQuery(searchParams));
  return (
    <>
      <PageHeader title="Purchase orders" description="Open an order to receive its goods. Orders are never edited; close or cancel one instead." />
      <DataGrid
        {...list}
        searchPlaceholder="Search number, reference or supplier"
        newHref={can(user, P.ordersManage) ? "/purchasing/orders/new" : undefined}
        deleteHint="Purchase orders are never deleted. Open one and cancel it instead."
        exportPath="/export/purchase-orders"
        noun={["order", "orders"]}
      />
    </>
  );
}
