import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { PageHeader, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { deleteItemClasses } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { getItemClasses, getItemTypes } from "@/modules/inventory/queries";
import { ItemClassTree } from "./item-class-tree";

export const metadata: Metadata = { title: "Item Classes" };

export default async function ItemClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; q?: string }>;
}) {
  const user = await requirePermission(P.view);
  const canManage = can(user, P.classesManage);
  const [{ format, q }, classes, types] = await Promise.all([searchParams, getItemClasses(), getItemTypes()]);

  return (
    <>
      <PageHeader
        title="Item Classes"
        actions={
          <LinkButton href="/inventory/item-types" variant="secondary">
            Item types…
          </LinkButton>
        }
      />
      <Tabs tabs={[{ label: "List", active: true }]} />
      <ItemClassTree
        classes={classes}
        itemTypes={types}
        format={format === "hierarchical" ? "hierarchical" : "alphabetical"}
        initialQuery={q ?? ""}
        canManage={canManage}
        onDelete={canManage ? deleteItemClasses : undefined}
      />
    </>
  );
}
