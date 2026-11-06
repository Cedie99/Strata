import "server-only";
import { Prisma } from "@prisma/client";
import { getSettings } from "@/core/settings";
import { splitTin } from "@/core/tax";
import {
  cashDisbursementsBook,
  cashReceiptsBook,
  ewt1601eq,
  form2307List,
  generalJournal,
  generalLedger,
  purchasesBook,
  salesBook,
  sawt,
  sls,
  slsData,
  slp,
  slpData,
  vat2550q,
  type BirReport,
  type Params,
} from "./reports";

// Every BIR report the /tax pages and the export know about.

export type ReportDef = {
  title: string;
  /** The BIR form or book it supports, shown under the title. */
  form: string;
  period: "range" | "quarter";
  build: (branchIds: string[], params: Params) => Promise<BirReport>;
  /** A data file in the BIR RELIEF layout, for SLS and SLP. */
  dat?: (branchIds: string[], params: Params) => Promise<{ name: string; body: string }>;
};

export const REPORTS: Record<string, ReportDef> = {
  "general-journal": { title: "General journal", form: "Book of accounts", period: "range", build: generalJournal },
  "general-ledger": { title: "General ledger", form: "Book of accounts", period: "range", build: generalLedger },
  "cash-receipts": { title: "Cash receipts book", form: "Book of accounts", period: "range", build: cashReceiptsBook },
  "cash-disbursements": { title: "Cash disbursements book", form: "Book of accounts", period: "range", build: cashDisbursementsBook },
  "sales-book": { title: "Sales book", form: "Book of accounts (sales journal)", period: "range", build: salesBook },
  "purchases-book": { title: "Purchases book", form: "Book of accounts (purchase journal)", period: "range", build: purchasesBook },
  sls: { title: "Summary list of sales", form: "SLS · quarterly, with the 2550Q", period: "quarter", build: sls, dat: slsDat },
  slp: { title: "Summary list of purchases", form: "SLP · quarterly, with the 2550Q", period: "quarter", build: slp, dat: slpDat },
  "vat-2550q": { title: "Quarterly VAT worksheet", form: "BIR Form 2550Q", period: "quarter", build: vat2550q },
  "ewt-1601eq": { title: "Expanded withholding tax", form: "BIR Form 1601-EQ and its QAP", period: "quarter", build: ewt1601eq },
  sawt: { title: "Summary alphalist of withholding taxes", form: "SAWT · tax withheld by customers (Forms 2307 received)", period: "quarter", build: sawt },
  "form-2307": { title: "Form 2307 for suppliers", form: "BIR Form 2307 · certificate of creditable tax withheld at source", period: "quarter", build: form2307List },
};

// ───────────────────────── RELIEF data files ─────────────────────────
// Layout of the BIR Reconciliation of Listings for Enforcement (RELIEF) files: one header line (H) for the
// company, then one detail line (D) per customer or supplier. Text is upper-case and quoted; amounts have
// two decimals and no thousands separators.

const q = (s: string) => `"${s.replace(/"/g, "").replace(/[\r\n]+/g, " ").trim().toUpperCase().slice(0, 50)}"`;
const a = (d: Prisma.Decimal) => d.toFixed(2);
const mdy = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
const addressParts = (s: string) => {
  const flat = s.replace(/[\r\n]+/g, ", ");
  return [flat.slice(0, 30), flat.slice(30, 60)];
};

async function company() {
  const s = await getSettings();
  const [addr1, addr2] = addressParts(s["company.address"]);
  return { tin: splitTin(s["company.tin"]).tin, name: s["company.name"], addr1, addr2, rdo: s["company.rdo"] };
}

const fileName = (tin: string, kind: "S" | "P", last: Date) => `${tin || "000000000"}${kind}${String(last.getMonth() + 1).padStart(2, "0")}${last.getFullYear()}.DAT`;

async function slsDat(branchIds: string[], params: Params) {
  const [{ q: quarter, rows }, co] = await Promise.all([slsData(branchIds, params), company()]);
  const total = (k: "exempt" | "zero" | "taxable" | "vat") => rows.reduce((s, r) => s.plus(r[k]), new Prisma.Decimal(0));
  const end = mdy(quarter.last);
  const lines = [
    ["H", "S", q(co.tin), q(co.name), q(""), q(""), q(""), q(co.name), q(co.addr1), q(co.addr2), a(total("exempt")), a(total("zero")), a(total("taxable")), a(total("vat")), co.rdo, end, "12"].join(","),
    ...rows.map((r) => {
      const [addr1, addr2] = addressParts(r.address);
      return ["D", "S", q(splitTin(r.tin).tin), q(r.name), q(""), q(""), q(""), q(addr1), q(addr2), a(r.exempt), a(r.zero), a(r.taxable), a(r.vat), q(co.tin), end].join(",");
    }),
  ];
  return { name: fileName(co.tin, "S", quarter.last), body: lines.join("\r\n") + "\r\n" };
}

async function slpDat(branchIds: string[], params: Params) {
  const [{ q: quarter, rows }, co] = await Promise.all([slpData(branchIds, params), company()]);
  const total = (k: "exempt" | "zero" | "services" | "goods" | "vat") => rows.reduce((s, r) => s.plus(r[k]), new Prisma.Decimal(0));
  const end = mdy(quarter.last);
  const zero = "0.00";
  const lines = [
    [
      "H", "P", q(co.tin), q(co.name), q(""), q(""), q(""), q(co.name), q(co.addr1), q(co.addr2),
      a(total("exempt")), a(total("zero")), a(total("services")), zero, a(total("goods")), a(total("vat")), a(total("vat")), zero, co.rdo, end, "12",
    ].join(","),
    ...rows.map((r) => {
      const [addr1, addr2] = addressParts(r.address);
      const gross = r.services.plus(r.goods);
      return ["D", "P", q(splitTin(r.tin).tin), q(r.name), q(""), q(""), q(""), q(addr1), q(addr2), a(r.exempt), a(r.zero), a(r.services), zero, a(r.goods), a(r.vat), a(gross.plus(r.vat)), q(co.tin), end].join(",");
    }),
  ];
  return { name: fileName(co.tin, "P", quarter.last), body: lines.join("\r\n") + "\r\n" };
}
