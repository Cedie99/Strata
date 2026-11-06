# Strata user manual

The user manual is a set of linked web pages (claude.ai Artifacts), one per group of related modules.
The HTML sources live in this folder and share `manual.css`. **The pages must always match the app.**

## Open it

`npm run manual` (or double-click `scripts/open-manual.cmd`) opens every page as tabs in Microsoft Edge.
`npm run manual -- -Page sales` opens matching pages only; `-List` prints the links. The script reads the
table below, so keep each row in the same `| Name | source | link | code |` shape.

## Pages

| Page | Source | Published link | Covers this code |
|---|---|---|---|
| Start here (system map, screen layout, lists, global rules) | `index.html` | https://claude.ai/artifact/FjQsMNTjouzEEMWKaHBr2R | `src/app/(app)/layout.tsx`, `menu-bar.tsx`, `src/app/(app)/page.tsx`, `src/components/ui/data-grid.tsx`, `src/modules/registry.ts`, `src/app/print/` and `src/components/print/` (printing section), anything that adds a module or changes how modules feed each other |
| Inventory | `inventory.html` | https://claude.ai/artifact/HVwFThwKEk3dgrNsgbihJL | `src/modules/inventory/`, `src/app/(app)/inventory/`, `src/modules/importers.ts` |
| Sales | `sales.html` | https://claude.ai/artifact/1q5sFEkd6sPa8QN9BhRm3S | `src/modules/sales/`, `src/app/(app)/sales/` |
| Purchasing | `purchasing.html` | https://claude.ai/artifact/C6XexWvG1Ki87tK426vcRu | `src/modules/purchasing/`, `src/app/(app)/purchasing/` |
| Finance & Accounting | `finance.html` | https://claude.ai/artifact/9YoCs44j8zgkPhZ5j7tSrd | `src/modules/finance/`, `src/modules/accounting/`, `src/app/(app)/finance/`, `src/app/(app)/accounting/`, chart of accounts in migrations |
| BIR | `bir.html` | https://claude.ai/artifact/UZgxZToK9b12bvYCzKnUeq | `src/modules/tax/`, `src/app/(app)/tax/`, `src/app/print/form-2307/`, `src/core/tax.ts`, `src/core/tax-math.ts`, VAT / withholding fields in Sales and Purchasing |
| Approvals | `approvals.html` | https://claude.ai/artifact/E2qB5FBAt7r3qLd7WJcT7a | `src/modules/approvals/`, `src/app/(app)/approvals/`, `src/components/approval-trail.tsx`, every action that calls `submit()` |
| Setup & Security | `setup.html` | https://claude.ai/artifact/6MK6oVvrG6ooT3SZCH3PgK | `src/modules/admin/`, `src/app/(app)/admin/`, `src/core/auth/`, `src/core/branding.ts`, `src/core/numbering.ts`, every module's permission list |
| Custom modules | `custom.html` | https://claude.ai/artifact/F5Zjqr7dpQ7BzEndXZWTRW | `src/modules/custom/`, `src/app/(app)/m/`, `src/app/(app)/admin/modules/` |

## Keeping it current

When a change adds, removes or alters something a user sees or does (a screen, field, button, menu item,
permission, document number, posting rule, or how modules connect):

1. Update every page in the table whose "Covers this code" matches, plus `index.html` if modules or their
   connections changed. Cross-cutting facts repeat on several pages (permissions list on Setup, "What feeds what"
   on Start here, "What posts where" on Finance): update each copy.
2. A new module gets a new page (copy the structure of an existing one), a link in the page bar of **every**
   page, a card under "Manual pages" in `index.html`, and a row in this table.
3. Change the "updated" date in the footer of each page you touched.
4. Republish each changed page to its link: Artifact publish with `file_path` = the source, `url` = the link above,
   and `files` = `{"manual.css": "docs/manual/manual.css"}`. If `manual.css` changed, republish every page.
5. Write only what the app does today; mark planned things as planned.
