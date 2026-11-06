import type { Metadata } from "next";
import { Card, PageHeader, listTabs, Tabs } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { saveCustomer } from "@/modules/sales/actions";
import { P } from "@/modules/sales/module";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requirePermission(P.customersManage);
  return (
    <>
      <PageHeader title="New customer" />
      <Tabs tabs={listTabs("/sales/customers", true)} />
      <Card className="max-w-2xl">
        <CustomerForm action={saveCustomer.bind(null, null)} />
      </Card>
    </>
  );
}
