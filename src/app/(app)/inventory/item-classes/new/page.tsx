import type { Metadata } from "next";
import { Card, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveItemClass } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { getItemClasses, getItemTypes, itemClassPath } from "@/modules/inventory/queries";
import { ItemClassForm } from "../item-class-form";

export const metadata: Metadata = { title: "New item class" };

export default async function NewItemClassPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  await requirePermission(P.classesManage);
  const [{ parent }, classes, types] = await Promise.all([searchParams, getItemClasses(), getItemTypes()]);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const preset = parent ? byId.get(parent) : undefined;
  const parents = classes
    .map((c) => ({ id: c.id, itemTypeId: c.itemTypeId, path: `${c.itemType} › ${itemClassPath(byId, c.id)}` }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return (
    <>
      <PageHeader title={preset ? `New subclass of ${itemClassPath(byId, preset.id)}` : "New item class"} />
      <Tabs tabs={[{ label: "List", href: "/inventory/item-classes" }, { label: "General", active: true }]} />
      <Card className="max-w-2xl">
        <ItemClassForm
          action={saveItemClass.bind(null, null)}
          itemTypes={types.filter((t) => t.isActive || t.id === preset?.itemTypeId)}
          parents={parents}
          values={preset && { itemTypeId: preset.itemTypeId, parentId: preset.id, description: "", editing: false }}
        />
      </Card>
    </>
  );
}
