# Strata

Strata is a web-based ERP for small and mid-size trading companies in the Philippines. It runs buying,
stock, selling, cash and accounting in one system, across several branches, with books that hold up to an
audit and are ready for BIR rules.

Strata is built as a small core plus modules that plug into it. Every module posts its own entries to a
shared double-entry general ledger, so stock, receivables, payables and the financial statements always agree
with the documents behind them.

### What it does today

| Module | What it covers |
|---|---|
| **Inventory** | Products, warehouses per branch, stock movements (receipt, issue, adjustment, transfer), stock on hand, moving-average cost |
| **Sales** | Customers, sales invoices with output VAT that issue stock and fix gross margin, payments received (with tax withheld by customers, Form 2307), receivables aging |
| **Purchasing** | Suppliers, purchase orders, receiving reports, supplier bills with input VAT, payments with expanded withholding tax (EWT), payables aging |
| **Finance** | Business dashboard (revenue, margins, receivables, cash flow, inventory) and cash book |
| **Accounting** | Automatic journal entries, income statement, balance sheet, trial balance, general ledger, manual journals, month-end close |
| **BIR** | Books of accounts, SLS / SLP with RELIEF data files, 2550Q, 1601-EQ / QAP and SAWT worksheets, Form 2307 for suppliers, CAS readiness checks |
| **Setup** | Users, roles and permissions, branches, document numbering, company settings, branding, tamper-evident audit log |
| **Custom modules** | New record types, forms, menus, rules and approvals built in the browser without code |

### What makes it different

- **Books you can trust.** Posted documents are never edited or deleted; mistakes are voided or reversed. The
  database itself enforces balanced entries, closed periods and append-only records, and the audit log is
  hash-chained so tampering shows.
- **Built for the Philippines.** VAT on sales and purchases (12%, zero-rated, exempt), EWT on supplier payments,
  creditable withholding from customers, the BIR books, summary lists and return worksheets, Form 2307, and a
  design kept ready for BIR CAS registration (gap-free numbering, full trail, live readiness checks).
- **Multi-branch from the start.** Users see only their branches; every list, report and the dashboard can be
  narrowed to one branch.
- **Yours to shape.** Rebrand it (name, logo, fonts, colours) and add your own modules without a developer.

### Where to read more

- **User manual**: `npm run manual` opens it in Microsoft Edge; sources and links in [`docs/manual/`](docs/manual/README.md).
- **Roadmap**: what is planned next, as a checklist, in [`ROADMAP.md`](ROADMAP.md).
- The rest of this file is for developers: how to run it, how the code is organised, and the rules it follows.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions) + React 19 + TypeScript
- Tailwind CSS v4
- Prisma 5 with PostgreSQL (hosted on Supabase)
- Zod for validation, bcryptjs for passwords, database-backed sessions in an httpOnly cookie

## Run it

```bash
cp .env.example .env # then set DATABASE_URL and DIRECT_URL to your PostgreSQL / Supabase database
npm install          # also runs `prisma generate`
npm run db:migrate   # creates the tables and seeds them
npm run dev          # http://localhost:3000
```

Sign in with `admin@example.com` / `admin12345` and change the password under Setup → Users.

User manual: `npm run manual` opens it in Microsoft Edge (pages and links in `docs/manual/README.md`).

Other commands: `npm run db:reset` (wipe and reseed), `npm run db:studio` (browse the data),
`npm run typecheck`, `npm run lint`, `npm run build`.

## Layout

```
prisma/schema.prisma        all tables (core + modules)
prisma/seed.ts              Administrator role, admin login, sample inventory
src/proxy.ts                sends visitors without a session cookie to /login
src/core/                   shared plumbing
  auth/                     sessions, passwords, requireUser / requirePermission / can
  audit.ts                  audit() — call on every write
  forms.ts                  ActionState, zod helpers (decimalString, checkbox, stringList)
  settings.ts, format.ts, db.ts
src/modules/
  registry.ts               the list of installed modules
  <module>/module.ts        name, permissions, menu links
  <module>/actions.ts       server actions (writes)
  <module>/queries.ts       read helpers
src/app/(app)/<module>/     the module's pages
src/components/ui/          buttons, form fields, tables, cards
```

## Rules the code follows

1. **Check permissions on the server.** Every page and server action starts with
   `requirePermission("<module>.<thing>")`. Hiding a button is not security.
