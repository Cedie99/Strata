import type { Metadata } from "next";
import { Card, PageHeader, listTabs, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveSupplier } from "@/modules/purchasing/actions";
import { P } from "@/modules/purchasing/module";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  await requirePermission(P.suppliersManage);
  return (
    <>
      <PageHeader title="New supplier" />
      <Tabs tabs={listTabs("/purchasing/suppliers", true)} />
      <Card className="max-w-2xl">
        <SupplierForm action={saveSupplier.bind(null, null)} />
      </Card>
    </>
  );
}
