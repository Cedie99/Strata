import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import { dateCell, filterGrid, finishGrid, readGridQuery, type GridSearchParams } from "@/core/grid";
import { P } from "@/modules/admin/module";

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage({ searchParams }: { searchParams: GridSearchParams }) {
  await requirePermission(P.branchesManage);
  const [query, branches] = await Promise.all([
    readGridQuery(searchParams),
    db.branch.findMany({
      orderBy: { code: "asc" },
      include: { _count: { select: { users: true, warehouses: true } } },
    }),
  ]);
  const matched = filterGrid(branches, query, {
    text: (b) => `${b.code} ${b.name} ${b.address}`,
    first: (b) => b.name,
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
    ],
    all: true,
  });
  const list = finishGrid(
    matched.rows.map((b) => ({
      id: b.id,
      href: `/admin/branches/${b.id}`,
      cells: {
        created: dateCell(b.createdAt, formatDateTime),
        name: b.name,
        code: b.code,
        address: b.address || "-",
        warehouses: String(b._count.warehouses),
        users: String(b._count.users),
        status: b.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
      },
    })),
    [
      { key: "created", label: "Date Created", kind: "date" },
      { key: "name", label: "Name" },
      { key: "code", label: "Code", mono: true },
      { key: "address", label: "Address" },
      { key: "warehouses", label: "Warehouses", align: "right" },
      { key: "users", label: "Users", align: "right" },
      { key: "status", label: "Status", kind: "status" },
    ],
    query,
    { filters: matched.filters },
  );

  return (
    <>
      <PageHeader
        title="Branches"
        description="Sites or business units. Warehouses belong to a branch; users only see the branches assigned to them."
      />
      <Tabs tabs={listTabs("/admin/branches", false)} />
      <DataGrid {...list} newHref="/admin/branches/new" deleteHint="Branches cannot be deleted. Untick Active instead." />
    </>
  );
}
