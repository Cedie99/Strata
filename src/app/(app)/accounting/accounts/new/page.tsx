import type { Metadata } from "next";
import { Card, PageHeader, listTabs, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveAccount } from "@/modules/accounting/actions";
import { P } from "@/modules/accounting/module";
import { AccountForm } from "../account-form";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage() {
  await requirePermission(P.accountsManage);
  return (
    <>
      <PageHeader title="New account" />
      <Tabs tabs={listTabs("/accounting/accounts", true)} />
      <Card className="max-w-2xl">
        <AccountForm action={saveAccount.bind(null, null)} />
      </Card>
    </>
  );
}
