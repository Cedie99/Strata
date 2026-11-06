"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/core/audit";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formObject, fromZod, type ActionState } from "@/core/forms";
import { runPosting } from "@/core/posting";
import { P } from "./module";
import { finishOrder, postBill, postOrder, postSupplierPayment, receiveOrder, voidBill } from "./posting";
import { billSchema, orderSchema, receiptSchema, supplierPaymentSchema, supplierSchema } from "./schemas";

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ─────────────── Suppliers ───────────────

export async function saveSupplier(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.suppliersManage);
  const parsed = supplierSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const data = { ...parsed.data, ewtRate: new Prisma.Decimal(parsed.data.ewtRate) };

  let supplierId = id;
  try {
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.supplier.findUniqueOrThrow({ where: { id } });
        const after = await tx.supplier.update({ where: { id }, data });
        await audit({ userId: user.id, action: "update", entity: "Supplier", entityId: id, before, after }, tx);
      } else {
        const created = await tx.supplier.create({ data });
        supplierId = created.id;
        await audit({ userId: user.id, action: "create", entity: "Supplier", entityId: created.id, after: created }, tx);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }

  revalidatePath("/purchasing", "layout");
  redirect(`/purchasing/suppliers/${supplierId}`);
}

// ─────────────── Purchase orders ───────────────

export async function saveOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.ordersManage);
  const parsed = orderSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await runPosting((tx) => postOrder(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };
  revalidatePath("/purchasing", "layout");
  redirect(`/purchasing/orders/${result.value.id}`);
}

export async function closeOrder(id: string, how: "CLOSED" | "CANCELLED"): Promise<ActionState> {
  const user = await requirePermission(P.ordersManage);
  const scope = await getBranchScope();
  const result = await runPosting((tx) => finishOrder(tx, user.id, id, how, scope.mayUse));
  if ("error" in result) return { error: result.error };
  revalidatePath("/purchasing", "layout");
  return { ok: `${result.value.number} is ${how === "CLOSED" ? "closed" : "cancelled"}.` };
}

// ─────────────── Receiving ───────────────

export async function saveReceipt(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.receive);
  const parsed = receiptSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await runPosting((tx) => receiveOrder(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/purchasing/receipts/${result.value.id}`);
}

// ─────────────── Supplier bills ───────────────

export async function saveBill(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.billsPost);
  const parsed = billSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await runPosting((tx) => postBill(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/purchasing/bills/${result.value.id}`);
}

export async function cancelBill(id: string): Promise<ActionState> {
  const user = await requirePermission(P.billsPost);
  const scope = await getBranchScope();
  const result = await runPosting((tx) => voidBill(tx, user.id, id, scope.mayUse));
  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  return { ok: `${result.value.number} is void.` };
}

// ─────────────── Payments made ───────────────

export async function saveSupplierPayment(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.paymentsPost);
  const parsed = supplierPaymentSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await runPosting((tx) => postSupplierPayment(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/purchasing/payments/${result.value.id}`);
}
