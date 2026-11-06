"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLUMN_OPS,
  NO_VALUE_OPS,
  type ColumnCondition,
  type ColumnFilter,
  type ColumnOp,
  type ColumnType,
} from "@/core/grid";

const fieldClass =
  "block w-full rounded-sm border border-border bg-surface px-2 py-1 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";

const opLabel = (type: ColumnType, op: ColumnOp) => COLUMN_OPS[type].find((o) => o.op === op)?.label ?? op;

/** "Is greater than 100 and is less than 200" */
export function describeColumnFilter(type: ColumnType, f: ColumnFilter) {
  const one = (c: ColumnCondition) =>
    `${opLabel(type, c.op).toLowerCase()}${NO_VALUE_OPS.has(c.op) ? "" : ` ${type === "text" ? `“${c.value}”` : c.value}`}`;
  return f.b ? `${one(f.a)} ${f.join} ${one(f.b)}` : one(f.a);
}

function ConditionFields({
  type,
  value,
  onChange,
  autoFocus,
}: {
  type: ColumnType;
  value: ColumnCondition;
  onChange: (c: ColumnCondition) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1">
      <select
        aria-label="Condition"
        value={value.op}
        onChange={(e) => onChange({ ...value, op: e.target.value as ColumnOp })}
        className={fieldClass}
      >
        {COLUMN_OPS[type].map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {!NO_VALUE_OPS.has(value.op) && (
        <input
          aria-label="Value"
          autoFocus={autoFocus}
          type={type === "date" ? "date" : type === "number" ? "number" : "text"}
          step="any"
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          className={fieldClass}
        />
      )}
    </div>
  );
}

/**
 * The funnel button in a column header and its menu: "Show items with value that:" two conditions
 * joined by And/Or, then Filter or Clear. The menu floats above the page (position: fixed) so the
 * grid's scroll box never clips it.
 */
export function ColumnFilterMenu({
  label,
  type,
  current,
  onApply,
}: {
  label: string;
  type: ColumnType;
  current?: ColumnFilter;
  onApply: (filter: ColumnFilter | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLFormElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const blank: ColumnCondition = { op: COLUMN_OPS[type][0].op, value: "" };
  const [a, setA] = useState<ColumnCondition>(current?.a ?? blank);
  const [b, setB] = useState<ColumnCondition>(current?.b ?? blank);
  const [join, setJoin] = useState<"and" | "or">(current?.join ?? "and");
  const active = !!current;

  const open = () => {
    const r = buttonRef.current!.getBoundingClientRect();
    const width = 240;
    setA(current?.a ?? blank);
    setB(current?.b ?? blank);
    setJoin(current?.join ?? "and");
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) });
  };

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (
        e instanceof MouseEvent &&
        (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node))
      )
        return;
      setPos(null);
    };
    const closeOnScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [pos]);

  const usable = (c: ColumnCondition) => NO_VALUE_OPS.has(c.op) || c.value.trim() !== "";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Filter ${label}`}
        aria-expanded={!!pos}
        title={active ? `Filtered: ${describeColumnFilter(type, current!)}` : `Filter ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) setPos(null);
          else open();
        }}
        className={`ml-auto shrink-0 rounded-sm p-0.5 ${
          active ? "bg-primary text-primary-text" : "text-muted/70 hover:bg-row-hover hover:text-text"
        }`}
      >
        <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden>
          <rect x="1" y="3" width="14" height="1.8" rx="0.9" />
          <rect x="3.5" y="7.1" width="9" height="1.8" rx="0.9" />
          <rect x="6" y="11.2" width="4" height="1.8" rx="0.9" />
        </svg>
      </button>
      {pos && (
        <form
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!usable(a)) return;
            onApply({ a, b: usable(b) ? b : undefined, join });
            setPos(null);
          }}
          className="fixed z-50 w-60 space-y-2 border border-border bg-surface p-3 text-[13px] font-normal tracking-normal whitespace-normal text-text normal-case shadow-xl"
        >
          <p className="font-semibold">Show items with value that:</p>
          <ConditionFields type={type} value={a} onChange={setA} autoFocus />
          <select
            aria-label="Join conditions"
            value={join}
            onChange={(e) => setJoin(e.target.value as "and" | "or")}
            className={`${fieldClass} w-20!`}
          >
            <option value="and">And</option>
            <option value="or">Or</option>
          </select>
          <ConditionFields type={type} value={b} onChange={setB} />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="submit"
              disabled={!usable(a)}
              className="rounded-sm border border-primary bg-primary py-1 font-semibold text-primary-text hover:opacity-90 disabled:opacity-50"
            >
              Filter
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(null);
                setPos(null);
              }}
              className="rounded-sm border border-border py-1 font-semibold hover:bg-row-hover"
            >
              Clear
            </button>
          </div>
        </form>
      )}
    </>
  );
}
