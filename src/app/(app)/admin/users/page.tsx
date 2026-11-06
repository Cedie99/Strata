import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { userList } from "@/modules/admin/lists";
import { P } from "@/modules/admin/module";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: GridSearchParams }) {
  const me = await requirePermission(P.usersView);
  const list = await userList(await readGridQuery(searchParams));

  return (
    <>
      <PageHeader title="Users" />
      <Tabs tabs={listTabs("/admin/users", false)} />
      <DataGrid
        {...list}
        newHref={can(me, P.usersManage) ? "/admin/users/new" : undefined}
        deleteHint="Users cannot be deleted. Untick Active to stop them signing in."
        exportPath="/export/users"
      />
    </>
  );
}
