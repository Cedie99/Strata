import type { ModuleDefinition } from "../types";

export const P = {
  /** See every approval request (everyone sees their own and what waits for them). */
  view: "approvals.view",
  rulesManage: "approvals.rules.manage",
} as const;

/** What can make a document wait for approval. Admins pick one per rule. */
export const TRIGGERS = [
  {
    value: "PO_AMOUNT",
    label: "Purchase order total",
    unit: "amount",
    hint: "Purchase orders whose total (with VAT) is at least the amount.",
  },
  {
    value: "SUPPLIER_PAYMENT_AMOUNT",
    label: "Payment to a supplier",
    unit: "amount",
    hint: "Payments made whose amount applied to bills is at least the amount.",
  },
  {
    value: "CASH_OUT_AMOUNT",
    label: "Cash out (cash book)",
    unit: "amount",
    hint: "Cash book entries going out that are at least the amount.",
  },
  {
    value: "MANUAL_JOURNAL",
    label: "Manual journal or reversal",
    unit: "amount",
    hint: "Manual journal entries, and reversals of them, whose total debits are at least the amount (0 = all).",
  },
  {
    value: "INVOICE_VOID",
    label: "Voiding a sales invoice",
    unit: "amount",
    hint: "Voids of invoices whose total is at least the amount (0 = every void).",
  },
  {
    value: "BILL_VOID",
    label: "Voiding a supplier bill",
    unit: "amount",
    hint: "Voids of bills whose total is at least the amount (0 = every void).",
  },
  {
    value: "SALE_BELOW_COST",
    label: "Selling below cost",
    unit: "none",
    hint: "Sales invoices with any line priced below the product's cost.",
  },
  {
    value: "SALE_DISCOUNT",
    label: "Discount on a sale",
    unit: "percent",
    hint: "Sales invoices with any line priced more than this percent below the product's selling price.",
  },
  {
    value: "CREDIT_LIMIT",
    label: "Customer over credit limit",
    unit: "none",
    hint: "Sales invoices that take what the customer owes above their credit limit (customers with no limit are never stopped).",
  },
] as const;
export type Trigger = (typeof TRIGGERS)[number]["value"];
export const triggerOf = (v: string) => TRIGGERS.find((t) => t.value === v);

/** Kinds of waiting document, for lists and filters. */
export const KIND_LABELS: Record<string, string> = {
  PurchaseOrder: "Purchase order",
  SupplierPayment: "Payment to supplier",
  CashOut: "Cash out",
  ManualJournal: "Manual journal",
  JournalReversal: "Journal reversal",
  InvoiceVoid: "Invoice void",
  BillVoid: "Bill void",
  SalesInvoice: "Sales invoice",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Waiting",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
};

export const approvalsModule: ModuleDefinition = {
  id: "approvals",
  name: "Approvals",
  description: "Approval rules, the approvals inbox and the history of every request.",
  permissions: [
    { key: P.view, label: "See every approval request (everyone sees their own and what waits for them)" },
    { key: P.rulesManage, label: "Manage approval rules" },
  ],
  nav: [
    // An empty permission means every signed-in user: anyone may be asked to approve, and anyone may submit.
    { label: "Waiting for my approval", href: "/approvals", permission: "" },
    { label: "Requests", href: "/approvals/requests", permission: "" },
    { label: "Approval rules", href: "/approvals/rules", permission: P.rulesManage },
  ],
};
