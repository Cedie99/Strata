import "server-only";
import ExcelJS from "exceljs";

export type SheetValue = string | number | null;

/** One-sheet .xlsx with a bold, frozen header row. */
export async function buildWorkbook(sheetName: string, headers: string[], rows: SheetValue[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  ws.addRow(headers).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) ws.addRow(row);
  ws.columns.forEach((col, i) => {
    const longest = Math.max(headers[i]?.length ?? 0, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    col.width = Math.min(Math.max(longest + 2, 8), 50);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * A report with several tables on one sheet: a title block, then each table with its own bold header
 * and totals row, separated by a blank row. Used by the BIR books and worksheets.
 */
export async function buildReportWorkbook(
  sheetName: string,
  heading: string[],
  sections: { title?: string; headers: string[]; rows: SheetValue[][]; totals?: SheetValue[] }[],
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  heading.forEach((h, i) => (ws.addRow([h]).font = { bold: i === 0, size: i === 0 ? 13 : 11 }));
  for (const s of sections) {
    ws.addRow([]);
    if (s.title) ws.addRow([s.title]).font = { bold: true };
    ws.addRow(s.headers).font = { bold: true };
    for (const row of s.rows) ws.addRow(row);
    if (s.totals) ws.addRow(s.totals).font = { bold: true };
  }
  const all = sections.flatMap((s) => [s.headers, ...s.rows.slice(0, 500)]);
  ws.columns.forEach((col, i) => {
    const longest = Math.max(...all.map((r) => String(r[i] ?? "").length));
    col.width = Math.min(Math.max(longest + 2, 8), 50);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(bytes: Buffer, fileBase: string) {
  const date = new Date().toISOString().slice(0, 10);
  const name = `${fileBase.replace(/[^\w.-]+/g, "_")}_${date}.xlsx`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Plain text for whatever Excel stored in a cell (numbers, dates, formulas, rich text, links). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return "";
  }
  return String(value).trim();
}

/** Reads the first sheet; row 1 is the header. Blank rows are skipped. */
export async function readFirstSheet(bytes: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers = ((ws.getRow(1).values as ExcelJS.CellValue[]) ?? []).slice(1).map(cellText);
  const rows: { rowNumber: number; values: string[] }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = headers.map((_, i) => cellText(row.getCell(i + 1).value));
    if (values.some(Boolean)) rows.push({ rowNumber, values });
  });
  return { headers, rows };
}
