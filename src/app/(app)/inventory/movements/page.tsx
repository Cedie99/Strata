import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { movementList } from "@/modules/inventory/lists";
import { P } from "@/modules/inventory/module";

export const metadata: Metadata = { title: "Stock movements" };

export default async function MovementsPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await movementList(await readGridQuery(searchParams));
  const canPost = can(user, P.stockPost);

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="The stock ledger. Entries are never edited; correct mistakes with an adjustment."
      />
      <DataGrid
        {...list}
        letters={false}
        searchPlaceholder="Search number, reference, type, product or warehouse"
        newHref={canPost ? "/inventory/movements/new" : undefined}
        canEdit={false}
        deleteHint="Ledger entries are never deleted. Post an adjustment instead."
        exportPath="/export/movements"
        importHref={canPost ? "/import/movements" : undefined}
      />
    </>
  );
}
