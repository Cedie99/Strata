// End-to-end check of approval workflows: rules, maker-checker, levels in order, approve → posted,
// reject and withdraw → nothing posted, voids, cash out, sales rules and the database guards.
// Every query (the app's own included) runs in ONE transaction that is rolled back, so nothing is saved:
// the shared Prisma client is replaced by a proxy that sends queries to that transaction.
// Run: npx tsx --conditions=react-server prisma/approvals-check.ts
import { Prisma, PrismaClient } from "@prisma/client";
import type { CurrentUser } from "@/core/auth/guard";

const real = new PrismaClient({ transactionOptions: { timeout: 300_000, maxWait: 20_000 } });
let active: Prisma.TransactionClient | null = null;
const proxy: PrismaClient = new Proxy(real, {
  get(target, key) {
    const client = (active ?? target) as unknown as Record<string | symbol, unknown>;
    if (active && key === "$transaction") return (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(proxy) : Promise.all(arg as Promise<unknown>[]));
    const v = client[key];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(client) : v;
  },
});
(globalThis as unknown as { prisma: PrismaClient }).prisma = proxy;

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
class Rollback extends Error {}
let failures = 0;
function truthy(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `: ${detail}` : ""}`);
}
const today = new Date();
const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

async function main() {
  const { submit, decide, withdraw, waitingFor } = await import("@/modules/approvals/engine");
  const all = { mayUse: () => true };

  await real
    .$transaction(
      async (tx) => {
        active = tx;
        const stamp = Date.now() % 1_000_000;
        const admin = await tx.user.findFirstOrThrow({ where: { roles: { some: { role: { permissions: { some: { permission: "*" } } } } } }, include: { roles: { include: { role: true } } } });
        const maker: CurrentUser = { id: admin.id, email: admin.email, name: admin.name, roles: admin.roles.map((r) => r.role.name), permissions: new Set(["*"]) };
        const roleA = await tx.role.create({ data: { name: `ZZ Approver A ${stamp}` } });
        const roleB = await tx.role.create({ data: { name: `ZZ Approver B ${stamp}` } });
        const mkUser = async (name: string, roleId: string): Promise<CurrentUser> => {
          const u = await tx.user.create({ data: { email: `${name}.${stamp}@test.invalid`, name, passwordHash: "x", roles: { create: { roleId } } } });
          return { id: u.id, email: u.email, name, roles: [], permissions: new Set() };
        };
        const alice = await mkUser("Alice", roleA.id);
        const bob = await mkUser("Bob", roleB.id);

        const warehouse = await tx.warehouse.findFirstOrThrow({ where: { isActive: true } });
        const product = await tx.product.create({ data: { sku: `ZZ-APR-${stamp}`, name: "Approval check", cost: 100, price: 200 } });
        const supplier = await tx.supplier.create({ data: { code: `ZZA${stamp}`, name: "Approval Supplier", ewtRate: 0 } });
        const customer = await tx.customer.create({ data: { code: `ZZC${stamp}`, name: "Approval Customer", creditLimit: 1000 } });
        const { recordMovement } = await import("@/modules/inventory/posting");
        const opening = await recordMovement(tx, admin.id, { type: "RECEIPT", productId: product.id, warehouseId: warehouse.id, qty: "100", reference: "OPENING", note: "" }, () => true);
        if ("error" in opening) throw new Error(opening.error);

        await tx.approvalRule.create({ data: { name: "Large POs", trigger: "PO_AMOUNT", threshold: 1000, levels: { create: [{ level: 1, roleId: roleA.id }, { level: 2, roleId: roleB.id }] } } });
        await tx.approvalRule.create({ data: { name: "Below cost", trigger: "SALE_BELOW_COST", levels: { create: [{ level: 1, roleId: roleA.id }] } } });
        await tx.approvalRule.create({ data: { name: "Credit limit", trigger: "CREDIT_LIMIT", levels: { create: [{ level: 1, roleId: roleB.id }] } } });
        await tx.approvalRule.create({ data: { name: "Voids", trigger: "INVOICE_VOID", levels: { create: [{ level: 1, roleId: roleA.id }] } } });
        await tx.approvalRule.create({ data: { name: "Cash out", trigger: "CASH_OUT_AMOUNT", threshold: 5000, levels: { create: [{ level: 1, roleId: roleA.id }] } } });
        await tx.approvalRule.create({ data: { name: "Journals", trigger: "MANUAL_JOURNAL", levels: { create: [{ level: 1, roleId: roleB.id }] } } });

        const po = (qty: string) => ({
          supplierId: supplier.id, warehouseId: warehouse.id, date: ymd, expectedDate: "", reference: "", note: "",
          lines: JSON.stringify([{ productId: product.id, qty, unitCost: "100", vatCode: "VAT" }]),
        });
        const poCount = () => tx.purchaseOrder.count({ where: { supplierId: supplier.id } });

        // Below the limit: posted at once.
        const small = await submit("PurchaseOrder", po("5"), maker, all);
        truthy("PO under the limit is posted at once", "redirect" in small && small.posted);
        truthy("one PO exists", (await poCount()) === 1);

        // Over the limit: waits, nothing posted.
        const big = await submit("PurchaseOrder", po("20"), maker, all);
        truthy("PO over the limit waits for approval", "redirect" in big && !big.posted);
        truthy("still one PO (nothing posted yet)", (await poCount()) === 1);
        const req = await tx.approvalRequest.findFirstOrThrow({ where: { kind: "PurchaseOrder", requestedById: maker.id, status: "PENDING" }, include: { steps: true }, orderBy: { requestedAt: "desc" } });
        truthy("request numbered and has two steps", /^APR-/.test(req.number) && req.steps.length === 2, req.number);
        truthy("amount is the PO total with VAT", req.amount.equals(D(2240)), req.amount.toString());
        truthy("Alice sees it in her inbox", (await waitingFor(alice, [warehouse.branchId])).some((r) => r.id === req.id));
        truthy("Bob does not (not his step yet)", !(await waitingFor(bob, [warehouse.branchId])).some((r) => r.id === req.id));

        const self = await decide(req.id, maker, all, "APPROVE", "");
        truthy("the requester cannot approve", !!self?.error, self?.error);
        const early = await decide(req.id, bob, all, "APPROVE", "");
        truthy("level 2 cannot approve before level 1", !!early?.error, early?.error);
        const a1 = await decide(req.id, alice, all, "APPROVE", "ok");
        truthy("Alice approves level 1", !!a1?.ok, a1?.ok ?? a1?.error);
        truthy("still nothing posted after level 1", (await poCount()) === 1);
        const again = await decide(req.id, alice, all, "APPROVE", "");
        truthy("Alice cannot approve level 2 too", !!again?.error, again?.error);
        const b2 = await decide(req.id, bob, all, "APPROVE", "");
        truthy("Bob approves level 2 and it is posted", !!b2?.ok, b2?.ok ?? b2?.error);
        const done = await tx.approvalRequest.findUniqueOrThrow({ where: { id: req.id } });
        const posted = done.resultId ? await tx.purchaseOrder.findUnique({ where: { id: done.resultId } }) : null;
        truthy("request approved with the PO linked", done.status === "APPROVED" && !!posted, done.resultNumber);
        truthy("the PO is created by the requester", posted?.createdById === maker.id);
        truthy("two POs exist", (await poCount()) === 2);

        // Reject: reason required, nothing posted.
        await submit("PurchaseOrder", po("30"), maker, all);
        const r2 = await tx.approvalRequest.findFirstOrThrow({ where: { kind: "PurchaseOrder", status: "PENDING" } });
        const noReason = await decide(r2.id, alice, all, "REJECT", " ");
        truthy("rejecting needs a reason", !!noReason?.fieldErrors);
        const rej = await decide(r2.id, alice, all, "REJECT", "Too expensive");
        truthy("rejected", !!rej?.ok && (await tx.approvalRequest.findUniqueOrThrow({ where: { id: r2.id } })).status === "REJECTED");
        truthy("rejected PO was not posted", (await poCount()) === 2);

        // Withdraw.
        await submit("PurchaseOrder", po("40"), maker, all);
        const r3 = await tx.approvalRequest.findFirstOrThrow({ where: { kind: "PurchaseOrder", status: "PENDING" } });
        const notMine = await withdraw(r3.id, alice);
        truthy("only the requester can withdraw", !!notMine?.error);
        const wd = await withdraw(r3.id, maker);
        truthy("withdrawn, nothing posted", !!wd?.ok && (await poCount()) === 2);

        // Sales: below cost and over the credit limit.
        const inv = (price: string, qty = "1") => ({
          customerId: customer.id, warehouseId: warehouse.id, date: ymd, dueDate: "", reference: "", note: "",
          lines: JSON.stringify([{ productId: product.id, qty, unitPrice: price, vatCode: "VAT" }]),
        });
        const cheap = await submit("SalesInvoice", inv("90"), maker, all);
        truthy("sale below cost waits", "redirect" in cheap && !cheap.posted);
        const fine = await submit("SalesInvoice", inv("200"), maker, all);
        truthy("normal sale within the credit limit is posted", "redirect" in fine && fine.posted);
        const over = await submit("SalesInvoice", inv("200", "5"), maker, all);
        truthy("sale over the credit limit waits", "redirect" in over && !over.posted);
        const overReq = await tx.approvalRequest.findFirstOrThrow({ where: { kind: "SalesInvoice", status: "PENDING", reasons: { contains: "credit limit" } }, include: { steps: true } });
        truthy("credit-limit request goes to Bob's role", overReq.steps[0].roleId === roleB.id);

        // Void needs approval; a second request for the same void is refused.
        const posted1 = await tx.salesInvoice.findFirstOrThrow({ where: { customerId: customer.id, status: "POSTED" } });
        const v = await submit("InvoiceVoid", { id: posted1.id }, maker, all);
        truthy("void waits for approval", "redirect" in v && !v.posted);
        const dup = await submit("InvoiceVoid", { id: posted1.id }, maker, all);
        truthy("a second void request is refused", "state" in dup && !!dup.state?.error, "state" in dup ? dup.state?.error : "");
        const vReq = await tx.approvalRequest.findFirstOrThrow({ where: { kind: "InvoiceVoid", targetId: posted1.id } });
        const va = await decide(vReq.id, alice, all, "APPROVE", "");
        truthy("approved void voids the invoice", !!va?.ok && (await tx.salesInvoice.findUniqueOrThrow({ where: { id: posted1.id } })).status === "VOID", va?.error);

        // Cash: in never waits; out waits only from 5,000.
        const cash = (direction: string, amount: string) => ({ branchId: warehouse.branchId, date: ymd, direction, category: direction === "IN" ? "Other income" : "Other expense", amount, reference: "", note: "" });
        const cin = await submit("CashOut", cash("IN", "10000"), maker, all);
        truthy("cash in is posted at once", "redirect" in cin && cin.posted, "state" in cin ? cin.state?.error : "");
        const csmall = await submit("CashOut", cash("OUT", "1000"), maker, all);
        truthy("small cash out is posted at once", "redirect" in csmall && csmall.posted);
        const cbig = await submit("CashOut", cash("OUT", "6000"), maker, all);
        truthy("large cash out waits", "redirect" in cbig && !cbig.posted);

        // Manual journal waits, then posts on approval.
        const accounts = await tx.account.findMany({ where: { systemKey: { in: ["OTHER_EXPENSE", "CASH"] } } });
        const exp = accounts.find((a) => a.systemKey === "OTHER_EXPENSE")!;
        const cashAcc = accounts.find((a) => a.systemKey === "CASH")!;
        const mj = await submit(
          "ManualJournal",
          { date: ymd, memo: "Approval check accrual", lines: JSON.stringify([{ accountId: exp.id, branchId: warehouse.branchId, debit: "50", credit: "", memo: "" }, { accountId: cashAcc.id, branchId: warehouse.branchId, debit: "", credit: "50", memo: "" }]) },
          maker,
          all,
        );
        truthy("manual journal waits", "redirect" in mj && !mj.posted);
        const mjReq = await tx.approvalRequest.findFirstOrThrow({ where: { kind: "ManualJournal", status: "PENDING" } });
        const mja = await decide(mjReq.id, bob, all, "APPROVE", "");
        const je = await tx.journalEntry.findFirst({ where: { memo: "Approval check accrual" } });
        truthy("approved journal is posted", !!mja?.ok && !!je, mja?.error);

        // Database guard: a decided request can never change (last, since a failed statement aborts the transaction).
        const guard = await tx.$executeRaw`UPDATE "ApprovalRequest" SET "status" = 'PENDING' WHERE "id" = ${req.id}`.then(
          () => "allowed",
          (e: Error) => e.message,
        );
        truthy("database refuses changing a decided request", guard !== "allowed");
        throw new Rollback();
      },
      { timeout: 300_000, maxWait: 20_000 },
    )
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    })
    .finally(() => {
      active = null;
    });

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed. Transaction rolled back; nothing was saved.");
  process.exitCode = failures ? 1 : 0;
}

main().finally(() => real.$disconnect());
