import Link from "next/link";
import { formatMoney, toDateInput } from "@/core/format";
import type { AccountBalance } from "@/modules/accounting/reports";

export type StatementLine =
  | { kind: "heading"; label: string }
  | { kind: "accounts"; rows: AccountBalance[] }
  | { kind: "line"; label: string; amount: number }
  | { kind: "total"; label: string; amount: number; strong?: boolean };

/** A financial statement: headings, account lines (linked to their ledger) and subtotals. */
export function Statement({ lines, currency, from, to }: { lines: StatementLine[]; currency: string; from: Date; to: Date }) {
  const money = (v: number) => formatMoney(v, currency);
  const ledger = (id: string) => `/accounting/ledger?f_account=${id}&f_from=${toDateInput(from)}&f_to=${toDateInput(to)}`;
  return (
    <div className="max-w-3xl border border-border bg-surface">
      <table className="w-full [&_td]:px-4 [&_td]:py-1">
        <tbody>
          {lines.map((l, i) => {
            if (l.kind === "heading")
              return (
                <tr key={i}>
                  <td colSpan={2} className="pt-4! text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
                    {l.label}
                  </td>
                </tr>
              );
            if (l.kind === "accounts")
              return l.rows.length === 0 ? (
                <tr key={i}>
                  <td colSpan={2} className="pl-8! text-muted">
                    None
                  </td>
                </tr>
              ) : (
                l.rows.map((r) => (
                  <tr key={r.account.id} className="hover:bg-row-hover">
                    <td className="pl-8!">
                      <span className="mr-2 font-mono text-xs text-muted">{r.account.code}</span>
                      <Link href={ledger(r.account.id)} className="text-primary hover:underline">
                        {r.account.name}
                      </Link>
                    </td>
                    <td className="text-right tabular-nums">{money(r.balance)}</td>
                  </tr>
                ))
              );
            if (l.kind === "line")
              return (
                <tr key={i}>
                  <td className="pl-8!">{l.label}</td>
                  <td className="text-right tabular-nums">{money(l.amount)}</td>
                </tr>
              );
            return (
              <tr key={i} className={`border-t border-border ${l.strong ? "border-t-2 bg-row-alt text-[14px] font-bold" : "font-semibold"}`}>
                <td>{l.label}</td>
                <td className={`text-right tabular-nums ${l.amount < 0 ? "text-danger" : ""}`}>{money(l.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
