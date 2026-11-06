-- BIR compliance: VAT on sales, creditable withholding received from customers (Form 2307),
-- and the BIR menu permission.

-- ───────────── Customers ─────────────
ALTER TABLE "Customer" ADD COLUMN "cwtAtc" TEXT NOT NULL DEFAULT '',
ADD COLUMN "cwtRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "tin" TEXT NOT NULL DEFAULT '',
ADD COLUMN "vatCode" TEXT NOT NULL DEFAULT 'VAT';
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tax_check" CHECK ("vatCode" IN ('VAT', 'ZERO', 'EXEMPT') AND "cwtRate" >= 0 AND "cwtRate" <= 100);

-- ───────────── Sales invoices ─────────────
-- Invoices posted before VAT on sales were recorded without VAT: subtotal = total, VAT 0, lines EXEMPT.
-- Filling subtotal is the one change ever made to a posted invoice, so the guard is lifted only for it.
ALTER TABLE "SalesInvoice" ADD COLUMN "subtotal" DECIMAL(65,30),
ADD COLUMN "vat" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" DISABLE TRIGGER sales_invoice_guard;
UPDATE "SalesInvoice" SET "subtotal" = "total";
ALTER TABLE "SalesInvoice" ENABLE TRIGGER sales_invoice_guard;
ALTER TABLE "SalesInvoice" ALTER COLUMN "subtotal" SET NOT NULL;
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_vat_check" CHECK ("vat" >= 0 AND "total" = "subtotal" + "vat");

-- The guard now also keeps the VAT amounts fixed.
CREATE OR REPLACE FUNCTION sales_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" = 'POSTED' AND NEW."status" = 'VOID'
     AND (NEW."number", NEW."customerId", NEW."branchId", NEW."warehouseId", NEW."date", NEW."dueDate", NEW."subtotal", NEW."vat", NEW."total", NEW."costTotal", NEW."reference", NEW."note")
         IS NOT DISTINCT FROM
         (OLD."number", OLD."customerId", OLD."branchId", OLD."warehouseId", OLD."date", OLD."dueDate", OLD."subtotal", OLD."vat", OLD."total", OLD."costTotal", OLD."reference", OLD."note") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Posted sales invoices cannot be changed or deleted, only voided';
END $$;

-- Adding columns with a default does not touch existing rows, so the append-only trigger is not involved.
ALTER TABLE "SalesInvoiceLine" ADD COLUMN "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN "vatCode" TEXT NOT NULL DEFAULT 'EXEMPT';
ALTER TABLE "SalesInvoiceLine" ALTER COLUMN "vatCode" DROP DEFAULT;
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_vat_check" CHECK ("vatCode" IN ('VAT', 'ZERO', 'EXEMPT') AND "vat" >= 0);

-- ───────────── Payments received ─────────────
ALTER TABLE "Payment" ADD COLUMN "atc" TEXT NOT NULL DEFAULT '',
ADD COLUMN "cwt" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cwt_check" CHECK ("cwt" >= 0 AND "cwt" <= "amount");

-- ───────────── Permissions ─────────────
-- Whoever can read the books can read the BIR books and returns.
INSERT INTO "RolePermission" ("roleId", "permission")
SELECT "roleId", 'tax.view' FROM "RolePermission" WHERE "permission" = 'accounting.view'
ON CONFLICT DO NOTHING;
