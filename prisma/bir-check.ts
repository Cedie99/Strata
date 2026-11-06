// End-to-end check of VAT on sales and creditable withholding received (Form 2307), then a read-only run
// of every BIR report on the real data. The postings run in ONE transaction that is rolled back.
// Run: npx tsx --conditions=react-server prisma/bir-check.ts
import { Prisma } from "@prisma/client";
import { db } from "@/core/db";
import { recordMovement } from "@/modules/inventory/posting";
import { postInvoice, postPayment, voidInvoice } from "@/modules/sales/posting";
import { REPORTS } from "@/modules/tax/catalog";
import { auditChain, ledgerBalanced, protectedTables, seriesGaps } from "@/modules/tax/cas";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const yes = () => true;
class Rollback extends Error {}
let failures = 0;
function check(label: string, actual: Prisma.Decimal.Value, expected: Prisma.Decimal.Value) {
  const ok = D(actual).equals(D(expected));
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${D(actual).toString()}${ok ? "" : ` (expected ${D(expected).toString()})`}`);
}
function truthy(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}

async function balance(tx: Prisma.TransactionClient, key: string, where: Prisma.JournalLineWhereInput) {
  const { _sum } = await tx.journalLine.aggregate({ where: { ...where, account: { systemKey: key } }, _sum: { debit: true, credit: true } });
  return (_sum.debit ?? D(0)).minus(_sum.credit ?? D(0));
}

async function main() {
  const admin = await db.user.findFirstOrThrow({ where: { roles: { some: { role: { permissions: { some: { permission: "*" } } } } } } });
  const warehouse = await db.warehouse.findFirstOrThrow({ where: { isActive: true } });
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  await db
    .$transaction(
      async (tx) => {
        const u = admin.id;
        const product = await tx.product.create({ data: { sku: `ZZ-BIR-${Date.now()}`, name: "BIR check", cost: 100, price: 150 } });
        const customer = await tx.customer.create({ data: { code: `ZZB${Date.now() % 100000}`, name: "Test Customer", tin: "123-456-789-00000", cwtRate: 1, cwtAtc: "WC158" } });
        const opening = await recordMovement(tx, u, { type: "RECEIPT", productId: product.id, warehouseId: warehouse.id, qty: "20", reference: "OPENING", note: "" }, yes);
        if ("error" in opening) throw new Error(opening.error);

        // 4 VATable @150, 2 zero-rated @150, 1 exempt @100
        const inv = await postInvoice(
          tx,
          u,
          {
            customerId: customer.id,
            warehouseId: warehouse.id,
            date: today,
            dueDate: "",
            reference: "SI-0001",
            note: "",
            lines: [
              { productId: product.id, qty: "4", unitPrice: "150", vatCode: "VAT" },
              { productId: product.id, qty: "2", unitPrice: "150", vatCode: "ZERO" },
              { productId: product.id, qty: "1", unitPrice: "100", vatCode: "EXEMPT" },
            ],
          },
          yes,
        );
        check("invoice net", inv.subtotal, 1000);
        check("invoice VAT (12% of 600)", inv.vat, 72);
        check("invoice total", inv.total, 1072);
        check("sales credited net", (await balance(tx, "SALES", { entry: { sourceId: inv.id } })).negated(), 1000);
        check("output VAT credited", (await balance(tx, "OUTPUT_VAT", { entry: { sourceId: inv.id } })).negated(), 72);
        check("receivable debited gross", await balance(tx, "AR", { customerId: customer.id }), 1072);

        // Half paid with 1% withheld on the net share: 536 applied → net share 500 → CWT 5.00
        const p1 = await postPayment(tx, u, { invoiceId: inv.id, date: today, amount: "536", cwt: "5", atc: "", method: "CHECK", reference: "CHK-1", note: "" }, yes);
        check("payment ATC from customer", p1.atc === "WC158" ? 1 : 0, 1);
        check("cash debited net of CWT", await balance(tx, "CASH", { entry: { sourceId: p1.id } }), 531);
        check("CWT debited", await balance(tx, "CWT", { entry: { sourceId: p1.id } }), 5);
        check("receivable after first payment", await balance(tx, "AR", { customerId: customer.id }), 536);
        const tooMuchTax = await postPayment(tx, u, { invoiceId: inv.id, date: today, amount: "10", cwt: "11", atc: "", method: "CASH", reference: "", note: "" }, yes).then(
          () => "allowed",
          (e: Error) => e.message,
        );
        truthy("withholding more than the amount is refused", tooMuchTax !== "allowed", tooMuchTax);
        await postPayment(tx, u, { invoiceId: inv.id, date: today, amount: "536", cwt: "5", atc: "WC158", method: "CASH", reference: "", note: "" }, yes);
        check("invoice settled", await balance(tx, "AR", { customerId: customer.id }), 0);
        check("total CWT", await balance(tx, "CWT", { customerId: customer.id }), 10);

        // A second invoice voided: VAT reverses with it
        const inv2 = await postInvoice(
          tx,
          u,
          { customerId: customer.id, warehouseId: warehouse.id, date: today, dueDate: "", reference: "", note: "", lines: [{ productId: product.id, qty: "1", unitPrice: "200", vatCode: "VAT" }] },
          yes,
        );
        check("second invoice VAT", inv2.vat, 24);
        await voidInvoice(tx, u, inv2.id, yes);
        check("output VAT after void", (await balance(tx, "OUTPUT_VAT", { customerId: customer.id })).negated(), 72);

        const guard = await tx.$executeRaw`UPDATE "SalesInvoice" SET "vat" = 0 WHERE "id" = ${inv.id}`.then(
          () => "allowed",
          (e: Error) => e.message,
        );
        truthy("posted invoice VAT cannot be edited in the database", guard !== "allowed");
        throw new Rollback();
      },
      { timeout: 120_000 },
    )
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  // A failed statement aborts the transaction, so the guard check above must be the last one inside it.

  console.log("\nBIR reports on the live data (read-only):");
  const branchIds = (await db.branch.findMany({ select: { id: true } })).map((b) => b.id);
  const q = `${today.getFullYear()}-Q${Math.floor(today.getMonth() / 3) + 1}`;
  for (const [key, def] of Object.entries(REPORTS)) {
    const params: Record<string, string> = def.period === "quarter" ? { f_q: q } : { f_from: `${today.getFullYear()}-01-01` };
    const r = await def.build(branchIds, params);
    const rows = r.sections.reduce((s, x) => s + x.rows.length, 0);
    const failed = (r.checks ?? []).filter((c) => !c.ok && /ledger/i.test(c.label));
    truthy(`${key}: ${rows} row(s)`, failed.length === 0, failed.map((c) => c.detail).join("; "));
    if (def.dat) {
      const f = await def.dat(branchIds, params);
      truthy(`${key} data file ${f.name}`, f.body.startsWith(key === "sls" ? "H,S," : "H,P,"));
    }
  }
  const [series, tables, chain, ledger] = await Promise.all([seriesGaps(), protectedTables(), auditChain(), ledgerBalanced()]);
  truthy("series without gaps", series.every((s) => s.ok), series.filter((s) => !s.ok).map((s) => `${s.name}: ${s.gaps.slice(0, 3).join(", ")}`).join("; "));
  truthy("protected tables", tables.every((t) => t.ok), tables.filter((t) => !t.ok).map((t) => t.table).join(", "));
  truthy("audit chain intact", chain.firstBroken === null, `${chain.checked} entries`);
  truthy("ledger balanced", ledger.ok);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed; the test postings were rolled back.");
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => db.$disconnect());
