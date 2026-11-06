import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, EmptyRow, PageHeader } from "@/components/ui/layout";
import { can, requireUser } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formatDateTime, formatMoney } from "@/core/format";
import { getSettings } from "@/core/settings";
import { KIND_LABELS, P, STATUS_LABELS } from "@/modules/approvals/module";
import { ApprovalTabs, StatusTag } from "../shared";

export const metadata: Metadata = { title: "Approval requests" };

/** Every request this user asked for, or (with "See every approval request") everyone's, newest first. */
export default async function ApprovalRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [user, scope, settings, sp] = await Promise.all([requireUser(), getBranchScope(), getSettings(), searchParams]);
  const seeAll = can(user, P.view) && sp.who !== "me";
  const status = sp.status && STATUS_LABELS[sp.status] ? sp.status : undefined;
  const where: Prisma.ApprovalRequestWhereInput = {
    ...(seeAll ? { branchId: { in: scope.ids } } : { requestedById: user.id }),
    ...(status && { status }),
  };
  const requests = await db.approvalRequest.findMany({
    where,
    include: { requestedBy: { select: { name: true } }, branch: true, steps: { select: { level: true, status: true } } },
    orderBy: { requestedAt: "desc" },
    take: 300,
  });
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ who: sp.who, status, ...patch }).filter((e): e is [string, string] => !!e[1]));
    return `/approvals/requests${q.size ? `?${q}` : ""}`;
  };
  const chip = (active: boolean) => `border px-2.5 py-0.5 ${active ? "border-primary bg-primary text-primary-text" : "border-border bg-surface hover:bg-row-hover"}`;

  return (
    <>
      <PageHeader
        title="Approval requests"
        description={seeAll ? "Every request in your branches, newest first." : "The requests you asked for, newest first."}
      />
      <ApprovalTabs user={user} active="requests" />
      <div className="mb-3 flex flex-wrap items-center gap-2 px-1 text-sm">
        {can(user, P.view) && (
          <>
            <Link href={link({ who: undefined })} className={chip(seeAll)}>
              Everyone
            </Link>
            <Link href={link({ who: "me" })} className={chip(!seeAll)}>
              Mine
            </Link>
            <span className="mx-1 text-muted">·</span>
          </>
        )}
        <Link href={link({ status: undefined })} className={chip(!status)}>
          All
        </Link>
        {Object.entries(STATUS_LABELS).map(([k, label]) => (
          <Link key={k} href={link({ status: k })} className={chip(status === k)}>
            {label}
          </Link>
        ))}
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>Asked</th>
            <th>Request</th>
            <th>What</th>
            <th>Branch</th>
            <th>Asked by</th>
            <th>Status</th>
            <th>Result</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {requests.length === 0 && <EmptyRow colSpan={8}>No requests.</EmptyRow>}
          {requests.map((r) => (
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
                <StatusTag status={r.status} />
                {r.status === "PENDING" && (
                  <span className="ml-1 text-xs text-muted">
                    step {r.step} of {r.steps.length}
                  </span>
                )}
              </td>
              <td className="font-mono">
                {r.resultHref ? (
                  <Link href={r.resultHref} className="text-primary hover:underline">
                    {r.resultNumber}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="text-right tabular-nums">{formatMoney(r.amount, settings["company.currency"])}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
