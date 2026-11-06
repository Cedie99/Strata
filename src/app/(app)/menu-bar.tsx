"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavItem } from "@/modules/types";

type Section = { id: string; name: string; nav: NavItem[] };

const isUnder = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** The black top menu: HOME plus one dropdown per module the user can see. */
export function MenuBar({ sections }: { sections: Section[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Close menus after navigating and when clicking elsewhere.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(null);
    setMobileOpen(false);
  }
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const item = "flex h-full items-center border-r border-white/10 px-3 text-[15px] uppercase whitespace-nowrap";
  const activeId = sections.find((s) => s.nav.some((n) => isUnder(pathname, n.href)))?.id;

  return (
    <nav ref={ref} className="relative bg-menubar text-menubar-text">
      <div className="flex h-9 items-stretch">
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
          className="flex w-9 items-center justify-center border-r border-white/10 text-xl hover:bg-white/10 md:cursor-default md:hover:bg-transparent"
        >
          ☰
        </button>
        <div
          className={`${mobileOpen ? "flex" : "hidden"} absolute top-9 left-0 z-40 w-64 flex-col bg-menubar md:static md:flex md:w-auto md:flex-row`}
        >
          <Link
            href="/"
            className={`${item} ${pathname === "/" ? "bg-menubar-active shadow-[inset_0_-3px_0_var(--accent)]" : "hover:bg-white/10"}`}
          >
            Home
          </Link>
          {sections.map((s) => (
            <div
              key={s.id}
              className="relative md:h-full"
              onMouseEnter={() => window.matchMedia("(min-width: 768px)").matches && setOpen(s.id)}
              onMouseLeave={() => window.matchMedia("(min-width: 768px)").matches && setOpen(null)}
            >
              <button
                type="button"
                aria-expanded={open === s.id}
                onClick={() => setOpen((v) => (v === s.id ? null : s.id))}
                className={`${item} h-9 w-full md:h-full ${activeId === s.id ? "bg-menubar-active shadow-[inset_0_-3px_0_var(--accent)]" : open === s.id ? "bg-menubar-active" : "hover:bg-white/10"}`}
              >
                {s.name}
              </button>
              {open === s.id && (
                <div className="z-50 min-w-56 border border-black/40 bg-menubar py-1 shadow-lg md:absolute md:top-full md:left-0">
                  <MenuEntries nav={s.nav} pathname={pathname} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}

type Entry = { kind: "link"; item: NavItem } | { kind: "group"; label: string; items: NavItem[] };

/** Items in menu order; grouped items collapse into one submenu entry where the group first appears. */
function toEntries(nav: NavItem[]): Entry[] {
  const entries: Entry[] = [];
  const groups = new Map<string, NavItem[]>();
  for (const item of nav) {
    if (!item.group) {
      entries.push({ kind: "link", item });
      continue;
    }
    const existing = groups.get(item.group);
    if (existing) existing.push(item);
    else {
      const items = [item];
      groups.set(item.group, items);
      entries.push({ kind: "group", label: item.group, items });
    }
  }
  return entries;
}

const entryClass = "block w-full px-4 py-1.5 text-left text-[13.5px] whitespace-nowrap";

/**
 * A dropdown's contents. Submenus (►) fly out to the right on hover or click; on phones they expand in place.
 */
function MenuEntries({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const desktop = () => window.matchMedia("(min-width: 768px)").matches;

  return toEntries(nav).map((e) =>
    e.kind === "link" ? (
      <Link
        key={e.item.href}
        href={e.item.href}
        onMouseEnter={() => desktop() && setOpenGroup(null)}
        className={`${entryClass} ${isUnder(pathname, e.item.href) ? "bg-row-selected" : "hover:bg-white/10"}`}
      >
        {e.item.label}
      </Link>
    ) : (
      <div key={`group:${e.label}`} className="relative" onMouseEnter={() => desktop() && setOpenGroup(e.label)}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={openGroup === e.label}
          onClick={() => setOpenGroup((g) => (g === e.label ? null : e.label))}
          className={`${entryClass} flex items-center gap-6 ${
            openGroup === e.label
              ? "bg-white/15"
              : e.items.some((i) => isUnder(pathname, i.href))
                ? "bg-row-selected/60 hover:bg-white/10"
                : "hover:bg-white/10"
          }`}
        >
          <span className="flex-1">{e.label}</span>
          <span aria-hidden className="text-[10px] opacity-70">
            ▶
          </span>
        </button>
        {openGroup === e.label && (
          <div
            role="menu"
            className="z-50 min-w-56 border-l-2 border-accent bg-black/30 py-1 md:absolute md:top-0 md:left-full md:-mt-1 md:border md:border-black/40 md:border-b-2 md:border-b-accent md:bg-menubar md:shadow-lg"
          >
            {/* Alphabetical, like the rest of the ERP, so submenus fed by several modules stay predictable. */}
            {[...e.items]
              .sort((x, y) => x.label.localeCompare(y.label))
              .map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  role="menuitem"
                  className={`${entryClass} pl-6 md:pl-4 ${isUnder(pathname, n.href) ? "bg-row-selected" : "hover:bg-white/10"}`}
                >
                  {n.label}
                </Link>
              ))}
          </div>
        )}
      </div>
    ),
  );
}

/** "Name ▾" in the title bar with a sign-out option. */
export function UserMenu({ name, signOut }: { name: string; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 hover:underline">
        <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden>
          <circle cx="8" cy="4.5" r="3.5" />
          <path d="M1 16c0-4 3.1-6.5 7-6.5s7 2.5 7 6.5z" />
        </svg>
        {name} <span className="text-[10px]">▼</span>
      </button>
      {open && (
        <form
          action={signOut}
          className="absolute right-0 z-50 mt-1 min-w-36 border border-border bg-surface py-1 text-text shadow-lg"
        >
          <button className="block w-full px-4 py-1.5 text-left hover:bg-row-hover">Sign out</button>
        </form>
      )}
    </div>
  );
}

/** Title-bar branch picker; lists only show data of the picked branch. */
export function BranchPicker({
  branches,
  currentId,
  pick,
}: {
  branches: { id: string; code: string; name: string }[];
  currentId: string;
  pick: (formData: FormData) => Promise<void>;
}) {
  if (branches.length === 0) return <span className="opacity-90">No branch assigned</span>;
  if (branches.length === 1) return <span>{`${branches[0].code} · ${branches[0].name}`}</span>;
  return (
    <form action={pick}>
      <select
        name="branchId"
        aria-label="Branch"
        defaultValue={currentId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-48 border border-white/40 bg-transparent px-1 py-0.5 text-header-text [&>option]:text-black"
      >
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code} · {b.name}
          </option>
        ))}
      </select>
    </form>
  );
}
