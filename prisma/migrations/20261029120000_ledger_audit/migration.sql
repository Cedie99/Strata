-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "prevHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "seq" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "systemKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceNumber" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "customerId" TEXT,
    "productId" TEXT,
    "memo" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("year","month")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_systemKey_key" ON "Account"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceNumber_idx" ON "JournalEntry"("sourceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_key" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_branchId_idx" ON "JournalLine"("accountId", "branchId");

-- CreateIndex
CREATE INDEX "JournalLine_customerId_idx" ON "JournalLine"("customerId");

-- CreateIndex

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────────── Ledger integrity ─────────────

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_amounts_check"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" = 0 OR "credit" = 0) AND ("debit" + "credit") > 0);
ALTER TABLE "Account" ADD CONSTRAINT "Account_type_check"
  CHECK ("type" IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'));
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_check"
  CHECK ("month" BETWEEN 1 AND 12 AND "status" IN ('OPEN', 'CLOSED'));

-- Every journal entry must balance when its transaction commits.
CREATE FUNCTION journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d numeric; c numeric;
BEGIN
  SELECT coalesce(sum("debit"), 0), coalesce(sum("credit"), 0) INTO d, c FROM "JournalLine" WHERE "entryId" = NEW."entryId";
  IF d <> c THEN
    RAISE EXCEPTION 'Journal entry % does not balance (debits %, credits %)', NEW."entryId", d, c;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_balanced();

-- No entry may be dated in a closed month. Postings hold a shared lock and closing takes it exclusively,
-- so a month cannot be closed while a posting into it is still in flight.
CREATE FUNCTION journal_period_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(727002);
  IF EXISTS (SELECT 1 FROM "AccountingPeriod"
             WHERE "year" = extract(year FROM NEW."date") AND "month" = extract(month FROM NEW."date") AND "status" = 'CLOSED') THEN
    RAISE EXCEPTION 'The period %-% is closed', extract(year FROM NEW."date"), lpad(extract(month FROM NEW."date")::text, 2, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_period_open BEFORE INSERT ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION journal_period_open();

-- ───────────── Tamper-evident audit log ─────────────
-- Each row's hash covers its content and the previous row's hash, so changing or removing any row (even
-- with the triggers disabled) breaks the chain from that point on. audit_verify() finds the first break.

CREATE FUNCTION audit_row_hash(prev text, r "AuditLog") RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws(E'\x1f', prev, r."id", (extract(epoch FROM r."at") * 1000)::bigint::text,
    coalesce(r."userId", ''), r."action", r."entity", coalesce(r."entityId", ''), coalesce(r."before", ''), coalesce(r."after", '')), 'UTF8')), 'hex')
$$;

-- Chain the rows already in the log, oldest first.
DO $$
DECLARE r "AuditLog"; prev text := ''; h text; n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM "AuditLog" ORDER BY "at", "id" LOOP
    n := n + 1;
    h := audit_row_hash(prev, r);
    UPDATE "AuditLog" SET "seq" = n, "prevHash" = prev, "hash" = h WHERE "id" = r."id";
    prev := h;
  END LOOP;
END $$;
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");

CREATE FUNCTION audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_seq bigint; last_hash text;
BEGIN
  -- One writer at a time extends the chain (held until the transaction ends).
  PERFORM pg_advisory_xact_lock(727001);
  SELECT "seq", "hash" INTO last_seq, last_hash FROM "AuditLog" ORDER BY "seq" DESC LIMIT 1;
  NEW."seq" := coalesce(last_seq, 0) + 1;
  NEW."prevHash" := coalesce(last_hash, '');
  NEW."hash" := audit_row_hash(NEW."prevHash", NEW);
  RETURN NEW;
END $$;
CREATE TRIGGER audit_chain BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION audit_chain();

-- Rows checked, and the first row whose stored hash or link does not match (null when the chain is intact).
CREATE FUNCTION audit_verify() RETURNS TABLE (checked bigint, first_broken_seq bigint) LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT a."seq", a."hash", a."prevHash", audit_row_hash(a."prevHash", a) AS expected,
           lag(a."hash", 1, '') OVER (ORDER BY a."seq") AS previous,
           lag(a."seq", 1, 0::bigint) OVER (ORDER BY a."seq") AS previous_seq
    FROM "AuditLog" a
  )
  SELECT count(*), min("seq") FILTER (WHERE "hash" <> expected OR "prevHash" <> previous OR "seq" <> previous_seq + 1) FROM c
