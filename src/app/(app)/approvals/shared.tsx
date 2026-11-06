import { Tabs } from "@/components/ui/layout";
import type { CurrentUser } from "@/core/auth/guard";
import { can } from "@/core/auth/guard";
import { P, STATUS_LABELS } from "@/modules/approvals/module";

/** Waiting for me | Requests | Approval rules. */
export function ApprovalTabs({ user, active }: { user: CurrentUser; active: "inbox" | "requests" | "rules" }) {
  return (
    <Tabs
      tabs={[
        { label: "Waiting for me", href: "/approvals", active: active === "inbox" },
        { label: "Requests", href: "/approvals/requests", active: active === "requests" },
        ...(can(user, P.rulesManage) ? [{ label: "Approval rules", href: "/approvals/rules", active: active === "rules" }] : []),
      ]}
    />
  );
}

const TONES: Record<string, string> = {
  PENDING: "border-accent bg-accent/15 text-text",
  APPROVED: "border-ok/50 bg-ok/10 text-ok",
  REJECTED: "border-danger/50 bg-danger/10 text-danger",
  CANCELLED: "border-border bg-surface text-muted",
};

export function StatusTag({ status }: { status: string }) {
  return <span className={`inline-block border px-2 py-0.5 text-xs font-semibold ${TONES[status] ?? ""}`}>{STATUS_LABELS[status] ?? status}</span>;
}
