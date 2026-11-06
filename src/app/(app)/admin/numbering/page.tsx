import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { filterGrid, finishGrid, readGridQuery, type GridSearchParams } from "@/core/grid";
import { BUILT_IN_SERIES, ensureSeries, formatNumber } from "@/core/numbering";
import { P } from "@/modules/admin/module";

export const metadata: Metadata = { title: "Document numbering" };

export default async function NumberingPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.numberingManage);
  // Built-in series are listed even before their first document is saved.
  for (const [docType, defaults] of Object.entries(BUILT_IN_SERIES)) await ensureSeries(db, docType, defaults);
  const [query, series, counters] = await Promise.all([
    readGridQuery(searchParams),
    db.documentSeries.findMany({ orderBy: { name: "asc" } }),
    db.documentCounter.groupBy({ by: ["docType"], _sum: { next: true }, _count: true }),
  ]);
  const issued = new Map(counters.map((c) => [c.docType, (c._sum.next ?? 0) - c._count]));
  const matched = filterGrid(series, query, {
    text: (s) => `${s.name} ${s.prefix}`,
    first: (s) => s.name,
    filters: [
      {
        key: "kind",
        label: "Document kind",
        type: "select",
        options: [
          { value: "builtin", label: "Built-in" },
          { value: "custom", label: "Custom module" },
        ],
        get: (s) => (s.docType.startsWith("custom:") ? "custom" : "builtin"),
      },
    ],
    all: true,
  });
  const list = finishGrid(
    matched.rows.map((s) => ({
      id: s.docType,
      href: `/admin/numbering/${encodeURIComponent(s.docType)}`,
      cells: {
        name: s.name,
        example: formatNumber(s, "MNL", new Date().getFullYear(), 1),
        perBranch: s.perBranch ? "Yes" : "No",
        yearly: s.yearly ? "Yes" : "No",
        issued: String(issued.get(s.docType) ?? 0),
      },
    })),
    [
      { key: "name", label: "Document" },
      { key: "example", label: "Example", mono: true },
      { key: "perBranch", label: "Per branch" },
      { key: "yearly", label: "Restarts yearly" },
      { key: "issued", label: "Numbers issued", align: "right" },
    ],
    query,
    { filters: matched.filters },
  );

  return (
    <>
      <PageHeader
        title="Document numbering"
        description="How document numbers look. Each branch and year can have its own counter; numbers never skip."
      />
      <Tabs tabs={listTabs("/admin/numbering", false)} />
      <DataGrid {...list} deleteHint="Number series cannot be deleted." />
    </>
  );
}
