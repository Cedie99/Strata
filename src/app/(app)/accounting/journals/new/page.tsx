import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { toDateInput } from "@/core/format";
import { getSettings } from "@/core/settings";
import { CONTROL_ACCOUNTS, P } from "@/modules/accounting/module";
import { JournalForm } from "./journal-form";

export const metadata: Metadata = { title: "New journal entry" };

export default async function NewJournalPage() {
  await requirePermission(P.journalPost);
  const scope = await getBranchScope();
  const [accounts, settings] = await Promise.all([
    db.account.findMany({ where: { isActive: true, OR: [{ systemKey: null }, { systemKey: { notIn: CONTROL_ACCOUNTS } }] }, orderBy: { code: "asc" } }),
    getSettings(),
  ]);
  const branches = scope.current ? [scope.current] : scope.allowed;

  return (
    <>
      <PageHeader title="New journal entry" description="For accruals, corrections, depreciation, opening balances and other entries no document makes." />
      <Card className="max-w-5xl">
        <JournalForm
          today={toDateInput(new Date())}
          currency={settings["company.currency"]}
          accounts={accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
          branches={branches.map((b) => ({ value: b.id, label: b.code }))}
        />
      </Card>
    </>
  );
}
