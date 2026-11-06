import type { Metadata } from "next";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { P } from "@/modules/admin/module";
import { saveModule } from "@/modules/custom/actions";
import { getLookupTargets } from "@/modules/custom/lookups";
import { getMenuHosts } from "@/modules/registry";
import { ModuleForm } from "../module-form";

export const metadata: Metadata = { title: "New module" };

export default async function NewModulePage() {
  await requirePermission(P.modulesManage);
  return (
    <>
      <PageHeader
        title="New module"
        description="After creating it, give roles its permissions under Administration → Roles."
      />
      <Tabs tabs={listTabs("/admin/modules", true)} />
      <Card className="max-w-4xl">
        <ModuleForm
          action={saveModule.bind(null, null)}
          menus={await getMenuHosts()}
          lookupTargets={await getLookupTargets()}
        />
      </Card>
    </>
  );
}
