import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { formatMoney } from "@/core/format";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { getSettings } from "@/core/settings";
import { stockList } from "@/modules/inventory/lists";
import { P } from "@/modules/inventory/module";

export const metadata: Metadata = { title: "Stock on hand" };

export default async function StockPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const [{ totalValue, ...list }, settings] = await Promise.all([
    stockList(await readGridQuery(searchParams)),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Stock on hand"
        description={`Value at cost of the stock listed: ${formatMoney(totalValue, settings["company.currency"])}`}
      />
      <DataGrid
        {...list}
        newHref={can(user, P.stockPost) ? "/inventory/movements/new" : undefined}
        deleteHint="Stock changes only through movements."
        exportPath="/export/stock"
      />
    </>
  );
}
