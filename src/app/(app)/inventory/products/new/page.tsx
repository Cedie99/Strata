import type { Metadata } from "next";
import { Card, PageHeader, recordTabs, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveProduct } from "@/modules/inventory/actions";
import { P } from "@/modules/inventory/module";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requirePermission(P.productsManage);
  return (
    <>
      <PageHeader title="New product" />
      <Tabs tabs={recordTabs("/inventory/products", null, "general")} />
      <Card className="max-w-2xl">
        <ProductForm action={saveProduct.bind(null, null)} />
      </Card>
    </>
  );
}
