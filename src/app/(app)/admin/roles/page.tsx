import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import { dateCell, filterGrid, finishGrid, readGridQuery, type GridSearchParams } from "@/core/grid";
import { deleteRoles } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.rolesManage);
  const [query, roles] = await Promise.all([
    readGridQuery(searchParams),
    db.role.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true, permissions: true } } },
    }),
  ]);
  const matched = filterGrid(roles, query, {
    text: (r) => `${r.name} ${r.description}`,
    first: (r) => r.name,
    filters: [
      {
        key: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "system", label: "System" },
          { value: "custom", label: "Custom" },
        ],
        get: (r) => (r.isSystem ? "system" : "custom"),
      },
    ],
    all: true,
  });
  const list = finishGrid(
    matched.rows.map((r) => ({
      id: r.id,
      href: `/admin/roles/${r.id}`,
      cells: {
        created: dateCell(r.createdAt, formatDateTime),
        name: r.isSystem ? `${r.name} (system)` : r.name,
        description: r.description || "-",
        permissions: r.isSystem ? "All" : String(r._count.permissions),
        users: String(r._count.users),
      },
    })),
    [
      { key: "created", label: "Date Created", kind: "date" },
      { key: "name", label: "Role" },
      { key: "description", label: "Description" },
      { key: "permissions", label: "Permissions", align: "right" },
      { key: "users", label: "Users", align: "right" },
    ],
    query,
    { filters: matched.filters },
  );

  return (
    <>
      <PageHeader title="Roles" description="A role is a set of permissions. Give users one or more roles." />
      <Tabs tabs={listTabs("/admin/roles", false)} />
      <DataGrid {...list} newHref="/admin/roles/new" onDelete={deleteRoles} noun={["role", "roles"]} />
    </>
  );
}