$$;

-- Append-only records: posted history is never changed or removed, by the app or anyone else with database access.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% records are permanent and cannot be % (post a reversal instead)', TG_TABLE_NAME,
    CASE TG_OP WHEN 'UPDATE' THEN 'changed' WHEN 'DELETE' THEN 'deleted' ELSE 'truncated' END;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AuditLog', 'JournalEntry', 'JournalLine', 'StockMovement', 'Payment', 'CashEntry', 'SalesInvoiceLine'] LOOP
    EXECUTE format('CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_change()', t);
    EXECUTE format('CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()', t);
  END LOOP;
END $$;

-- An invoice can only change from POSTED to VOID; nothing else about it may change, and it is never deleted.
CREATE FUNCTION sales_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" = 'POSTED' AND NEW."status" = 'VOID'
     AND (NEW."number", NEW."customerId", NEW."branchId", NEW."warehouseId", NEW."date", NEW."dueDate", NEW."total", NEW."costTotal", NEW."reference", NEW."note")
         IS NOT DISTINCT FROM
         (OLD."number", OLD."customerId", OLD."branchId", OLD."warehouseId", OLD."date", OLD."dueDate", OLD."total", OLD."costTotal", OLD."reference", OLD."note") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Posted sales invoices cannot be changed or deleted, only voided';
END $$;
CREATE TRIGGER sales_invoice_guard BEFORE UPDATE OR DELETE ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION sales_invoice_guard();
CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON "SalesInvoice" FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- ───────────── Chart of accounts ─────────────
-- Starting accounts for a Philippine VAT-registered trading business. Names and codes can be changed;
-- systemKey accounts are the ones postings use automatically.

INSERT INTO "Account" ("id", "code", "name", "type", "systemKey") VALUES
  ('acct_cash',          '1000', 'Cash and cash equivalents',           'ASSET',     'CASH'),
  ('acct_ar',            '1100', 'Accounts receivable - trade',         'ASSET',     'AR'),
  ('acct_inventory',     '1200', 'Merchandise inventory',               'ASSET',     'INVENTORY'),
  ('acct_input_vat',     '1300', 'Input VAT',                           'ASSET',     'INPUT_VAT'),
  ('acct_cwt',           '1310', 'Creditable withholding tax',          'ASSET',     'CWT'),
  ('acct_interbranch',   '1900', 'Inter-branch clearing',               'ASSET',     'INTERBRANCH'),
  ('acct_ap',            '2000', 'Accounts payable - trade',            'LIABILITY', 'AP'),
  ('acct_output_vat',    '2100', 'Output VAT',                          'LIABILITY', 'OUTPUT_VAT'),
  ('acct_wt_payable',    '2200', 'Withholding taxes payable',           'LIABILITY', 'WT_PAYABLE'),
  ('acct_loans',         '2300', 'Loans payable',                       'LIABILITY', 'LOANS'),
  ('acct_capital',       '3000', 'Owner''s capital',                    'EQUITY',    'CAPITAL'),
  ('acct_drawings',      '3100', 'Owner''s drawings',                   'EQUITY',    'DRAWINGS'),
  ('acct_retained',      '3200', 'Retained earnings',                   'EQUITY',    'RETAINED'),
  ('acct_opening',       '3900', 'Opening balance equity',              'EQUITY',    'OPENING'),
  ('acct_sales',         '4000', 'Sales',                               'INCOME',    'SALES'),
  ('acct_other_income',  '4900', 'Other income',                        'INCOME',    'OTHER_INCOME'),
  ('acct_cogs',          '5000', 'Cost of goods sold',                  'EXPENSE',   'COGS'),
  ('acct_inv_adj',       '5100', 'Inventory adjustments and shrinkage', 'EXPENSE',   'INV_ADJ'),
  ('acct_payroll',       '6100', 'Salaries and wages',                  'EXPENSE',   'PAYROLL'),
  ('acct_rent',          '6200', 'Rent and utilities',                  'EXPENSE',   'RENT'),
  ('acct_taxes',         '6300', 'Taxes and licenses',                  'EXPENSE',   'TAXES'),
  ('acct_other_expense', '6900', 'Other expenses',                      'EXPENSE',   'OTHER_EXPENSE');
