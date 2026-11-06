import type { Metadata } from "next";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { saveUser } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  const me = await requirePermission(P.usersManage);
  const [roles, branches] = await Promise.all([
    can(me, P.rolesManage) ? db.role.findMany({ orderBy: { name: "asc" } }) : [],
    db.branch.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="New user" />
      <Tabs tabs={listTabs("/admin/users", true)} />
      <Card className="max-w-2xl">
        <UserForm action={saveUser.bind(null, null)} roles={roles} branches={branches} />
      </Card>
    </>
  );
}
