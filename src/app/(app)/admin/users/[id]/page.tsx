import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { saveUser } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission(P.usersView);
  const { id } = await params;
  const [user, roles, branches] = await Promise.all([
    db.user.findUnique({ where: { id }, include: { roles: true, branches: true } }),
    db.role.findMany({ orderBy: { name: "asc" } }),
    db.branch.findMany({ orderBy: { code: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <>
      <PageHeader title={user.name} description={user.email} />
      <Tabs tabs={listTabs("/admin/users", true)} />
      <Card className="max-w-2xl">
        <UserForm
          action={saveUser.bind(null, id)}
          roles={can(me, P.rolesManage) ? roles : []}
          branches={branches.filter((b) => b.isActive || user.branches.some((ub) => ub.branchId === b.id))}
          readOnly={!can(me, P.usersManage)}
          values={{
            name: user.name,
            email: user.email,
            isActive: user.isActive,
            roleIds: user.roles.map((r) => r.roleId),
            branchIds: user.branches.map((b) => b.branchId),
          }}
        />
      </Card>
    </>
  );
}
