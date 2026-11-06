import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { deleteRule, saveRule } from "@/modules/approvals/actions";
import { P } from "@/modules/approvals/module";
import { RuleForm } from "../rule-form";

export const metadata: Metadata = { title: "Approval rule" };

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.rulesManage);
  const { id } = await params;
  const [rule, roles] = await Promise.all([
    db.approvalRule.findUnique({ where: { id }, include: { levels: { orderBy: { level: "asc" } } } }),
    db.role.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!rule) notFound();
  return (
    <>
      <PageHeader title={rule.name} description="Changes apply to documents submitted from now on." />
      <Card className="max-w-3xl">
        <RuleForm
          action={saveRule.bind(null, id)}
          remove={deleteRule.bind(null, id)}
          roles={roles.map((r) => ({ value: r.id, label: r.name }))}
          values={{ name: rule.name, trigger: rule.trigger, threshold: rule.threshold.toString(), isActive: rule.isActive, levels: rule.levels.map((l) => l.roleId) }}
        />
      </Card>
    </>
  );
}
