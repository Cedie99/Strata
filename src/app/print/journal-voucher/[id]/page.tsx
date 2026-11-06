import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintDocument } from "@/components/print/document";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDate, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { P } from "@/modules/accounting/module";
import { SOURCE_LABELS } from "@/modules/accounting/reports";
import { JournalLines } from "../../journal-lines";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await db.journalEntry.findUnique({ where: { id: (await params).id }, select: { number: true } });
  return { title: { absolute: e?.number ?? "Journal voucher" } };
}

export default async function PrintJournalVoucher({ params }: Props) {
  const user = await requirePermission(P.view);
  const { id } = await params;
  const [entry, scope, settings] = await Promise.all([
    db.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: true, branch: true } }, createdBy: { select: { name: true } }, reversalOf: { select: { number: true } }, reversedBy: { select: { number: true } } },
    }),
    getBranchScope(),
    getSettings(),
  ]);
  if (!entry || !entry.lines.some((l) => scope.mayUse(l.branchId))) notFound();
  const money = (v: Prisma.Decimal) => formatMoney(v, settings["company.currency"]);
  const branches = [...new Set(entry.lines.map((l) => l.branch.code))].join(", ");

  return (
    <PrintDocument
      title="Journal voucher"
      number={entry.number}
      status={entry.reversedBy ? `Reversed by ${entry.reversedBy.number}` : undefined}
      party={{ label: "Particulars", name: entry.memo || SOURCE_LABELS[entry.sourceType] || entry.sourceType, lines: [entry.reversalOf ? `Reverses ${entry.reversalOf.number}` : ""] }}
      facts={[
        { label: "Date", value: formatDate(entry.date) },
        { label: "Source", value: SOURCE_LABELS[entry.sourceType] ?? entry.sourceType },
        { label: "Document", value: entry.sourceNumber || "—" },
        { label: "Branch", value: branches },
      ]}
      signatures={[{ role: "Prepared by", name: entry.createdBy?.name }, { role: "Checked by" }, { role: "Approved by" }]}
      printedBy={user.name}
    >
      <JournalLines lines={entry.lines} money={money} label="Entries" />
    </PrintDocument>
  );
}
