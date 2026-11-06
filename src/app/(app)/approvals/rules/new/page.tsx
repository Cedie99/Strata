import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { saveRule } from "@/modules/approvals/actions";
import { P } from "@/modules/approvals/module";
import { RuleForm } from "../rule-form";

export const metadata: Metadata = { title: "New approval rule" };

export default async function NewRulePage() {
  await requirePermission(P.rulesManage);
  const roles = await db.role.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New approval rule" />
      <Card className="max-w-3xl">
        <RuleForm action={saveRule.bind(null, null)} roles={roles.map((r) => ({ value: r.id, label: r.name }))} />
      </Card>
    </>
  );
}