2. **Audit every write.** Call `audit({...}, tx)` inside the same transaction as the change.
3. **Money and quantities are Decimals.** They arrive as strings (`decimalString()`), go to Prisma
   as strings and are calculated with `Prisma.Decimal`, never JS numbers.
4. **Stock is a ledger.** On-hand = sum of `StockMovement.qty`. Movements are never edited;
   fix mistakes with an adjustment. Stock cannot go below zero.

## Branches, numbering, Excel and attachments

- **Branches** (Setup → Branches). Every warehouse belongs to a branch, and users are assigned branches on
  their user page. People only see warehouses, stock and movements of their branches; the permission
  "See all branches" lifts that. The picker in the title bar narrows lists to one branch.
- **Document numbering** (Setup → Document numbering). Stock movements are numbered like
  `MOV-MNL-2026-000123`, per branch and per year. Admins can change the prefix, digits, and whether the
  counter is per branch / restarts yearly. Numbers are taken inside the saving transaction, so they never skip.
  Custom modules get the same with an **Auto number** field.
- **Excel**. Every list has EXPORT (the rows matching the current search). Products, warehouses, stock
  movements (e.g. opening stock) and custom-module records have IMPORT with a downloadable template.
  An import is all-or-nothing: any bad row cancels the whole file and every problem is listed.
- **Attachments**. Products, warehouses and custom records have an Attachments tab (10 MB per file).
  Files live in `STORAGE_DIR` (default `./storage/attachments`); back that folder up with the database.
  Downloads require the same permission as the record and are always served as downloads, never as pages.

## Sales, receivables and the business dashboard

- **Sales** (customers, invoices, payments received, receivables). Posting an invoice issues its stock (one ISSUE
  movement per line, referenced by the invoice number) and snapshots each product's cost, so gross margin is
  fixed at posting. Invoices are never edited: an unpaid one can be voided, which receives the stock back.
  Payments settle one invoice each (partial payments allowed, never more than is owed).
- **Finance → Cash book**: cash in and out other than customer payments (opening balance, expenses, payroll,
  supplier payments…). Customer payments show up in it automatically.
- **Finance → Business dashboard** (`finance.view`): revenue, gross profit and margin against the previous period,
  receivables with aging and top debtors, cash balance and 12-month cash flow, inventory value at cost and days of
  stock, top products and customers, sales by branch. It follows the branch picked in the title bar.
  Calculations live in `src/modules/finance/dashboard.ts`.
- Figures: revenue = posted invoice subtotals (net of VAT); gross profit = revenue − cost at posting;
  cash = payments (net of tax withheld) + cash in − cash out. Roles "Sales Clerk" and "Finance" are seeded as starting points.

## Accounting: general ledger, statements and audit trail

- **Double entry, automatic.** Every posting writes a balanced journal entry in the same transaction as its document:
  invoice (Dr receivable / Cr sales, Dr cost of goods sold / Cr inventory), payment (Dr cash / Cr receivable),
  cash book entry (cash against the category's account, see `CASH_CATEGORY_ACCOUNTS`), stock movements (receipts
  against payables, or opening balance equity when the reference is `OPENING`; issues and adjustments against
  inventory adjustments; transfers between branches through inter-branch clearing) and product cost changes
  (stock on hand revalued). Code: `src/modules/accounting/ledger.ts`.
- **Reports** (Accounting menu): income statement, balance sheet, trial balance, general ledger with running balance,
  journal entries, all per branch (title-bar picker) and exportable to Excel. Every ledger line links to the document
  that posted it, and invoices list their entries.
- **Chart of accounts**: starts with a Philippine trading chart (incl. Input/Output VAT and withholding accounts for the
  tax phase). Grouping follows the codes: 1 assets, 2 liabilities, 3 equity, 40–48 revenue, 49 other income,
  5 cost of sales, 6–9 expenses. System accounts can be renamed but keep their type.
- **Manual journals** for accruals, corrections and opening balances; receivables and inventory are off limits
  (their balances come from their records). Posted entries are reversed, never edited.
- **Period close** (Accounting → Periods): months close in order once they have ended; a closed month takes no
  postings from any module. Reopening is audited.
- **Enforced by the database** (migration `20261029120000_ledger_audit`): journal entries must balance, nothing may
  be dated in a closed month, and posted records (journals, stock movements, payments, cash entries, invoice lines,
  the audit log) can never be updated or deleted; invoices can only change from POSTED to VOID.
