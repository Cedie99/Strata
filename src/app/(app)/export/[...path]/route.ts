import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/guard";
import { readGridQuery, type GridList, type GridQuery } from "@/core/grid";
import { buildWorkbook, xlsxResponse, type SheetValue } from "@/core/spreadsheet";
import { userList } from "@/modules/admin/lists";
import { P as ADMIN } from "@/modules/admin/module";
import { recordList } from "@/modules/custom/lists";
import { requireCustomEntity } from "@/modules/custom/queries";
import { getImporter } from "@/modules/importers";
import { movementList, productList, stockList, warehouseList } from "@/modules/inventory/lists";
import { P as INV } from "@/modules/inventory/module";
import { accountList, balanceSheetList, incomeStatementList, journalList, ledgerList, trialBalanceList } from "@/modules/accounting/lists";
import { P as ACC } from "@/modules/accounting/module";
import { cashList } from "@/modules/finance/lists";
import { P as FIN } from "@/modules/finance/module";
import { customerList, invoiceList, paymentList, receivablesList } from "@/modules/sales/lists";
import { P as SALES } from "@/modules/sales/module";
import { billList, orderList, payablesList, receiptList, supplierList, supplierPaymentList } from "@/modules/purchasing/lists";
import { P as PUR } from "@/modules/purchasing/module";
import { birExport } from "@/modules/tax/export";

// GET /export/<list>?q=…&letter=…&f_…  → the rows matching that search and those filters, as .xlsx
// GET /export/<list>?template=1    → an empty import template for that list

async function load(path: string[], query: GridQuery): Promise<{ title: string; list: GridList }> {
  const all = { all: true };
  switch (path.join("/")) {
    case "products":
      await requirePermission(INV.view);
      return { title: "Products", list: await productList(query, all) };
    case "warehouses":
      await requirePermission(INV.view);
      return { title: "Warehouses", list: await warehouseList(query, all) };
    case "stock":
      await requirePermission(INV.view);
      return { title: "Stock on hand", list: await stockList(query, all) };
    case "movements":
      await requirePermission(INV.view);
      return { title: "Stock movements", list: await movementList(query, all) };
    case "customers":
      await requirePermission(SALES.view);
      return { title: "Customers", list: await customerList(query, all) };
    case "invoices":
      await requirePermission(SALES.view);
      return { title: "Sales invoices", list: await invoiceList(query, all) };
    case "payments":
      await requirePermission(SALES.view);
      return { title: "Payments received", list: await paymentList(query, all) };
    case "receivables":
      await requirePermission(SALES.view);
      return { title: "Receivables", list: await receivablesList(query, all) };
    case "suppliers":
      await requirePermission(PUR.view);
      return { title: "Suppliers", list: await supplierList(query, all) };
    case "purchase-orders":
      await requirePermission(PUR.view);
      return { title: "Purchase orders", list: await orderList(query, all) };
    case "receipts":
      await requirePermission(PUR.view);
      return { title: "Receiving reports", list: await receiptList(query, all) };
    case "bills":
      await requirePermission(PUR.view);
      return { title: "Supplier bills", list: await billList(query, all) };
    case "payments-made":
      await requirePermission(PUR.view);
      return { title: "Payments made", list: await supplierPaymentList(query, all) };
    case "payables":
      await requirePermission(PUR.view);
      return { title: "Payables", list: await payablesList(query, all) };
    case "cash":
      await requirePermission(FIN.view);
      return { title: "Cash book", list: await cashList(query, all) };
    case "accounts":
      await requirePermission(ACC.view);
      return { title: "Chart of accounts", list: await accountList(query, all) };
    case "journals":
      await requirePermission(ACC.view);
      return { title: "Journal entries", list: await journalList(query, all) };
    case "trial-balance":
      await requirePermission(ACC.view);
      return { title: "Trial balance", list: await trialBalanceList(query) };
    case "income-statement":
      await requirePermission(ACC.view);
      return { title: "Income statement", list: await incomeStatementList(query) };
    case "balance-sheet":
      await requirePermission(ACC.view);
      return { title: "Balance sheet", list: await balanceSheetList(query) };
    case "ledger":
      await requirePermission(ACC.view);
      return { title: "General ledger", list: await ledgerList(query) };
    case "users":
      await requirePermission(ADMIN.usersView);
      return { title: "Users", list: await userList(query, all) };
  }
  if (path[0] === "m" && path.length === 3) {
    const { entity, fields } = await requireCustomEntity(path[1], path[2]);
    return { title: entity.name, list: await recordList(entity, fields, query, all) };
  }
  notFound();
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const search = new URL(request.url).searchParams;

  // BIR books, lists and worksheets have their own layout (several tables, company heading).
  if (path[0] === "bir" && path.length === 2) return birExport(path[1], search);

  if (search.has("template")) {
    const importer = await getImporter(path);
    const sample = importer.columns.some((c) => c.sample) ? [importer.columns.map((c) => c.sample ?? null)] : [];
    const bytes = await buildWorkbook(importer.title, importer.columns.map((c) => c.label), sample);
    return xlsxResponse(bytes, `${importer.title} import template`);
  }

  // The same search, letter and f_* filters as the list on screen.
  const query = { ...(await readGridQuery(search)), page: 1 };
  const { title, list } = await load(path, query);
  const rows: SheetValue[][] = list.rows.map((r) =>
    list.columns.map((c) => {
      const cell = r.cells[c.key];
      if (cell === undefined) return null;
      // Dates export as shown ("Oct 28, 2026, 11:34 AM"), not as the timestamp kept for filtering.
      if (typeof cell === "object") return c.kind === "date" ? cell.text : (cell.value ?? cell.text);
      return cell === "-" || cell === "—" ? null : cell;
    }),
  );
  return xlsxResponse(await buildWorkbook(title, list.columns.map((c) => c.label), rows), title);
}
