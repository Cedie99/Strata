// Tables in the order they can be loaded (parents before children). Sessions are not copied:
// everyone signs in again after the move.
export const TABLES = [
  "setting",
  "role",
  "rolePermission",
  "branch",
  "user",
  "userRole",
  "userBranch",
  "product",
  "warehouse",
  "stockMovement",
  "customModule",
  "customEntity",
  "customRecord",
  "documentSeries",
  "documentCounter",
  "attachment",
  "customer",
  "salesInvoice",
  "salesInvoiceLine",
  "payment",
  "cashEntry",
  "account",
  "journalEntry",
  "journalLine",
  // After the entries: the database refuses entries dated in a closed month.
  "accountingPeriod",
  // Re-chained on insert (seq and hashes are recomputed in load order), then verify with audit_verify().
  "auditLog",
] as const;
