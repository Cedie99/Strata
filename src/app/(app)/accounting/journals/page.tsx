import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { journalList } from "@/modules/accounting/lists";
import { P } from "@/modules/accounting/module";

export const metadata: Metadata = { title: "Journal entries" };

export default async function JournalsPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await journalList(await readGridQuery(searchParams));

  return (
    <>
      <PageHeader
        title="Journal entries"
        description="Every posting in the books. Entries from documents are written automatically; they are never edited or deleted, only reversed."
      />
      <DataGrid
        {...list}
        letters={false}
        searchPlaceholder="Search entry number, document number or memo"
        newHref={can(user, P.journalPost) ? "/accounting/journals/new" : undefined}
        deleteHint="Journal entries are never deleted. Open a manual entry to reverse it."
        exportPath="/export/journals"
        noun={["entry", "entries"]}
      />
    </>
  );
}
