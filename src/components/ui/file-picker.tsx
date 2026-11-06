"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { buttonClass } from "./button";

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * A drop zone around a real <input type="file">: click "Choose files" or drag files onto it.
 * The input keeps the files, so the surrounding form submits exactly as with a plain file input.
 * Lists what was picked, lets each file be removed, and flags files over `maxBytes`.
 */
export function FilePicker({
  name,
  multiple = false,
  accept,
  maxBytes,
  hint,
  onChange,
}: {
  name: string;
  multiple?: boolean;
  accept?: string;
  maxBytes?: number;
  hint?: string;
  /** Told how many files are picked and whether any is too large, e.g. to enable a submit button. */
  onChange?: (state: { count: number; tooLarge: boolean }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const sync = (list: File[]) => {
    setFiles(list);
    onChange?.({ count: list.length, tooLarge: !!maxBytes && list.some((f) => f.size > maxBytes) });
  };

  /** Puts `list` into the real input, so it is what the form submits. */
  const setInputFiles = (list: File[]) => {
    const dt = new DataTransfer();
    list.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
    sync(list);
  };

  // The form is reset after a successful submit; clear the list with it.
  useEffect(() => {
    const form = inputRef.current?.form;
    const clear = () => sync([]);
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = [...e.dataTransfer.files];
    if (dropped.length) setInputFiles(multiple ? [...files, ...dropped] : dropped.slice(0, 1));
  };

  return (
    <div className="@container space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        // Clicking anywhere in the box opens the file chooser (the button inside is the keyboard path).
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest("label, button")) inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors @md:flex-row @md:text-left ${
          dragging ? "border-primary bg-row-hover" : "border-border bg-row-alt hover:border-primary/50"
        }`}
      >
        <svg viewBox="0 0 24 24" className="size-8 shrink-0 fill-none stroke-primary stroke-[1.6]" aria-hidden>
          <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
        </svg>
        <div className="flex-1">
          <p className="font-semibold">{dragging ? "Drop to add" : multiple ? "Drag and drop files here" : "Drag and drop a file here"}</p>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        <label className={`${buttonClass("secondary")} cursor-pointer font-semibold focus-within:ring-2 focus-within:ring-primary/40`}>
          {multiple ? "Choose files" : "Choose file"}
          <input
            ref={inputRef}
            type="file"
            name={name}
            multiple={multiple}
            accept={accept}
            required
            className="sr-only"
            onChange={(e) => sync([...(e.target.files ?? [])])}
          />
        </label>
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-md border border-border">
          {files.map((f, i) => {
            const tooLarge = !!maxBytes && f.size > maxBytes;
            return (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-1.5">
                <span className={`min-w-0 flex-1 truncate font-medium ${tooLarge ? "text-danger" : ""}`} title={f.name}>
                  {f.name}
                </span>
                <span className={`shrink-0 tabular-nums ${tooLarge ? "font-semibold text-danger" : "text-muted"}`}>
                  {formatSize(f.size)}
                  {tooLarge && " · too large"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setInputFiles(files.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-sm px-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
