import type { Metadata } from "next";
import { PageHeader, Tabs } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { deleteItemType, moveItemType, saveItemType } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { getItemTypes } from "@/modules/inventory/queries";
import { ItemTypesEditor } from "./item-types-editor";

export const metadata: Metadata = { title: "Item Types" };

export default async function ItemTypesPage() {
  const user = await requirePermission(P.view);
  const canManage = can(user, P.classesManage);
  return (
    <>
      <PageHeader
        title="Item Types"
        description="The top level of Item Classes, and the choices of every Item Type lookup. The order here is the order everywhere."
      />
      <Tabs tabs={[{ label: "List", active: true }]} />
      <ItemTypesEditor
        types={await getItemTypes()}
        canManage={canManage}
        save={saveItemType}
        move={moveItemType}
        remove={deleteItemType}
      />
    </>
  );
}
