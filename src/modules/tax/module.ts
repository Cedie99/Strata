import type { ModuleDefinition } from "../types";

export const P = {
  view: "tax.view",
} as const;

export const taxModule: ModuleDefinition = {
  id: "tax",
  name: "BIR",
  description: "Books of accounts, summary lists (SLS / SLP), return worksheets, Form 2307 and CAS readiness.",
  permissions: [{ key: P.view, label: "View BIR books, summary lists, return worksheets and Form 2307" }],
  nav: [
    { label: "General journal", href: "/tax/general-journal", permission: P.view, group: "Books of accounts" },
    { label: "General ledger", href: "/tax/general-ledger", permission: P.view, group: "Books of accounts" },
    { label: "Cash receipts book", href: "/tax/cash-receipts", permission: P.view, group: "Books of accounts" },
    { label: "Cash disbursements book", href: "/tax/cash-disbursements", permission: P.view, group: "Books of accounts" },
    { label: "Sales book", href: "/tax/sales-book", permission: P.view, group: "Books of accounts" },
    { label: "Purchases book", href: "/tax/purchases-book", permission: P.view, group: "Books of accounts" },
    { label: "Summary list of sales (SLS)", href: "/tax/sls", permission: P.view, group: "Summary lists" },
    { label: "Summary list of purchases (SLP)", href: "/tax/slp", permission: P.view, group: "Summary lists" },
    { label: "2550Q · quarterly VAT", href: "/tax/vat-2550q", permission: P.view, group: "Return worksheets" },
    { label: "1601-EQ · QAP (tax withheld from suppliers)", href: "/tax/ewt-1601eq", permission: P.view, group: "Return worksheets" },
    { label: "SAWT (tax withheld by customers)", href: "/tax/sawt", permission: P.view, group: "Return worksheets" },
    { label: "Form 2307 for suppliers", href: "/tax/form-2307", permission: P.view },
    { label: "CAS readiness", href: "/tax/cas", permission: P.view },
  ],
};
