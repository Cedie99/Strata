import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import { dateCell, filterGrid, finishGrid, readGridQuery, type GridSearchParams } from "@/core/grid";
import { P } from "@/modules/admin/module";
import { deleteModules } from "@/modules/custom/actions";
import { submenuOf } from "@/modules/custom/module";
import { MENU_HOSTS } from "@/modules/registry";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.modulesManage);
  const [query, modules] = await Promise.all([
    readGridQuery(searchParams),
    db.customModule.findMany({
      orderBy: { name: "asc" },
      include: { entities: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { records: true } } } } },
    }),
  ]);
  const matched = filterGrid(modules, query, {
    text: (m) => `${m.name} ${m.slug} ${m.description} ${m.entities.map((e) => e.name).join(" ")}`,
    first: (m) => m.name,
    filters: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
        get: (x) => (x.isActive ? "active" : "inactive"),
      },
      {
        key: "records",
        label: "Has records",
        type: "select",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
        get: (m) => (m.entities.some((e) => e._count.records > 0) ? "yes" : "no"),
      },
    ],
    all: true,
  });
  const list = finishGrid(
    matched.rows.map((m) => ({
      id: m.id,
      href: `/admin/modules/${m.id}`,
      cells: {
        created: dateCell(m.createdAt, formatDateTime),
        name: m.name,
        slug: m.slug,
        entities: m.entities.map((e) => e.name).join(", "),
        menu: [MENU_HOSTS.find((h) => h.value === m.menu)?.label ?? "Own menu", submenuOf(m)].filter(Boolean).join(" › "),
        records: String(m.entities.reduce((n, e) => n + e._count.records, 0)),
        status: m.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
      },
    })),
    [
      { key: "created", label: "Date Created", kind: "date" },
      { key: "name", label: "Module" },
      { key: "slug", label: "URL name", mono: true },
      { key: "entities", label: "Record types" },
      { key: "menu", label: "Menu" },
      { key: "records", label: "Records", align: "right" },
      { key: "status", label: "Status", kind: "status" },
    ],
    query,
    { filters: matched.filters },
  );

  return (
    <>
      <PageHeader
        title="Modules"
        description="Build your own modules: record types with the fields you need. Grant access to them under Roles."
      />
      <Tabs tabs={listTabs("/admin/modules", false)} />
      <DataGrid {...list} newHref="/admin/modules/new" onDelete={deleteModules} noun={["module", "modules"]} />
    </>
  );
}
