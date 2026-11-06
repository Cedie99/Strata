import type { Metadata } from "next";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveRole } from "@/modules/admin/actions";
import { P } from "@/modules/admin/module";
import { getModules } from "@/modules/registry";
import { RoleForm } from "../role-form";

export const metadata: Metadata = { title: "New role" };

export default async function NewRolePage() {
  await requirePermission(P.rolesManage);
  return (
    <>
      <PageHeader title="New role" />
      <Tabs tabs={listTabs("/admin/roles", true)} />
      <Card>
        <RoleForm action={saveRole.bind(null, null)} modules={await getModules()} />
      </Card>
    </>
  );
}
