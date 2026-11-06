import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { DataTable, EmptyRow, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P, triggerOf } from "@/modules/approvals/module";
import { ApprovalTabs } from "../shared";

export const metadata: Metadata = { title: "Approval rules" };

/** Every rule with who approves it, and a warning when a level's role has no active user. */
export default async function ApprovalRulesPage() {
  const user = await requirePermission(P.rulesManage);
  const [rules, settings, staffed] = await Promise.all([
    db.approvalRule.findMany({ include: { levels: { orderBy: { level: "asc" }, include: { role: true } } }, orderBy: [{ trigger: "asc" }, { threshold: "asc" }] }),
    getSettings(),
    db.userRole.findMany({ where: { user: { isActive: true } }, select: { roleId: true }, distinct: ["roleId"] }),
  ]);
  const hasPeople = new Set(staffed.map((s) => s.roleId));

  return (
    <>
      <PageHeader
        title="Approval rules"
        description="Which documents wait for approval before they are posted, and who approves them, in order."
        actions={<LinkButton href="/approvals/rules/new">New rule</LinkButton>}
      />
      <ApprovalTabs user={user} active="rules" />
      <DataTable>
        <thead>
          <tr>
            <th>Rule</th>
            <th>When</th>
            <th className="text-right">Limit</th>
            <th>Approved by, in order</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && <EmptyRow colSpan={5}>No rules yet: every document is posted as soon as it is saved.</EmptyRow>}
          {rules.map((r) => {
            const t = triggerOf(r.trigger);
            const limit = t?.unit === "none" ? "-" : t?.unit === "percent" ? `over ${r.threshold.toString()}%` : r.threshold.isZero() ? "every one" : `from ${formatMoney(r.threshold, settings["company.currency"])}`;
            return (
              <tr key={r.id}>
                <td>
                  <Link href={`/approvals/rules/${r.id}`} className="text-primary hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td>{t?.label ?? r.trigger}</td>
                <td className="text-right">{limit}</td>
                <td>
                  {r.levels.length === 0 && <span className="text-danger">No approver left (its role was deleted)</span>}
                  {r.levels.map((l, i) => (
                    <span key={l.id}>
                      {i > 0 && " → "}
                      <span className={hasPeople.has(l.roleId) ? undefined : "font-semibold text-danger"} title={hasPeople.has(l.roleId) ? undefined : "No active user has this role"}>
                        {l.role.name}
                        {!hasPeople.has(l.roleId) && " ⚠"}
                      </span>
                    </span>
                  ))}
                </td>
                <td>{r.isActive ? "Active" : <span className="text-muted">Off</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <p className="mt-3 px-1 text-xs text-muted">
        When several rules match one document, it needs every one of their approvers (each role once), in the order shown. ⚠ marks a role no active user has: requests
        would wait forever, so give the role to someone.
      </p>
    </>
  );
}
