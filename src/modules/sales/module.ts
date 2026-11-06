import type { ModuleDefinition } from "../types";

export const P = {
  view: "sales.view",
  customersManage: "sales.customers.manage",
  invoicesPost: "sales.invoices.post",
  paymentsPost: "sales.payments.post",
} as const;

export const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CHECK", label: "Check" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
] as const;

export const salesModule: ModuleDefinition = {
  id: "sales",
  name: "Sales",
  description: "Customers, sales invoices and payments received.",
  permissions: [
    { key: P.view, label: "View customers, invoices and payments" },
    { key: P.customersManage, label: "Create and edit customers" },
    { key: P.invoicesPost, label: "Post and void sales invoices" },
    { key: P.paymentsPost, label: "Record payments received" },
  ],
  nav: [
    { label: "Invoices", href: "/sales/invoices", permission: P.view },
    { label: "Payments received", href: "/sales/payments", permission: P.view },
    { label: "Receivables", href: "/sales/receivables", permission: P.view },
    { label: "Customers", href: "/sales/customers", permission: P.view },
  ],
};
