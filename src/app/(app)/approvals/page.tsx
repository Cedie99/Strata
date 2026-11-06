import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, EmptyRow, PageHeader } from "@/components/ui/layout";
import { requireUser } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formatDateTime, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { waitingFor } from "@/modules/approvals/engine";
import { KIND_LABELS } from "@/modules/approvals/module";
import { ApprovalTabs } from "./shared";

export const metadata: Metadata = { title: "Waiting for my approval" };

/** The approver's inbox: requests whose current step this user can decide. */
export default async function ApprovalsInboxPage() {
  const [user, scope, settings] = await Promise.all([requireUser(), getBranchScope(), getSettings()]);
  const waiting = await waitingFor(user, scope.ids);

  return (
    <>
      <PageHeader title="Waiting for my approval" description="Documents held until you approve or reject them. Open one to see what it is and decide." />
      <ApprovalTabs user={user} active="inbox" />
      <DataTable>
        <thead>
          <tr>
            <th>Asked</th>
            <th>Request</th>
            <th>What</th>
            <th>Branch</th>
            <th>Asked by</th>
            <th>Step</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {waiting.length === 0 && <EmptyRow colSpan={7}>Nothing is waiting for you.</EmptyRow>}
          {waiting.map((r) => (
            <tr key={r.id}>
              <td>{formatDateTime(r.requestedAt)}</td>
              <td className="font-mono">
                <Link href={`/approvals/${r.id}`} className="text-primary hover:underline">
                  {r.number}
                </Link>
              </td>
              <td>
                <span className="text-muted">{KIND_LABELS[r.kind] ?? r.kind}:</span> {r.title}
              </td>
              <td>{r.branch.code}</td>
              <td>{r.requestedBy.name}</td>
              <td>
                {r.step} of {r.steps.length}
              </td>
              <td className="text-right tabular-nums">{formatMoney(r.amount, settings["company.currency"])}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
