"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/guard";
import { db } from "@/core/db";
import type { ActionState } from "@/core/forms";
import { ledgerGuardMessage, PostingError } from "@/core/posting";
import { readFirstSheet } from "@/core/spreadsheet";
import { getImporter, type ImportRow } from "./importers";

const MAX_ROWS = 5000;
const SHOWN_ERRORS = 50;

/** Thrown inside the transaction to undo every row when any row fails. */
class RowErrors extends Error {
  constructor(readonly errors: string[]) {
    super("Import failed");
  }
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function importSpreadsheet(path: string[], _state: ActionState, formData: FormData): Promise<ActionState> {
  const importer = await getImporter(path);
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { file: ["Choose an Excel file"] } };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { fieldErrors: { file: ["Use an .xlsx file (Excel 2007 or newer)"] } };
  if (file.size > 10 * 1024 * 1024) return { fieldErrors: { file: ["The file is larger than 10 MB"] } };

  let sheet: Awaited<ReturnType<typeof readFirstSheet>>;
  try {
    sheet = await readFirstSheet(await file.arrayBuffer());
  } catch {
    return { fieldErrors: { file: ["This file could not be read as an Excel workbook"] } };
  }

  // Columns are matched by their header (label or key), ignoring case, spaces and punctuation.
  const index = new Map(sheet.headers.map((h, i) => [normalize(h), i]));
  const position = new Map(
    importer.columns.map((c) => [c.key, index.get(normalize(c.label)) ?? index.get(normalize(c.key))]),
  );
  const missing = importer.columns.filter((c) => c.required && position.get(c.key) === undefined);
  if (missing.length) return { error: `Missing column(s): ${missing.map((c) => c.label).join(", ")}. Download the template to see the layout.` };
  if (sheet.rows.length === 0) return { error: "The sheet has no rows under the header." };
  if (sheet.rows.length > MAX_ROWS) return { error: `At most ${MAX_ROWS} rows per file; split it into smaller files.` };

  const rows: ImportRow[] = sheet.rows.map((r) => ({
    rowNumber: r.rowNumber,
    values: Object.fromEntries(importer.columns.map((c) => [c.key, r.values[position.get(c.key) ?? -1] ?? ""])),
  }));

  try {
    const result = await db.$transaction(
      async (tx) => {
        const outcome = await importer.run(rows, tx, user.id);
        if ("errors" in outcome) throw new RowErrors(outcome.errors);
        return outcome;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    revalidatePath(importer.listHref, "layout");
    return { ok: `Imported. ${result.summary}` };
  } catch (e) {
    if (e instanceof PostingError) return { error: `Nothing was imported: ${e.message}` };
    const guard = ledgerGuardMessage(e);
    if (guard) return { error: `Nothing was imported: ${guard}` };
    if (!(e instanceof RowErrors)) throw e;
    const more = e.errors.length - SHOWN_ERRORS;
    return {
      error: `Nothing was imported: ${e.errors.length} problem(s) found. Fix them in the file and upload it again.`,
      fieldErrors: { rows: [...e.errors.slice(0, SHOWN_ERRORS), ...(more > 0 ? [`…and ${more} more`] : [])] },
    };
  }
}
