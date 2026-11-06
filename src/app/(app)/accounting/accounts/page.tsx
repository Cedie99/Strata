import type { Metadata } from "next";
import { DataGrid } from "@/components/ui/data-grid";
import { PageHeader, Tabs, listTabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridSearchParams } from "@/core/grid";
import { accountList } from "@/modules/accounting/lists";
import { P } from "@/modules/accounting/module";

export const metadata: Metadata = { title: "Chart of accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: GridSearchParams }) {
  const user = await requirePermission(P.view);
  const list = await accountList(await readGridQuery(searchParams));

  return (
    <>
      <PageHeader title="Chart of accounts" description="Accounts marked “Automatic postings” receive entries from invoices, payments, the cash book and stock." />
      <Tabs tabs={listTabs("/accounting/accounts", false)} />
      <DataGrid
        {...list}
        letters={false}
        newHref={can(user, P.accountsManage) ? "/accounting/accounts/new" : undefined}
        deleteHint="Accounts are never deleted. Mark them inactive instead."
        exportPath="/export/accounts"
        noun={["account", "accounts"]}
      />
    </>
  );
}
