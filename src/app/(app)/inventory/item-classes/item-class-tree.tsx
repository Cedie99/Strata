"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyRow, tableClass } from "@/components/ui/layout";
import type { ActionState } from "@/core/forms";
import type { ItemClassRow } from "@/modules/inventory/queries";

type Format = "alphabetical" | "hierarchical";

const toggleClass = "inline-flex size-5 items-center justify-center text-[10px] text-muted hover:text-text";
const byDescription = (a: ItemClassRow, b: ItemClassRow) => a.description.localeCompare(b.description);

/**
 * Item Classes as a tree: item type ► class ► subclass ► …, each level a small grid of its own.
 * "Alphabetical" nests the levels (A–Z within each); "Hierarchical" lists every class once with its full path.
 * Tick classes to edit, add a subclass to, or delete them; double-click a class to open it.
 */
export function ItemClassTree({
  classes,
  itemTypes,
  format,
  initialQuery,
  canManage,
  onDelete,
}: {
  classes: ItemClassRow[];
  /** In their set order; retired types show only while they still have classes. */
  itemTypes: { id: string; name: string; isActive: boolean }[];
  format: Format;
  initialQuery: string;
  canManage: boolean;
  onDelete?: (ids: string[]) => Promise<ActionState>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const typeOrder = (id: string) => itemTypes.findIndex((t) => t.id === id);
  const childrenOf = useMemo(() => {
    const map = new Map<string, ItemClassRow[]>();
    for (const c of classes) {
      const key = c.parentId ?? `type:${c.itemTypeId}`;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    for (const list of map.values()) list.sort(byDescription);
    return map;
  }, [classes]);
  const pathOf = (c: ItemClassRow) => {
    const parts: string[] = [];
    for (let at: ItemClassRow | undefined = c; at; at = at.parentId ? byId.get(at.parentId) : undefined)
      parts.unshift(at.description);
    return parts.join(" › ");
  };

  // While searching, show the matching classes with the branches that lead to them, all opened.
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!needle) return null;
    const keep = new Set<string>();
    for (const c of classes) {
      if (!c.description.toLowerCase().includes(needle)) continue;
      keep.add(`type:${c.itemTypeId}`);
      for (let at: ItemClassRow | undefined = c; at; at = at.parentId ? byId.get(at.parentId) : undefined) keep.add(at.id);
    }
    return keep;
  }, [needle, classes, byId]);
  const isOpen = (key: string) => (shown ? shown.has(key) : expanded.has(key));
  const isShown = (key: string) => !shown || shown.has(key);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const picked = classes.filter((c) => selected.has(c.id));
  const one = picked.length === 1 ? picked[0] : null;
  const open = (c: ItemClassRow) => canManage && router.push(`/inventory/item-classes/${c.id}`);

  const remove = () => {
    if (!onDelete) return;
    startTransition(async () => {
      const result = await onDelete(picked.map((c) => c.id));
      if (result?.error) setError(result.error);
      else {
        setSelected(new Set());
        setConfirming(false);
        router.refresh();
      }
    });
  };

  const setFormat = (f: Format) => {
    const params = new URLSearchParams();
    if (f === "hierarchical") params.set("format", f);
    if (query) params.set("q", query);
    router.replace(params.size ? `${pathname}?${params}` : pathname);
  };

  const checkbox = (c: ItemClassRow) => (
    <input
      type="checkbox"
      className="size-4 accent-primary"
      aria-label={`Select ${c.description}`}
      checked={selected.has(c.id)}
      onChange={() => setSelected((s) => toggle(s, c.id))}
      onClick={(e) => e.stopPropagation()}
    />
  );
  const rowProps = (c: ItemClassRow) => ({
    onClick: () => setSelected((s) => toggle(s, c.id)),
    onDoubleClick: () => open(c),
    className: `cursor-default ${selected.has(c.id) ? "bg-row-selected! text-white" : "hover:bg-row-hover"}`,
  });

  /** One level of classes: its own header row, then each class with its subclasses opened beneath it. */
  const level = (parentKey: string) => {
    const rows = (childrenOf.get(parentKey) ?? []).filter((c) => isShown(c.id));
    return (
      <table className={`${tableClass} w-auto min-w-[44rem] border border-border/70 bg-surface`}>
        <thead>
          <tr>
            <th className="w-12" />
            <th className="min-w-72">Description</th>
            <th className="min-w-44">Modified By</th>
            <th className="min-w-40">Date Modified</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={4}>No classes yet.</EmptyRow>}
          {rows.map((c) => {
            const kids = childrenOf.get(c.id)?.length ?? 0;
            return (
              <Fragment key={c.id}>
                <tr {...rowProps(c)}>
                  <td className="space-x-1">
                    {kids > 0 ? (
                      <button
                        type="button"
                        className={toggleClass}
                        aria-expanded={isOpen(c.id)}
                        aria-label={`${isOpen(c.id) ? "Collapse" : "Expand"} ${c.description}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded((s) => toggle(s, c.id));
                        }}
                      >
                        {isOpen(c.id) ? "▼" : "▶"}
                      </button>
                    ) : (
                      <span className="inline-block size-5" />
                    )}
                    {checkbox(c)}
                  </td>
                  <td className="font-medium">
                    {c.description}
                    {kids > 0 && <span className="ml-1.5 text-[11px] opacity-60">({kids})</span>}
                  </td>
                  <td>{c.modifiedBy || "—"}</td>
                  <td>{c.modifiedAt}</td>
                </tr>
                {kids > 0 && isOpen(c.id) && (
                  <tr className="bg-transparent!">
                    <td colSpan={4} className="py-1! pl-8!">
                      {level(c.id)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  const allKeys = () => new Set([...itemTypes.map((t) => `type:${t.id}`), ...classes.map((c) => c.id)]);
  const flat = useMemo(
    () =>
      classes
        .filter((c) => !needle || c.description.toLowerCase().includes(needle))
        .map((c) => ({ ...c, path: pathOf(c) }))
        .sort((a, b) => typeOrder(a.itemTypeId) - typeOrder(b.itemTypeId) || a.path.localeCompare(b.path)),
    // pathOf only reads byId, which changes with classes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classes, needle, byId],
  );

  return (
    <div className="space-y-2 px-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4">
          <fieldset className="flex items-center gap-3">
            <legend className="float-left mr-1 font-medium">Grid Format:</legend>
            {(["alphabetical", "hierarchical"] as const).map((f) => (
              <label key={f} className="flex items-center gap-1.5 capitalize">
                <input
                  type="radio"
                  name="format"
                  className="accent-primary"
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                {f}
              </label>
            ))}
          </fieldset>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search classes…"
            aria-label="Search classes"
            className="w-64 border border-border px-2 py-1 text-[13.5px] focus:border-primary focus:outline-none"
          />
          {format === "alphabetical" && !needle && (
            <span className="flex gap-2 text-[12.5px]">
              <button type="button" className="text-primary hover:underline" onClick={() => setExpanded(allKeys())}>
                Expand all
              </button>
              <button type="button" className="text-primary hover:underline" onClick={() => setExpanded(new Set())}>
                Collapse all
              </button>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="tool"
            type="button"
            disabled={!canManage}
            onClick={() => router.push("/inventory/item-classes/new")}
          >
            New
          </Button>
          <Button
            variant="tool"
            type="button"
            disabled={!canManage || !one}
            title="Tick one class to add a subclass under it"
            onClick={() => one && router.push(`/inventory/item-classes/new?parent=${one.id}`)}
          >
            Add subclass
          </Button>
          <Button
            variant="tool"
            type="button"
            disabled={!canManage || !one}
            title={canManage ? "Tick one class to edit" : "You can only view item classes"}
            onClick={() => one && open(one)}
          >
            Edit
          </Button>
          <Button
            variant="tool"
            type="button"
            disabled={!onDelete || picked.length === 0 || pending}
            onClick={() => {
              setError(undefined);
              setConfirming(true);
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {format === "alphabetical" ? (
        <div className="overflow-x-auto border border-border bg-surface">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className="w-8" />
                <th>Item Type</th>
              </tr>
            </thead>
            <tbody>
              {itemTypes
                .filter((t) => isShown(`type:${t.id}`) && (t.isActive || childrenOf.has(`type:${t.id}`)))
                .map((t) => {
                  const key = `type:${t.id}`;
                  const count = childrenOf.get(key)?.length ?? 0;
                  return (
                    <Fragment key={t.id}>
                      <tr className="cursor-pointer hover:bg-row-hover" onClick={() => setExpanded((s) => toggle(s, key))}>
                        <td>
                          <button type="button" className={toggleClass} aria-expanded={isOpen(key)} aria-label={`${isOpen(key) ? "Collapse" : "Expand"} ${t.name}`}>
                            {isOpen(key) ? "▼" : "▶"}
                          </button>
                        </td>
                        <td className="font-semibold">
                          {t.name}
                          {!t.isActive && <span className="ml-1.5 text-[11px] font-normal text-muted">(retired)</span>}
                          {count > 0 && <span className="ml-1.5 text-[11px] font-normal text-muted">({count})</span>}
                        </td>
                      </tr>
                      {isOpen(key) && (
                        <tr className="bg-transparent!">
                          <td colSpan={2} className="py-1! pl-8!">
                            {level(key)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              {shown && shown.size === 0 && <EmptyRow colSpan={2}>No class matches &quot;{query}&quot;.</EmptyRow>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border bg-surface">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className="w-8" />
                <th>Item Type</th>
                <th>Class</th>
                <th>Modified By</th>
                <th>Date Modified</th>
              </tr>
            </thead>
            <tbody>
              {flat.length === 0 && <EmptyRow colSpan={5}>{needle ? `No class matches "${query}".` : "No classes yet."}</EmptyRow>}
              {flat.map((c) => (
                <tr key={c.id} {...rowProps(c)}>
                  <td>{checkbox(c)}</td>
                  <td>{c.itemType}</td>
                  <td className="font-medium">{c.path}</td>
                  <td>{c.modifiedBy || "—"}</td>
                  <td>{c.modifiedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Delete ${picked.length} item class${picked.length === 1 ? "" : "es"}?`}
        items={picked.map(pathOf)}
        pending={pending}
        error={error}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        A class that still has subclasses can only be deleted together with them.
      </ConfirmDialog>
    </div>
  );
}