- **Tamper-evident audit log**: each entry stores a SHA-256 fingerprint over its content and the previous entry's
  fingerprint. Setup → Audit log → “Verify” (SQL: `SELECT * FROM audit_verify()`) reports the first altered entry.
  The chain is extended one transaction at a time, so audited writes are serialised.
- Documents posted before the ledger existed are journalled by `npx tsx --conditions=react-server prisma/ledger-backfill.ts`
  (safe to re-run).
- Strata keeps **internal records**: official BIR invoices still come from the registered system. Sales and purchases carry
  VAT and withholding; see "BIR compliance" below.

## Purchasing and payables

Purchasing menu: purchase orders, receiving reports, supplier bills, payments made, payables, suppliers.
Code: `src/modules/purchasing/` (posting rules in `posting.ts`), pages under `src/app/(app)/purchasing/`.

- **Flow**: purchase order → receive (one or more receiving reports) → supplier bill → payment. Amounts on lines are
  **net of VAT**; each line has a VAT code (VATable 12%, zero-rated, exempt). Non-VAT suppliers never carry input VAT.
- **Receiving** brings stock in today at the PO cost. The product's cost becomes the **moving average** of what was on
  hand and what arrived, and stock on hand is revalued, so inventory in the books stays equal to quantity × cost.
  Ledger: Dr Inventory / Cr **Goods received not invoiced** (GRNI, account 2050, added by migration `20261106090000_purchasing`).
- **Supplier bills** (AP vouchers, `APV-…`) bill received goods at PO cost and/or direct expenses to any non-control
  account. Ledger: Dr GRNI / expenses + Dr Input VAT / Cr Accounts payable (per supplier). The supplier's invoice
  number is required and cannot be entered twice. Price differences go on an expense line. Unpaid bills can be voided.
  Opening payables: enter a bill with an expense line against Opening balance equity.
- **Payments made** (check vouchers, `CV-…`) settle one or more bills of one branch. Expanded withholding (EWT) is
  the bill's rate on the paid share of its net-of-VAT amount; the last payment takes what is left so it adds up exactly.
  Ledger: Dr AP / Cr Cash (net) / Cr Withholding taxes payable. They show in the cash book and dashboard as cash out.
- AP and GRNI are now control accounts: manual journals cannot post to them.
- **Database guards**: purchase orders only change status; bills only go POSTED → VOID; lines, receipts and payments
  are append-only.
- **Check script**: `npx tsx --conditions=react-server prisma/purchasing-check.ts` runs the whole cycle against the
  database inside one transaction and rolls it back (nothing is saved); 25 checks of costs, VAT, EWT and balances.

## BIR compliance

- **VAT on sales**: invoice lines are net of VAT, each with a VAT code (VATable 12%, zero-rated, exempt; default from
  the customer). `SalesInvoice` keeps subtotal, vat and total (DB check: total = subtotal + vat). Ledger: Dr AR (total) /
  Cr Sales (subtotal) + Cr Output VAT. Invoices from before this change are EXEMPT with no VAT (migration
  `20261106150000_bir_compliance`).
