import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { can } from "@/core/auth/guard";
import { db } from "@/core/db";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { deleteRecords } from "@/modules/custom/actions";
import { recordList } from "@/modules/custom/lists";
import { customPermission } from "@/modules/custom/module";
import { requireCustomEntity } from "@/modules/custom/queries";

type Params = { module: string; entity: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { module, entity } = await params;
  const found = await db.customEntity.findFirst({ where: { slug: entity, module: { slug: module } } });
  return { title: found?.name ?? "Records" };
}

export default async function RecordsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: GridSearchParams;
}) {
  const { module: moduleSlug, entity: entitySlug } = await params;
  const { user, entity, fields } = await requireCustomEntity(moduleSlug, entitySlug);
  const list = await recordList(entity, fields, await readGridQuery(searchParams));
  const base = `/m/${moduleSlug}/${entitySlug}`;
  const canManage = can(user, customPermission(moduleSlug, "manage"));

  return (
    <>
      <PageHeader title={entity.name} description={entity.module.description} />
      <Tabs tabs={listTabs(base, false)} />
      <DataGrid
        {...list}
        newHref={canManage ? `${base}/new` : undefined}
        onDelete={canManage ? deleteRecords.bind(null, entity.id) : undefined}
        deleteHint="You can view these records but not delete them."
        letters={fields.some((f) => f.type !== "textarea")}
        exportPath={`/export${base}`}
        importHref={canManage ? `/import${base}` : undefined}
      />
    </>
  );
}
