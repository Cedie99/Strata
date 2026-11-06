import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Card, PageHeader, listTabs, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { saveAccount } from "@/modules/accounting/actions";
import { P } from "@/modules/accounting/module";
import { AccountForm } from "../account-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [account, used] = await Promise.all([db.account.findUnique({ where: { id } }), db.journalLine.count({ where: { accountId: id } })]);
  if (!account) notFound();

  return (
    <>
      <PageHeader
        title={`${account.code} · ${account.name}`}
        description={account.systemKey ? "Used by automatic postings: it can be renamed or renumbered, but keeps its type and stays active." : undefined}
        actions={
          <LinkButton href={`/accounting/ledger?f_account=${id}`} variant="secondary">
            Open ledger
          </LinkButton>
        }
      />
      <Tabs tabs={listTabs("/accounting/accounts", true)} />
      <Card className="max-w-2xl">
        <AccountForm
          action={saveAccount.bind(null, id)}
          readOnly={!can(user, P.accountsManage)}
          lockType={!!account.systemKey || used > 0}
          values={{ code: account.code, name: account.name, type: account.type, isActive: account.isActive }}
        />
      </Card>
    </>
  );
}