- **Creditable withholding received (Form 2307)**: a payment's amount is what the invoice is reduced by; `cwt` is the
  part the customer withheld (suggested from the customer's rate on the net-of-VAT share). Ledger: Dr Cash
  (amount − cwt) + Dr CWT / Cr AR. The cash book and dashboard count only the cash.
- **BIR menu** (`tax.view`, granted by the migration to every role with `accounting.view`): general journal, general
  ledger, cash receipts and disbursements books, sales and purchases books (date range); SLS, SLP, 2550Q, 1601-EQ /
  QAP, SAWT and Form 2307 (quarter). Each report shows ✓ / ⚠ checks against the ledger and for missing TINs, and
  exports to Excel with the company heading. SLS and SLP also download as BIR RELIEF .DAT files (needs the company
  TIN and RDO code under Company settings; validate with the BIR module before submitting).
- **Form 2307** prints per supplier and quarter at `/print/form-2307/<supplierId>?f_q=2026-Q4`.
- **CAS readiness** (BIR → CAS readiness): live checks for gaps in every document series, the database triggers that
  refuse edits and deletes, the audit chain and a balanced ledger; exports the audit trail with its hashes.
- Code: `src/core/tax.ts` (codes, ATCs, quarters; safe for client forms), `src/core/tax-math.ts`,
  `src/modules/tax/` (reports, catalog, export, CAS checks), pages under `src/app/(app)/tax/`.
- Check: `npx tsx --conditions=react-server prisma/bir-check.ts` posts VAT invoices and payments with withholding in
  one rolled-back transaction, then runs every BIR report read-only on the real data.
- Not yet tracked: input VAT carried over, VAT on imports, capital goods, VAT withheld by government customers;
  QAP and SAWT are Excel only.

## Printed documents

Every document has a printable page under `/print/…` (opened in a new tab by the **Print** button on the
document): sales invoice, payment receipt, statement of account, purchase order, receiving report, AP voucher,
check voucher, stock movement slip (rows of Inventory → Movements open it) and journal voucher.

- Shared frame: `src/components/print/document.tsx` (letterhead from Company settings + Branding, facts,
  signatures, footer); styles in `src/app/print/print.css`; toolbar with paper size (A4, Letter, Legal,
  remembered per computer) and **Print / Save as PDF** (the browser's print dialog).
- Paper is always white; the brand shows through the logo, typefaces and title-bar colour. Page numbers come
  from `@page` margin boxes (Edge / Chrome).
- Amounts in words: `src/core/words.ts` ("… Pesos and 50/100 Only").
- Sales documents carry "Internal copy" and a note that they are not BIR-registered invoices or receipts, since
  Strata is not CAS-registered yet.
- Each print page checks the same permission and branch access as the document page.

## Custom modules (no code)

Administrators with **Build and change custom modules** can create modules under
Setup → Modules. A module has one or more record types (e.g. Vehicles, Trips), each with
its own fields. The app generates the list,
form and menu link at `/m/<module>/<record type>`; "Show in menu" puts those links in its own menu or inside a built-in one, optionally in a named ► submenu shared with other modules (e.g. SETUP ► Inventory / WMS ► Item Master) and adds three permissions per module
(`custom.<slug>.view`, `.manage`, `.approve`) to the Roles screen. Records are stored as JSON in
`CustomRecord`, so no migration is needed. Removing a field hides its values without deleting them,
and a module or record type that still has records cannot be removed (deactivate the module instead).

What the builder offers (all in `src/modules/custom/`):

- **Field types**: text, long text, number, decimal, money, percent, date, date & time, yes/no, choice list,
  multiple choice, email, phone, URL, file, auto number, section heading, calculated (formula), and lookup to
  built-in lists (products, warehouses, customers, item types, item classes, branches, users) or any record type.
- **Per field**: required, default value (`today` for dates), unique, show in list, searchable, help text,
  lock after creation, "show only when" another field has given values, and for lookups a filter on another
  field (Item Class by Item Type) — `lookups.ts` lists each target's filterable attributes.
- **Formulas** (`formula.ts`): a small parsed language (no `eval`) for calculated fields and rules:
  `+ - * / %`, comparisons, `and / or / not`, `round floor ceil abs min max if empty len days`.
- **Per record type**: one-page or tabbed form, rules every saved or imported record must pass
  (e.g. `price >= cost`), and approval (maker-checker: new and changed records are Pending until a different
  user with the approve permission decides; lookups only offer approved records).
- **Related records**: a lookup from record type B to A lists B's records on A's page, or, with
  "Edit as lines", shows them as an editable grid inside A's form saved with A (`lines.ts`).

Anything that posts to the ledger or stock belongs in a code module, described next.

## Adding a code module (example: Sales)

1. Add tables to `prisma/schema.prisma`, then `npm run db:migrate -- --name sales`.
2. Create `src/modules/sales/module.ts` with its permissions and nav links, and add it to `BUILT_IN_MODULES`
   in `src/modules/registry.ts`. The menu and the Roles screen pick it up automatically.
3. Write `src/modules/sales/actions.ts` (validate with zod, `requirePermission`, transaction, `audit`).
4. Add pages under `src/app/(app)/sales/`.

## Moving to PostgreSQL / Supabase

SQLite is fine for building and trying things; use PostgreSQL (e.g. Supabase) before real data or several users.
Existing data is copied with the scripts in `prisma/transfer/`:

1. While still on SQLite: `npx tsx prisma/transfer/dump.ts` (writes `prisma/transfer/data.json`).
2. In `prisma/schema.prisma`, set `provider = "postgresql"` and add `directUrl = env("DIRECT_URL")`.
   Put `DATABASE_URL` and `DIRECT_URL` in `.env` (see `.env.example`).
3. Move `prisma/migrations` aside and run `npm run db:migrate -- --name init`.
4. `npx tsx prisma/transfer/load.ts`, check the app, then delete `prisma/transfer/data.json`.
5. Copy `storage/attachments` along if the app moves to another server.
