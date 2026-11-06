import "server-only";
import { db } from "@/core/db";
import { formatDateTime } from "@/core/format";
import {
  dateCell,
  filterGrid,
  finishGrid,
  type FilterDef,
  type GridColumn,
  type GridList,
  type GridQuery,
} from "@/core/grid";

export async function userList(query: GridQuery, { all }: { all?: boolean } = {}): Promise<GridList> {
  const [users, roles, branches] = await Promise.all([
    db.user.findMany({
      orderBy: { name: "asc" },
      include: { roles: { include: { role: true } }, branches: { include: { branch: true } } },
    }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.branch.findMany({ orderBy: { code: "asc" } }),
  ]);
  type U = (typeof users)[number];
  // Users can have several roles/branches; a filter matches when one of them is the chosen one.
  const roleIds = (u: U) => u.roles.map((r) => r.roleId);
  const branchIds = (u: U) => u.branches.map((b) => b.branchId);
  const filters: FilterDef<U>[] = [
    {
      key: "role",
      label: "Role",
      type: "select",
      options: [{ value: "none", label: "No role" }, ...roles.map((r) => ({ value: r.id, label: r.name }))],
      get: (u) =>
        query.filters.f_role === "none"
          ? roleIds(u).length
            ? ""
            : "none"
          : roleIds(u).find((id) => id === query.filters.f_role),
    },
    {
      key: "branch",
      label: "Branch",
      type: "select",
      options: [
        { value: "none", label: "No branch" },
        ...branches.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })),
      ],
      get: (u) =>
        query.filters.f_branch === "none"
          ? branchIds(u).length
            ? ""
            : "none"
          : branchIds(u).find((id) => id === query.filters.f_branch),
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
      get: (u) => (u.isActive ? "active" : "inactive"),
    },
  ];
  const matched = filterGrid(users, query, {
    text: (u) => `${u.name} ${u.email}`,
    first: (u) => u.name,
    filters,
    all: true,
  });
  const columns: GridColumn[] = [
    { key: "created", label: "Date Created", kind: "date" },
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "roles", label: "Roles" },
    { key: "branches", label: "Branches" },
    { key: "status", label: "Status", kind: "status" },
  ];
  const rows = matched.rows.map((u) => ({
    id: u.id,
    href: `/admin/users/${u.id}`,
    cells: {
      created: dateCell(u.createdAt, formatDateTime),
      name: u.name,
      email: u.email,
      roles: u.roles.map((r) => r.role.name).join(", ") || "-",
      branches: u.branches.map((b) => b.branch.code).join(", ") || "-",
      status: u.isActive ? "Active" : { text: "Inactive", tone: "muted" as const },
    },
  }));
  return finishGrid(rows, columns, query, { all, filters: matched.filters });
}
