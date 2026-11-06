# Strata roadmap

What we plan to build to make Strata worth buying, in priority order. Tick a box (`[x]`) when an item is
built, migrated and checked in the app; add the date. Market assumption: Philippine companies (VAT-registered,
BIR rules), sold first as one installation per client.

## Done

- [x] Branding CMS — Setup → Branding: system name, tagline, logo (also the browser tab icon), typefaces,
      colour palette with live preview and contrast check, reset to defaults (2026-11-06)

## Tier 1 — buyers will ask for these first

**1. Purchasing and accounts payable** (completes the buy → stock → pay cycle) — built 2026-11-06
- [x] Suppliers (code, TIN, address, terms, VAT status, default withholding rate) (2026-11-06)
- [x] Purchase orders (open → partly / fully received; close short or cancel) (2026-11-06) — approval step comes with item 4
- [x] Receiving against a PO (stock comes in at PO cost, moving-average cost; partial receipts) (2026-11-06)
- [x] Supplier bills (from receipts or direct expenses), due dates from terms, duplicate invoice check (2026-11-06)
- [x] Supplier payments (partial, several bills, withholding deducted at payment) (2026-11-06)
- [x] Payables aging and supplier statement of account (2026-11-06)
- [x] Ledger postings: inventory against GRNI on receipt; GRNI / expense + input VAT against AP on the bill;
      AP against cash + EWT payable on payment (2026-11-06)
- [ ] Try the full cycle in the app with real users (buy, receive, bill, pay) and sign off

**2. BIR compliance** (the strongest local selling point) — built 2026-11-06
- [x] VAT on sales and purchases: VATable 12%, zero-rated, exempt; amounts shown net / VAT / gross (2026-11-06)
- [x] Withholding: EWT on supplier payments; creditable withholding received from customers (Form 2307) (2026-11-06)
- [x] Books of accounts: general journal, general ledger, cash receipts book, cash disbursements book, sales and purchases books (2026-11-06)
- [x] Summary lists: SLS / SLP, exportable to Excel and as BIR RELIEF data files (.DAT) (2026-11-06)
- [x] Return worksheets: 2550Q (quarterly VAT), 1601-EQ / QAP, SAWT, with checks against the ledger (2026-11-06)
- [x] Form 2307 printing for suppliers, per quarter (2026-11-06)
- [x] Readiness for BIR CAS/CBA registration: series gap check, protected-record check, audit trail verify and export, system documentation link (2026-11-06)
- [ ] Validate the SLS / SLP .DAT files with the BIR validation module; QAP / SAWT data files once the exact layout is confirmed
- [ ] Not tracked yet: input VAT carried over, VAT on imports, capital goods, VAT withheld by government customers
- [ ] Try a full quarter with real data (invoices with VAT, payments with 2307, supplier withholding) and sign off

**3. Branded printed / PDF documents** (uses the Branding page) — built 2026-11-06
- [x] Print layout with company logo, name, address, TIN and brand colours; A4 / Letter / Legal; page numbers;
      amount in words; signature lines; "printed by" footer (2026-11-06)
- [x] Sales invoice, payment receipt, statement of account (2026-11-06) — marked "Internal copy, not a BIR-registered invoice"
- [x] Purchase order, receiving report, AP voucher, check / disbursement voucher (2026-11-06)
- [x] Stock movement slip (receipt, issue, adjustment, transfer), journal voucher (2026-11-06)
- [x] "Print / Save as PDF" on every document page (2026-11-06)
- [ ] Print payment receipt, AP voucher and check voucher once real ones exist, and sign off the layouts on paper

**4. Configurable approval workflows**
- [ ] Approval rules per document type: who approves, amount thresholds, one or more levels in order
- [ ] Maker-checker: the creator can never approve their own document
- [ ] "Waiting for my approval" inbox with approve / reject and a reason
- [ ] Rules from the compliance plan: manual journals, voids, payment reversals, cash out over a limit,
      below-cost / high-discount sales, credit-limit breaches, purchase orders over a limit
- [ ] Approval history on each document and in the audit log

## Tier 2 — moves Strata up from small to mid-size clients

- [ ] Dashboards and self-service reports: saved filters, scheduled email reports
- [ ] Notifications (in-app and email): approvals waiting, low stock, overdue invoices and bills, month-end close
- [ ] Security: two-factor sign-in, Google / Microsoft sign-in, password policy, active sessions, IP allowlist
- [ ] HR and payroll (PH): employee files, attendance, payroll with SSS / PhilHealth / Pag-IBIG / withholding tax, Form 2316
- [ ] Barcode and mobile stock work: scanning for receiving, transfers and counts on a phone

