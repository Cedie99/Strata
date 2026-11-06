import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveItemClass } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { getItemClasses, getItemTypes, itemClassPath } from "@/modules/inventory/queries";
import { ItemClassForm } from "../item-class-form";

export const metadata: Metadata = { title: "Edit item class" };

export default async function EditItemClassPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(P.classesManage);
  const [{ id }, classes, types] = await Promise.all([params, getItemClasses(), getItemTypes()]);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const current = byId.get(id);
  if (!current) notFound();

  // It cannot move under itself or one of its own subclasses, nor into another item type.
  const isDescendant = (c: (typeof classes)[number]) => {
    for (let at: typeof c | undefined = c; at; at = at.parentId ? byId.get(at.parentId) : undefined)
      if (at.id === id) return true;
    return false;
  };
  const parents = classes
    .filter((c) => c.itemTypeId === current.itemTypeId && !isDescendant(c))
    .map((c) => ({ id: c.id, itemTypeId: c.itemTypeId, path: itemClassPath(byId, c.id) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return (
    <>
      <PageHeader title={`${current.itemType} › ${itemClassPath(byId, id)}`} />
      <Tabs tabs={[{ label: "List", href: "/inventory/item-classes" }, { label: "General", active: true }]} />
      <Card className="max-w-2xl">
        <ItemClassForm
          action={saveItemClass.bind(null, id)}
          itemTypes={types.filter((t) => t.isActive || t.id === current.itemTypeId)}
          parents={parents}
          values={{ ...current, editing: true }}
        />
        <p className="mt-4 text-xs text-muted">
          Last changed by {current.modifiedBy || "—"} on {current.modifiedAt}.
        </p>
      </Card>
    </>
  );
}
