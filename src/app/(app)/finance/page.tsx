import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BarList, ColumnChart } from "@/components/charts";
import { Card, DataTable, EmptyRow, PageHeader, sectionLabel } from "@/components/ui/layout";
import { can, requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { formatDate, formatMoney, formatPercent, formatQty } from "@/core/format";
import { getSettings } from "@/core/settings";
import { getDashboard, isPeriod, PERIODS } from "@/modules/finance/dashboard";
import { P } from "@/modules/finance/module";
import { P as INV } from "@/modules/inventory/module";
import { P as SALES } from "@/modules/sales/module";

export const metadata: Metadata = { title: "Business dashboard" };

export default async function FinanceDashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requirePermission(P.view);
  const { period: raw } = await searchParams;
  const period = isPeriod(raw) ? raw : "mtd";
  const [scope, settings] = await Promise.all([getBranchScope(), getSettings()]);
  const d = await getDashboard(scope.ids, period);
  const currency = settings["company.currency"];
  const money = (v: number) => formatMoney(v, currency);
  const pct = (v: number | null) => (v === null ? "–" : formatPercent(v));
  const canSales = can(user, SALES.view);
  const link = (href: string, text: string, allowed: boolean) =>
    allowed ? (
      <Link href={href} className="text-primary hover:underline">
        {text}
      </Link>
    ) : null;
  const periodLabel = PERIODS.find((p) => p.key === period)!.label;
  const lastDay = new Date(d.period.to.getTime() - 1);

  return (
    <>
      <PageHeader
        title="Business dashboard"
        description={`${scope.current ? `${scope.current.code} · ${scope.current.name}` : "All your branches"} · ${periodLabel.toLowerCase()}, ${formatDate(d.period.from)} – ${formatDate(lastDay)}. Pick a branch in the title bar.`}
      />

      <nav aria-label="Period" className="mb-4 flex flex-wrap gap-1 px-1">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/finance?period=${p.key}`}
            aria-current={p.key === period ? "page" : undefined}
            className={`border px-3 py-1 ${p.key === period ? "border-primary bg-primary font-semibold text-primary-text" : "border-border bg-surface hover:bg-row-hover"}`}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Tile label="Revenue" value={money(d.revenue.value)} delta={<Delta now={d.revenue.value} before={d.revenue.prev} vs={d.period.prevLabel} />}>
          {d.invoiceCount} invoice{d.invoiceCount === 1 ? "" : "s"}
        </Tile>
        <Tile label="Gross profit" value={money(d.grossProfit.value)} delta={<Delta now={d.grossProfit.value} before={d.grossProfit.prev} vs={d.period.prevLabel} />}>
          Sales minus cost of goods sold
        </Tile>
        <Tile
          label="Gross margin"
          value={pct(d.margin.value)}
          delta={<Delta now={d.margin.value} before={d.margin.prev} vs={d.period.prevLabel} points />}
        >
          Gross profit ÷ revenue
        </Tile>
        <Tile label="Receivables" value={money(d.receivables.total)} alert={d.receivables.overdue > 0}>
          {d.receivables.overdue > 0 ? <span className="font-semibold text-danger">⚠ {money(d.receivables.overdue)} overdue</span> : "Nothing overdue"}
          {d.receivables.dso !== null && <span className="block">{d.receivables.dso} days of sales outstanding</span>}
        </Tile>
        <Tile
          label="Cash balance"
          value={money(d.cash.balance)}
          alert={d.cash.balance < 0}
          delta={
            <span className={d.cash.inflow - d.cash.outflow < 0 ? "text-danger" : "text-ok"}>
              Net {d.cash.inflow - d.cash.outflow < 0 ? "▼" : "▲"} {money(d.cash.inflow - d.cash.outflow)} this period
            </span>
          }
        >
          Collected {money(d.cash.collections)} from customers
        </Tile>
        <Tile label="Inventory at cost" value={money(d.inventory.value)} alert={d.inventory.low + d.inventory.out > 0}>
          {d.inventory.low + d.inventory.out > 0 ? (
            <span className="font-semibold text-danger">
              ⚠ {d.inventory.low} low, {d.inventory.out} out of stock
            </span>
          ) : (
            "All products above reorder level"
          )}
          {d.inventory.daysOnHand !== null && <span className="block">≈ {d.inventory.daysOnHand} days of stock at recent sales</span>}
        </Tile>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Sales performance · last 12 months">
          <ColumnChart
            currency={currency}
            series={[
              { key: "revenue", label: "Revenue", color: "series-1" },
              { key: "grossProfit", label: "Gross profit", color: "series-2" },
            ]}
            points={d.months.map((m) => ({
              label: m.label,
              sublabel: m.label === "Jan" || m === d.months[0] ? String(m.year) : undefined,
              values: { revenue: m.revenue, grossProfit: m.grossProfit },
              extra: [{ label: "Gross margin", value: pct(m.margin) }],
            }))}
          />
        </Card>
        <Card title="Cash flow · last 12 months">
          <ColumnChart
            currency={currency}
            series={[
              { key: "cashIn", label: "Cash in", color: "series-1" },
              { key: "cashOut", label: "Cash out", color: "series-2" },
            ]}
            points={d.months.map((m) => ({
              label: m.label,
              sublabel: m.label === "Jan" || m === d.months[0] ? String(m.year) : undefined,
              values: { cashIn: m.cashIn, cashOut: m.cashOut },
              extra: [{ label: "Net", value: money(m.net) }],
            }))}
          />
          <p className="mt-2 text-xs text-muted">
            Cash in = customer payments + other cash received. {link("/finance/cash", "Open the cash book", true)}
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Receivables by age">
          <BarList
            currency={currency}
            items={d.receivables.aging.map((a) => ({
              label: a.label,
              value: a.amount,
              note: `${a.count} invoice${a.count === 1 ? "" : "s"}`,
              danger: a.key !== "current",
            }))}
          />
          <h3 className={`mt-5 mb-2 ${sectionLabel}`}>Who owes the most</h3>
          {d.receivables.topDebtors.length === 0 ? (
            <p className="text-muted">No open invoices.</p>
          ) : (
            <ul className="space-y-1.5">
              {d.receivables.topDebtors.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>
                    {canSales ? (
                      <Link href={`/sales/customers/${c.id}`} className="text-primary hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      c.name
                    )}
                    {c.overdue > 0 && <span className="block text-xs text-danger">{money(c.overdue)} overdue, oldest {c.oldest} days</span>}
                  </span>
                  <span className="tabular-nums">{money(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs">{link("/sales/receivables", "All open invoices", canSales)}</p>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <section>
            <h2 className={`mb-2 px-1 ${sectionLabel}`}>Top products · {periodLabel.toLowerCase()}</h2>
            <DataTable>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="text-right">Qty sold</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Gross profit</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {d.topProducts.length === 0 && <EmptyRow colSpan={5}>No sales in this period.</EmptyRow>}
                {d.topProducts.map((p) => (
                  <tr key={p.id}>
                    <td>{link(`/inventory/products/${p.id}`, `${p.sku} · ${p.name}`, can(user, INV.view)) ?? `${p.sku} · ${p.name}`}</td>
                    <td className="text-right tabular-nums">
                      {formatQty(p.qty)} {p.unit}
                    </td>
                    <td className="text-right tabular-nums">{money(p.revenue)}</td>
                    <td className={`text-right tabular-nums ${p.grossProfit < 0 ? "text-danger" : ""}`}>{money(p.grossProfit)}</td>
                    <td className={`text-right tabular-nums ${(p.margin ?? 0) < 0 ? "text-danger" : ""}`}>{pct(p.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </section>
          <section>
            <h2 className={`mb-2 px-1 ${sectionLabel}`}>Top customers · {periodLabel.toLowerCase()}</h2>
            <DataTable>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="text-right">Invoices</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Gross profit</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {d.topCustomers.length === 0 && <EmptyRow colSpan={5}>No sales in this period.</EmptyRow>}
                {d.topCustomers.map((c) => (
                  <tr key={c.id}>
                    <td>{link(`/sales/customers/${c.id}`, c.name, canSales) ?? c.name}</td>
                    <td className="text-right tabular-nums">{c.count}</td>
                    <td className="text-right tabular-nums">{money(c.revenue)}</td>
                    <td className="text-right tabular-nums">{money(c.grossProfit)}</td>
                    <td className="text-right tabular-nums">{pct(c.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {d.byBranch.length > 1 && (
          <Card title={`Sales by branch · ${periodLabel.toLowerCase()}`}>
            <BarList
              currency={currency}
              items={d.byBranch.map((b) => ({ label: b.code, value: b.revenue, note: `margin ${pct(b.margin)}` }))}
            />
          </Card>
        )}
        <Card title={`Where cash went · ${periodLabel.toLowerCase()}`}>
          {d.cash.outByCategory.length === 0 ? (
            <p className="text-muted">No cash out recorded in this period.</p>
          ) : (
            <BarList currency={currency} items={d.cash.outByCategory.map((c) => ({ label: c.category, value: c.amount }))} />
          )}
        </Card>
      </div>
    </>
  );
}

function Tile({ label, value, delta, alert, children }: { label: string; value: string; delta?: ReactNode; alert?: boolean; children?: ReactNode }) {
  return (
    <div className={`border bg-surface p-4 ${alert ? "border-danger/50" : "border-border"}`}>
      <p className={sectionLabel}>{label}</p>
      <p className="mt-1 text-[24px] leading-tight font-semibold">{value}</p>
      {delta && <p className="mt-1 text-xs font-semibold">{delta}</p>}
      {children && <p className="mt-1 text-xs text-muted">{children}</p>}
    </div>
  );
}

/** Change against the comparison period: % for amounts, percentage points for ratios. Up is good here. */
function Delta({ now, before, vs, points }: { now: number | null; before: number | null; vs: string; points?: boolean }) {
  if (now === null || before === null) return <span className="text-muted">No figures for {vs}</span>;
  const change = points ? (now - before) * 100 : before === 0 ? null : (now - before) / Math.abs(before);
  if (change === null) return <span className="text-muted">Nothing in {vs}</span>;
  const text = points ? `${Math.abs(change).toFixed(1)} pts` : formatPercent(Math.abs(change));
  if (Math.abs(change) < 0.0005) return <span className="text-muted">No change vs {vs}</span>;
  return (
    <span className={change > 0 ? "text-ok" : "text-danger"}>
      {change > 0 ? "▲" : "▼"} {text} vs {vs}
    </span>
  );
}
