import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatNumber } from "@/core/numbering";
import { saveSeries } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";
import { SeriesForm } from "./series-form";

export const metadata: Metadata = { title: "Document numbering" };

export default async function SeriesPage({ params }: { params: Promise<{ docType: string }> }) {
  await requirePermission(P.numberingManage);
  const docType = decodeURIComponent((await params).docType);
  const [series, counters] = await Promise.all([
    db.documentSeries.findUnique({ where: { docType } }),
    db.documentCounter.findMany({ where: { docType }, orderBy: [{ year: "desc" }, { branchCode: "asc" }] }),
  ]);
  if (!series) notFound();

  return (
    <>
      <PageHeader title={series.name} />
      <Tabs tabs={listTabs("/admin/numbering", true)} />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <SeriesForm action={saveSeries.bind(null, docType)} values={series} branchless={docType.startsWith("custom:")} />
        </Card>
        <Card title="Last numbers issued">
          {counters.length === 0 ? (
            <p className="text-muted">None yet.</p>
          ) : (
            <ul className="space-y-1 font-mono">
              {counters.map((c) => (
                <li key={`${c.branchCode}-${c.year}`}>{formatNumber(series, c.branchCode, c.year, c.next - 1)}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
