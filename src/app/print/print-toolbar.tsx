"use client";

import { useEffect, useSyncExternalStore } from "react";

const PAPERS = [
  { value: "a4", label: "A4", size: "A4" },
  { value: "letter", label: "Letter (short bond)", size: "8.5in 11in" },
  { value: "legal", label: "Legal (long bond)", size: "8.5in 13in" },
] as const;
type Paper = (typeof PAPERS)[number]["value"];
const KEY = "strata.print.paper";
const isPaper = (v: unknown): v is Paper => PAPERS.some((p) => p.value === v);

// The choice is remembered on this computer; when storage is blocked it lasts until the tab closes.
let fallback: Paper = "a4";
const readPaper = (): Paper => {
  try {
    const saved = localStorage.getItem(KEY);
    return isPaper(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener("paperchange", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("paperchange", onChange);
  };
};
const setPaper = (paper: Paper) => {
  fallback = paper;
  try {
    localStorage.setItem(KEY, paper);
  } catch {
    // Not remembered; the in-memory choice still applies.
  }
  window.dispatchEvent(new Event("paperchange"));
};

/** Paper choice (remembered on this computer), Print / Save as PDF, and a way back. Hidden when printing. */
export function PrintToolbar({ title, autoPrint }: { title: string; autoPrint?: boolean }) {
  const paper = useSyncExternalStore(subscribe, readPaper, () => "a4" as Paper);

  useEffect(() => {
    const p = PAPERS.find((x) => x.value === paper)!;
    document.documentElement.dataset.paper = paper;
    let style = document.getElementById("paper-size") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "paper-size";
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${p.size}; }`;
  }, [paper]);

  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 400); // let the logo and fonts load first
    return () => clearTimeout(t);
  }, [autoPrint]);

  return (
    <div className="print-toolbar" role="toolbar" aria-label="Print">
      <button type="button" onClick={() => (history.length > 1 ? history.back() : window.close())}>
        ← Back
      </button>
      <span className="grow">{title}</span>
      <label>
        <span className="sr-only">Paper size</span>
        <select id="paper" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
          {PAPERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="primary" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
