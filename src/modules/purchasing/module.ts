import type { ModuleDefinition } from "../types";

export const P = {
  view: "purchasing.view",
  suppliersManage: "purchasing.suppliers.manage",
  ordersManage: "purchasing.orders.manage",
  receive: "purchasing.receive",
  billsPost: "purchasing.bills.post",
  paymentsPost: "purchasing.payments.post",
} as const;

// VAT codes and withholding presets are shared with Sales; see src/core/tax.ts.
export { VAT_CODES, VAT_RATE, WITHHOLDING_PRESETS as EWT_PRESETS, type VatCode } from "@/core/tax";

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