## Tier 3 — needed to sell Strata as a hosted service

- [ ] Decide: one installation per client, or one shared installation for many companies (multi-tenant)
- [ ] Multi-tenancy (if chosen): company id on every record, sign-up and setup wizard
- [ ] Subscriptions and licensing: plans, user-seat limits, modules switched on per client
- [ ] Public API and webhooks (e-commerce, banks, POS)
- [ ] Self-service backup: full export and restore

## Self-service — no developer needed

The product goal: a subscriber sets up, changes, fixes and grows Strata on their own, paying once or monthly,
without hiring the ERP's developers. Grouped by the reason companies usually call a developer.
Suggested build order: S1 → S7 (approval workflows, Tier 1 item 4, comes first).

**S1. "We can't set it up ourselves" — guided self-onboarding**
- [ ] Setup wizard with a business profile: multiple-choice questions (what you do, stock, branches, credit,
      VAT, withholding agent, approvals, payroll) → recommended modules, business-flow diagram, roles,
      numbering and settings, each with the reason; one-click apply; can be retaken later (rule-based, no AI)
- [ ] Industry templates: trading, retail, distribution, services, restaurant, construction (chart of
      accounts, roles, numbering, custom fields, sample reports)
- [ ] Data migration kit: Excel templates for opening balances, open invoices and bills, stock counts,
      customers and suppliers; plain-language validation; totals reconciled against the old system
- [ ] Setup progress bar: what is still missing (RDO code, TINs, opening stock …) with links to fix it

**S2. "We need a small change" — no-code customization**
- [ ] Custom fields on built-in records (invoices, customers, products, POs …)
- [ ] Report builder: record type, columns, filters, grouping, totals; save, share, schedule by email
- [ ] Field rules: required, read-only by role, defaults, dropdown lists
- [ ] Document designer: drag fields, terms and footers on invoice, PO, receipt and voucher layouts
- [ ] Rules and automations builder ("when … then notify / require approval / email")
- [ ] Custom dashboards: each user adds KPI, chart and list widgets
- [ ] Visual approval workflow designer (builds on Tier 1 item 4)

**S3. "We don't know how to use it" — built-in self-help**
- [ ] Manual inside the app: a "?" on every screen opens the right manual section
- [ ] Guided tours for common tasks ("record a payment", "close a month")
- [ ] Plain-language errors that always say what to do next
- [ ] Sandbox / training company with sample data
- [ ] Short video library per task

**S4. "Something looks wrong" — self-diagnosis**
- [ ] Health check page: unbalanced items, receipts not billed for 30+ days, negative margins, credit-limit
      breaches, missing TINs, open months; each with a "fix it" link
- [ ] Reconciliation tools: bank reconciliation; AR / AP / inventory sub-ledgers against their control accounts
- [ ] Drill-down from any report total to the documents behind it
- [ ] Guided corrections (void, credit note, reversal) instead of database fixes

**S5. "We need it to talk to other systems" — self-service integrations**
- [ ] Bank statement import and matching (CSV from local banks)
- [ ] E-commerce and POS connectors (Shopify, Lazada, Shopee, POS)
- [ ] API keys and webhooks managed by the admin (see Tier 3 public API)
- [ ] Scheduled imports and exports

**S6. "We're growing" — scale without a project**
- [ ] Add a branch, warehouse or company in minutes; multi-company with consolidation
- [ ] Module marketplace inside the app: switch on Payroll, Manufacturing, Fixed assets, Projects
- [ ] Seat and plan management by the subscriber

**S7. "We're afraid to rely on it" — trust and support without a developer**
- [ ] Download all my data (Excel / CSV) at any time; self-service backup and restore
- [ ] Automatic updates with plain-language release notes; custom fields and reports never break
- [ ] Regulation updates delivered automatically (BIR forms and rates, SSS / PhilHealth / Pag-IBIG tables)
- [ ] Status page and in-app announcements
- [ ] Two-person rule and logging for dangerous admin actions (reopen period, delete custom field)
- [ ] In-app support ticket / chat with the screen, record and error attached automatically
- [ ] Knowledge base and community forum
- [ ] Optional paid services: data migration and training packages
