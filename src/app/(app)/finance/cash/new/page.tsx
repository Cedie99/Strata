import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { toDateInput } from "@/core/format";
import { CASH_CATEGORIES, P } from "@/modules/finance/module";
import { CashForm } from "./cash-form";

export const metadata: Metadata = { title: "Record cash" };

export default async function NewCashEntryPage() {
  await requirePermission(P.cashPost);
  const scope = await getBranchScope();
  const branches = scope.current ? [scope.current] : scope.allowed;

  return (
    <>
      <PageHeader title="Record cash in or out" />
      <Card className="max-w-2xl">
        <CashForm
          branches={branches.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))}
          categories={CASH_CATEGORIES}
          today={toDateInput(new Date())}
        />
      </Card>
    </>
  );
}
