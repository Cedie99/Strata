import type { SystemKey } from "../accounting/module";
import type { ModuleDefinition } from "../types";

export const P = {
  /** The business dashboard and the cash book. */
  view: "finance.view",
  cashPost: "finance.cash.post",
} as const;

/**
 * Cash book categories and the ledger account each one posts against (cash is the other side).
 * Customer payments are recorded under Sales and counted as cash in automatically.
 */
export const CASH_CATEGORY_ACCOUNTS = {
  IN: {
    "Opening balance": "OPENING",
    "Owner capital": "CAPITAL",
    "Loan received": "LOANS",
    "Other income": "OTHER_INCOME",
  },
  OUT: {
    "Supplier payment": "AP",
    Payroll: "PAYROLL",
    "Rent & utilities": "RENT",
    "Taxes & fees": "TAXES",
    "Loan repayment": "LOANS",
    "Owner drawings": "DRAWINGS",
    "Other expense": "OTHER_EXPENSE",
  },
} as const satisfies Record<"IN" | "OUT", Record<string, SystemKey>>;

export const CASH_CATEGORIES = {
  IN: Object.keys(CASH_CATEGORY_ACCOUNTS.IN),
  OUT: Object.keys(CASH_CATEGORY_ACCOUNTS.OUT),
};

export const financeModule: ModuleDefinition = {
  id: "finance",
  name: "Finance",
  description: "Business dashboard and cash book.",
  permissions: [
    { key: P.view, label: "View the business dashboard and cash book" },
    { key: P.cashPost, label: "Record cash in and out" },
  ],
  nav: [
    { label: "Business dashboard", href: "/finance", permission: P.view },
    { label: "Cash book", href: "/finance/cash", permission: P.view },
  ],
};
