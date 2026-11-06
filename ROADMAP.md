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

**2. BIR compliance** (the strongest local selling point)
- [ ] VAT on sales and purchases: VATable 12%, zero-rated, exempt; amounts shown net / VAT / gross
      (purchases side done 2026-11-06; sales invoices still have no VAT)
- [ ] Withholding: EWT on supplier payments; creditable withholding received from customers (Form 2307)
      (EWT on supplier payments done 2026-11-06; customer side still to do)
- [ ] Books of accounts: general journal, general ledger, cash receipts book, cash disbursements book, sales and purchases books
- [ ] Summary lists: SLS / SLP (sales and purchases), exportable in BIR format
- [ ] Return worksheets: 2550Q (quarterly VAT), 1601-EQ / QAP, SAWT
- [ ] Form 2307 printing for suppliers
- [ ] Readiness for BIR CAS/CBA registration: no gaps in series, no deletes, system documentation, audit trail export

**3. Branded printed / PDF documents** (uses the Branding page)
- [ ] Print layout with company logo, name, address, TIN and brand colours
- [ ] Sales invoice, payment receipt, statement of account
- [ ] Purchase order, receiving report, supplier bill voucher, payment voucher (check voucher)
- [ ] Stock movement / delivery receipt, journal voucher
- [ ] "Print / Save as PDF" button on every document page

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
