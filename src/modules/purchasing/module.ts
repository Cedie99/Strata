import type { ModuleDefinition } from "../types";

export const P = {
  view: "purchasing.view",
  suppliersManage: "purchasing.suppliers.manage",
  ordersManage: "purchasing.orders.manage",
  receive: "purchasing.receive",
  billsPost: "purchasing.bills.post",
  paymentsPost: "purchasing.payments.post",
} as const;

/** VAT treatment of a purchase line. Amounts are entered net of VAT. */
export const VAT_CODES = [
  { value: "VAT", label: "VATable 12%" },
  { value: "ZERO", label: "Zero-rated" },
  { value: "EXEMPT", label: "Exempt / non-VAT" },
] as const;
export type VatCode = (typeof VAT_CODES)[number]["value"];
export const VAT_RATE = 0.12;

/** Common expanded withholding rates (percent) with their BIR ATC for corporations / individuals. */
export const EWT_PRESETS = [
  { value: "0", label: "None", atc: "" },
  { value: "1", label: "1% · goods (top withholding agents)", atc: "WC158" },
  { value: "2", label: "2% · services (top withholding agents)", atc: "WC160" },
  { value: "5", label: "5% · rentals", atc: "WC100" },
  { value: "10", label: "10% · professional fees", atc: "WC010" },
  { value: "15", label: "15% · professional fees (over threshold)", atc: "WC011" },
] as const;

export const PO_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PARTIAL: "Partly received",
  RECEIVED: "Received",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export const purchasingModule: ModuleDefinition = {
  id: "purchasing",
  name: "Purchasing",
  description: "Suppliers, purchase orders, receiving, supplier bills and payments made.",
  permissions: [
    { key: P.view, label: "View suppliers, purchase orders, bills and payments" },
    { key: P.suppliersManage, label: "Create and edit suppliers" },
    { key: P.ordersManage, label: "Create, close and cancel purchase orders" },
    { key: P.receive, label: "Receive goods against purchase orders" },
    { key: P.billsPost, label: "Post and void supplier bills" },
    { key: P.paymentsPost, label: "Record payments to suppliers" },
  ],
  nav: [
    { label: "Purchase orders", href: "/purchasing/orders", permission: P.view },
    { label: "Receiving reports", href: "/purchasing/receipts", permission: P.view },
    { label: "Supplier bills", href: "/purchasing/bills", permission: P.view },
    { label: "Payments made", href: "/purchasing/payments", permission: P.view },
    { label: "Payables", href: "/purchasing/payables", permission: P.view },
    { label: "Suppliers", href: "/purchasing/suppliers", permission: P.view },
  ],
};
