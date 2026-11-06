import type { ModuleDefinition } from "../types";

export const P = {
  view: "accounting.view",
  accountsManage: "accounting.accounts.manage",
  journalPost: "accounting.journal.post",
  periodsManage: "accounting.periods.manage",
} as const;

export const ACCOUNT_TYPES = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "INCOME", label: "Income" },
  { value: "EXPENSE", label: "Expense" },
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

/** Accounts the system posts to. They exist from the first migration; admins may rename them or change their code. */
export type SystemKey =
  | "CASH"
  | "AR"
  | "INVENTORY"
  | "INPUT_VAT"
  | "CWT"
  | "INTERBRANCH"
  | "AP"
  | "GRNI"
  | "OUTPUT_VAT"
  | "WT_PAYABLE"
  | "LOANS"
  | "CAPITAL"
  | "DRAWINGS"
  | "RETAINED"
  | "OPENING"
  | "SALES"
  | "OTHER_INCOME"
  | "COGS"
  | "INV_ADJ"
  | "PAYROLL"
  | "RENT"
  | "TAXES"
  | "OTHER_EXPENSE";

/** Control accounts kept by a sub-ledger (customers, suppliers, stock, receipts awaiting bills); manual journals may not touch them or they drift apart. */
export const CONTROL_ACCOUNTS: SystemKey[] = ["AR", "INVENTORY", "AP", "GRNI"];

/** Debit-normal types: a positive balance is debits minus credits. */
export const isDebitNormal = (type: string) => type === "ASSET" || type === "EXPENSE";

export const accountingModule: ModuleDefinition = {
  id: "accounting",
  name: "Accounting",
  description: "General ledger, financial statements, journals and period close.",
  permissions: [
    { key: P.view, label: "View the ledger, journals and financial statements" },
    { key: P.accountsManage, label: "Change the chart of accounts" },
    { key: P.journalPost, label: "Post and reverse manual journal entries" },
    { key: P.periodsManage, label: "Close and reopen accounting periods" },
  ],
  nav: [
    { label: "Income statement", href: "/accounting/income-statement", permission: P.view, group: "Reports" },
    { label: "Balance sheet", href: "/accounting/balance-sheet", permission: P.view, group: "Reports" },
    { label: "Trial balance", href: "/accounting/trial-balance", permission: P.view, group: "Reports" },
    { label: "General ledger", href: "/accounting/ledger", permission: P.view, group: "Reports" },
    { label: "Journal entries", href: "/accounting/journals", permission: P.view },
    { label: "Chart of accounts", href: "/accounting/accounts", permission: P.view },
    { label: "Periods", href: "/accounting/periods", permission: P.view },
  ],
};
