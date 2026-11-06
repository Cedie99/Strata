import type { Metadata } from "next";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveBranch } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";
import { BranchForm } from "../branch-form";

export const metadata: Metadata = { title: "New branch" };

export default async function NewBranchPage() {
  await requirePermission(P.branchesManage);
  return (
    <>
      <PageHeader title="New branch" />
      <Tabs tabs={listTabs("/admin/branches", true)} />
      <Card className="max-w-2xl">
        <BranchForm action={saveBranch.bind(null, null)} />
      </Card>
    </>
  );
}
