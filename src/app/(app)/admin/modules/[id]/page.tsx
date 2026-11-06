import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-dialog";
import { ActionForm } from "@/components/ui/form";
import { Card, listTabs, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { db } from "@/core/db";
import { P } from "@/modules/admin/module";
import { deleteModule, saveModule } from "@/modules/custom/actions";
import { parseFields, parseRules } from "@/modules/custom/fields";
import { getLookupTargets } from "@/modules/custom/lookups";
import { getMenuHosts } from "@/modules/registry";
import { ModuleForm } from "../module-form";

export const metadata: Metadata = { title: "Module" };

export default async function ModulePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.modulesManage);
  const { id } = await params;
  const mod = await db.customModule.findUnique({
    where: { id },
    include: { entities: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { records: true } } } } },
  });
  if (!mod) notFound();
  const recordCount = mod.entities.reduce((n, e) => n + e._count.records, 0);
  const first = mod.entities[0];

  return (
    <>
      <PageHeader
        title={mod.name}
        description={mod.description}
        actions={
          mod.isActive &&
          first && (
            <LinkButton href={`/m/${mod.slug}/${first.slug}`} variant="secondary">
              Open module
            </LinkButton>
          )
        }
      />
      <Tabs tabs={listTabs("/admin/modules", true)} />
      <div className="max-w-4xl space-y-6">
        <Card>
          <ModuleForm
            menus={await getMenuHosts()}
            lookupTargets={await getLookupTargets()}
            action={saveModule.bind(null, id)}
            values={{
              name: mod.name,
              slug: mod.slug,
              description: mod.description,
              menu: mod.menu,
              menuGroup: mod.menuGroup,
              menuFlat: mod.menuFlat,
              isActive: mod.isActive,
              entities: mod.entities.map((e) => ({
                id: e.id,
                name: e.name,
                slug: e.slug,
                recordCount: e._count.records,
                fields: parseFields(e.fields),
                formLayout: e.formLayout,
                approval: e.approval,
                rules: parseRules(e.rules),
              })),
            }}
          />
        </Card>
        <Card title="Delete module">
          <ActionForm action={deleteModule.bind(null, id)}>
            <p className="text-muted">
              {recordCount > 0
                ? `This module has ${recordCount} record(s), so it cannot be deleted. Untick "Active" to hide it instead.`
                : "Deletes the module and removes its permissions from every role. This cannot be undone."}
            </p>
            {recordCount === 0 && (
              <ConfirmSubmitButton
                label="Delete module"
                title="Delete this module?"
                items={[mod.name, ...mod.entities.map((e) => `Record type: ${e.name}`)]}
              >
                Its menu entries disappear and its permissions are removed from every role. This cannot be undone.
              </ConfirmSubmitButton>
            )}
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
