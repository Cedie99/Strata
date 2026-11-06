import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { cashList } from "@/modules/finance/lists";
import { P } from "@/modules/finance/module";

export const metadata: Metadata = { title: "Cash book" };

export default async function CashBookPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await cashList(await readGridQuery(searchParams));
  const canPost = can(user, P.cashPost);

  return (
    <>
      <PageHeader
        title="Cash book"
        description="Money in and out. Customer payments appear automatically; record expenses, supplier payments and other cash here. Entries are never edited — correct a mistake with an opposite entry."
      />
      <DataGrid
        {...list}
        letters={false}
        searchPlaceholder="Search number, category, description or reference"
        newHref={canPost ? "/finance/cash/new" : undefined}
        canEdit={false}
        deleteHint="Cash entries are never deleted. Record an opposite entry instead."
        exportPath="/export/cash"
        importHref={canPost ? "/import/cash" : undefined}
        noun={["entry", "entries"]}
      />
    </>
  );
}
