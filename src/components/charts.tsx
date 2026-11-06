"use client";

import { useState } from "react";

// Small dependency-free charts for the dashboard. Colours come from the --series-* tokens in globals.css
// (validated for colour-blind separation in light and dark). Every chart has a legend or direct labels,
// a hover tooltip and a "Show as table" view, so nothing depends on colour alone.

export type Series = { key: string; label: string; color: "series-1" | "series-2" };
// Literal class names, so Tailwind sees them.
const FILL = { "series-1": "fill-series-1", "series-2": "fill-series-2" } as const;
const SWATCH = { "series-1": "bg-series-1", "series-2": "bg-series-2" } as const;

export type Point = { label: string; sublabel?: string; values: Record<string, number>; extra?: { label: string; value: string }[] };

const fmt = (currency: string, compact = false) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
  });

/** Round tick values covering [min, max], always including 0. */
function ticks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** A bar with a 4px rounded data end and a square end at the baseline (works for negative bars too). */
function barPath(x: number, w: number, yBase: number, yEnd: number) {
  const up = yEnd < yBase;
  const h = Math.abs(yBase - yEnd);
  const r = Math.min(4, w / 2, h);
  if (h < 0.5) return "";
  return up
    ? `M${x},${yBase} V${yEnd + r} Q${x},${yEnd} ${x + r},${yEnd} H${x + w - r} Q${x + w},${yEnd} ${x + w},${yEnd + r} V${yBase} Z`
    : `M${x},${yBase} V${yEnd - r} Q${x},${yEnd} ${x + r},${yEnd} H${x + w - r} Q${x + w},${yEnd} ${x + w},${yEnd - r} V${yBase} Z`;
}

/** Side-by-side columns per point (e.g. revenue and gross profit per month), one shared y axis. */
export function ColumnChart({ points, series, currency, height = 220 }: { points: Point[]; series: Series[]; currency: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { top: 10, right: 6, bottom: 34, left: 58 };
  const all = points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0));
  const t = ticks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = t[0];
  const hi = t[t.length - 1];
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo || 1)) * (H - pad.top - pad.bottom);
  const band = (W - pad.left - pad.right) / points.length;
  const barW = Math.min(16, (band - 10) / series.length - 2);
  const groupW = series.length * barW + (series.length - 1) * 2;
  const short = fmt(currency, true);
  const full = fmt(currency);
  const empty = all.every((v) => v === 0);

  return (
    <div>
      <Legend series={series} />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${series.map((s) => s.label).join(" and ")} by month`}>
          {t.map((v) => (
            <g key={v}>
              <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-chart-axis" : "stroke-chart-grid"} strokeWidth={1} />
              <text x={pad.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">
                {short.format(v)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x0 = pad.left + i * band + (band - groupW) / 2;
            return (
              <g key={p.label + i}>
                {hover === i && <rect x={pad.left + i * band} y={pad.top} width={band} height={H - pad.top - pad.bottom} className="fill-row-hover" />}
                {series.map((s, k) => (
                  <path key={s.key} d={barPath(x0 + k * (barW + 2), barW, y(0), y(p.values[s.key] ?? 0))} className={FILL[s.color]} />
                ))}
                <text x={pad.left + i * band + band / 2} y={H - pad.bottom + 14} textAnchor="middle" className="fill-muted text-[10px]">
                  {p.label}
                </text>
                {p.sublabel && (
                  <text x={pad.left + i * band + band / 2} y={H - pad.bottom + 26} textAnchor="middle" className="fill-muted text-[9px]">
                    {p.sublabel}
                  </text>
                )}
                {/* Hit area: the whole band, bigger than the bars. */}
                <rect
                  x={pad.left + i * band}
                  y={0}
                  width={band}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${p.label}: ${series.map((s) => `${s.label} ${full.format(p.values[s.key] ?? 0)}`).join(", ")}`}
                />
              </g>
            );
          })}
        </svg>
        {empty && <p className="absolute inset-0 flex items-center justify-center text-muted">Nothing recorded in these months yet.</p>}
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-44 border border-border bg-surface px-3 py-2 shadow-md"
            style={(pad.left + (hover + 0.5) * band) / W > 0.6 ? { right: `${100 - ((pad.left + hover * band) / W) * 100}%` } : { left: `${((pad.left + (hover + 1) * band) / W) * 100}%` }}
          >
            <p className="mb-1 font-semibold">
              {points[hover].label} {points[hover].sublabel}
            </p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className={`inline-block size-2.5 rounded-[2px] ${SWATCH[s.color]}`} />
                  {s.label}
                </span>
                <span className="tabular-nums">{full.format(points[hover].values[s.key] ?? 0)}</span>
              </p>
            ))}
            {points[hover].extra?.map((e) => (
              <p key={e.label} className="flex justify-between gap-4 border-t border-border/60 pt-0.5 text-muted">
                <span>{e.label}</span>
                <span className="text-text tabular-nums">{e.value}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <TableView
        head={["Month", ...series.map((s) => s.label), ...(points[0]?.extra?.map((e) => e.label) ?? [])]}
        rows={points.map((p) => [`${p.label} ${p.sublabel ?? ""}`, ...series.map((s) => full.format(p.values[s.key] ?? 0)), ...(p.extra?.map((e) => e.value) ?? [])])}
      />
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className={`inline-block size-2.5 rounded-[2px] ${SWATCH[s.color]}`} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars with the value written beside each, e.g. receivables by age. */
export function BarList({ items, currency }: { items: { label: string; value: number; note?: string; danger?: boolean }[]; currency: string }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  const full = fmt(currency);
  return (
    <div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3" title={`${i.label}: ${full.format(i.value)}${i.note ? ` (${i.note})` : ""}`}>
            <span className={i.danger && i.value > 0 ? "font-semibold text-danger" : "text-muted"}>{i.label}</span>
            <span className="h-3.5">
              {i.value > 0 && max > 0 && (
                <span className="block h-full rounded-r-[4px] bg-series-1" style={{ width: `${Math.max(1, (i.value / max) * 100)}%` }} />
              )}
            </span>
            <span className="text-right tabular-nums">
              {full.format(i.value)}
              {i.note && <span className="block text-[11px] text-muted">{i.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableView({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted select-none hover:text-text">Show as table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold [&_tr]:border-b [&_tr]:border-border/50">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} className={i ? "text-right" : ""}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((c, i) => (
                  <td key={i} className={i ? "text-right tabular-nums" : ""}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
