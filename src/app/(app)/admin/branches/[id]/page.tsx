import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { saveBranch } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";
import { BranchForm } from "../branch-form";

export const metadata: Metadata = { title: "Branch" };

export default async function BranchPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.branchesManage);
  const { id } = await params;
  const branch = await db.branch.findUnique({
    where: { id },
    include: {
      warehouses: { orderBy: { code: "asc" } },
      users: { include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } },
    },
  });
  if (!branch) notFound();

  return (
    <>
      <PageHeader title={`${branch.code} · ${branch.name}`} />
      <Tabs tabs={listTabs("/admin/branches", true)} />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_18rem]">
        <Card>
          <BranchForm action={saveBranch.bind(null, id)} values={branch} />
        </Card>
        <div className="space-y-4">
          <Card title="Warehouses">
            {branch.warehouses.length === 0 ? (
              <p className="text-muted">None yet.</p>
            ) : (
              <ul className="space-y-1">
                {branch.warehouses.map((w) => (
                  <li key={w.id}>
                    {w.code} · {w.name}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Users">
            {branch.users.length === 0 ? (
              <p className="text-muted">Nobody is assigned. Assign branches on each user.</p>
            ) : (
              <ul className="space-y-1">
                {branch.users.map((u) => (
                  <li key={u.userId}>{u.user.name}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
