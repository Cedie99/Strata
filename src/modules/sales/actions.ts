"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/core/audit";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formObject, fromZod, type ActionState } from "@/core/forms";
import { runPosting as posting } from "@/core/posting";
import { P } from "./module";
import { postInvoice, postPayment, voidInvoice } from "./posting";
import { customerSchema, invoiceSchema, paymentSchema } from "./schemas";

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ─────────────── Customers ───────────────

export async function saveCustomer(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.customersManage);
  const parsed = customerSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  let customerId = id;
  try {
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.customer.findUniqueOrThrow({ where: { id } });
        const after = await tx.customer.update({ where: { id }, data: parsed.data });
        await audit({ userId: user.id, action: "update", entity: "Customer", entityId: id, before, after }, tx);
      } else {
        const created = await tx.customer.create({ data: parsed.data });
        customerId = created.id;
        await audit({ userId: user.id, action: "create", entity: "Customer", entityId: created.id, after: created }, tx);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }

  revalidatePath("/sales", "layout");
  redirect(`/sales/customers/${customerId}`);
}

// ─────────────── Invoices ───────────────

export async function saveInvoice(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.invoicesPost);
  const parsed = invoiceSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await posting((tx) => postInvoice(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };

  revalidatePath("/", "layout");
  redirect(`/sales/invoices/${result.value.id}`);
}

export async function cancelInvoice(id: string): Promise<ActionState> {
  const user = await requirePermission(P.invoicesPost);
  const scope = await getBranchScope();

  const result = await posting((tx) => voidInvoice(tx, user.id, id, scope.mayUse));
  if ("error" in result) return { error: result.error };

  revalidatePath("/", "layout");
  return { ok: `${result.value.number} is void and its stock was received back.` };
}

// ─────────────── Payments ───────────────

export async function savePayment(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.paymentsPost);
  const parsed = paymentSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await posting((tx) => postPayment(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };

  revalidatePath("/", "layout");
  redirect(`/sales/invoices/${parsed.data.invoiceId}`);
}
