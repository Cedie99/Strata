"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/core/audit";
import { requirePermission } from "@/core/auth/guard";
import { getBranchScope } from "@/core/branches";
import { db } from "@/core/db";
import { formObject, fromZod, type ActionState } from "@/core/forms";
import { ledgerGuardMessage, PostingError, runPosting } from "@/core/posting";
import { journalForCostChange } from "@/modules/accounting/ledger";
import { P } from "./module";
import { recordMovement } from "./posting";
import { itemClassSchema, itemTypeSchema, movementSchema, productSchema, warehouseSchema } from "./schemas";

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ─────────────── Products ───────────────

export async function saveProduct(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.productsManage);
  const parsed = productSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  let productId = id;
  try {
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.product.findUniqueOrThrow({ where: { id } });
        const after = await tx.product.update({ where: { id }, data: parsed.data });
        await audit({ userId: user.id, action: "update", entity: "Product", entityId: id, before, after }, tx);
        await journalForCostChange(tx, user.id, after, before.cost, after.cost);
      } else {
        const created = await tx.product.create({ data: parsed.data });
        productId = created.id;
        await audit({ userId: user.id, action: "create", entity: "Product", entityId: created.id, after: created }, tx);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { sku: ["This SKU is already used"] } };
    if (e instanceof PostingError) return { fieldErrors: { cost: [e.message] } };
    const guard = ledgerGuardMessage(e);
    if (guard) return { error: guard };
    throw e;
  }

  revalidatePath("/inventory", "layout");
  redirect(`/inventory/products/${productId}`);
}

// ─────────────── Warehouses ───────────────

export async function saveWarehouse(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.warehousesManage);
  const parsed = warehouseSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();
  if (!scope.mayUse(parsed.data.branchId)) return { fieldErrors: { branchId: ["You cannot use this branch"] } };

  try {
    const error = await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.warehouse.findUniqueOrThrow({ where: { id } });
        if (!scope.mayUse(before.branchId)) return "This warehouse belongs to a branch you cannot change.";
        const after = await tx.warehouse.update({ where: { id }, data: parsed.data });
        await audit({ userId: user.id, action: "update", entity: "Warehouse", entityId: id, before, after }, tx);
      } else {
        const created = await tx.warehouse.create({ data: parsed.data });
        await audit({ userId: user.id, action: "create", entity: "Warehouse", entityId: created.id, after: created }, tx);
      }
      return null;
    });
    if (error) return { error };
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }

  revalidatePath("/inventory", "layout");
  redirect("/inventory/warehouses");
}

// ─────────────── Stock movements ───────────────

export async function postMovement(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.stockPost);
  const parsed = movementSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const scope = await getBranchScope();

  const result = await runPosting((tx) => recordMovement(tx, user.id, parsed.data, scope.mayUse));
  if ("error" in result) return { error: result.error };
  if ("error" in result.value) return { error: result.value.error };

  revalidatePath("/", "layout");
  redirect(`/inventory/movements?q=${encodeURIComponent(result.value.number)}`);
}

// ─────────────── Item classes ───────────────

export async function saveItemClass(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.classesManage);
  const parsed = itemClassSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { parentId, description } = parsed.data;

  const result = await db.$transaction(async (tx) => {
    const before = id ? await tx.itemClass.findUniqueOrThrow({ where: { id } }) : null;
    // The item type is fixed once created, and a subclass always takes its parent's.
    let itemTypeId = before?.itemTypeId ?? parsed.data.itemTypeId;
    if (parentId) {
      const parent = await tx.itemClass.findUnique({ where: { id: parentId } });
      if (!parent) return { fieldErrors: { parentId: ["This parent class no longer exists"] } };
      if (before && parent.itemTypeId !== before.itemTypeId)
        return { fieldErrors: { parentId: ["Choose a parent of the same item type"] } };
      // Moving a class under itself or one of its own subclasses would cut it off from the tree.
      for (let at: string | null = parent.id; at && id; ) {
        if (at === id) return { fieldErrors: { parentId: ["A class cannot sit under itself or its subclasses"] } };
        at = (await tx.itemClass.findUnique({ where: { id: at }, select: { parentId: true } }))?.parentId ?? null;
      }
      itemTypeId = parent.itemTypeId;
    }
    if (!before) {
      const type = await tx.itemType.findUnique({ where: { id: itemTypeId } });
      if (!type?.isActive) return { fieldErrors: { itemTypeId: ["Choose an active item type"] } };
    }

    const clash = await tx.itemClass.findFirst({
      where: { itemTypeId, parentId, description: { equals: description, mode: "insensitive" }, id: { not: id ?? undefined } },
    });
    if (clash) return { fieldErrors: { description: ["This class already exists at this level"] } };

    const data = { itemTypeId, parentId, description, updatedById: user.id };
    if (before) {
      const after = await tx.itemClass.update({ where: { id: before.id }, data });
      await audit({ userId: user.id, action: "update", entity: "ItemClass", entityId: after.id, before, after }, tx);
    } else {
      const created = await tx.itemClass.create({ data });
      await audit({ userId: user.id, action: "create", entity: "ItemClass", entityId: created.id, after: created }, tx);
    }
    return null;
  });
  if (result) return { error: "Please fix the highlighted fields.", ...result };

  revalidatePath("/inventory/item-classes", "layout");
  redirect("/inventory/item-classes");
}

/**
 * Deletes the selected classes. A class whose subclasses are not all selected too is refused,
 * so nothing is ever left without a parent; selected subclasses are removed before their parents.
 */
export async function deleteItemClasses(ids: string[]): Promise<ActionState> {
  const user = await requirePermission(P.classesManage);

  const error = await db.$transaction(async (tx) => {
    const selected = new Set(ids);
    const classes = await tx.itemClass.findMany({
      where: { id: { in: ids } },
      include: { children: { select: { id: true } } },
    });
    const blocked = classes.filter((c) => c.children.some((k) => !selected.has(k.id)));
    if (blocked.length)
      return blocked
        .map((c) => `"${c.description}" still has subclasses.`)
        .concat("Delete or move its subclasses first, or select them too.")
        .join(" ");

    const left = new Map(classes.map((c) => [c.id, c]));
    while (left.size) {
      const leaves = [...left.values()].filter((c) => !c.children.some((k) => left.has(k.id)));
      for (const c of leaves) {
        const before = { ...c, children: undefined };
        await tx.itemClass.delete({ where: { id: c.id } });
        await audit({ userId: user.id, action: "delete", entity: "ItemClass", entityId: c.id, before }, tx);
        left.delete(c.id);
      }
    }
    return null;
  });
  if (error) return { error };

  revalidatePath("/inventory/item-classes", "layout");
  return undefined;
}

// ─────────────── Item types ───────────────

/** Adds (id null) or renames/activates an item type. Records link by id, so a rename shows everywhere. */
export async function saveItemType(id: string | null, _state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission(P.classesManage);
  const parsed = itemTypeSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);

  try {
    await db.$transaction(async (tx) => {
      const data = { ...parsed.data, updatedById: user.id };
      if (id) {
        const before = await tx.itemType.findUniqueOrThrow({ where: { id } });
        const after = await tx.itemType.update({ where: { id }, data });
        await audit({ userId: user.id, action: "update", entity: "ItemType", entityId: id, before, after }, tx);
      } else {
        const last = await tx.itemType.aggregate({ _max: { sortOrder: true } });
        const created = await tx.itemType.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
        await audit({ userId: user.id, action: "create", entity: "ItemType", entityId: created.id, after: created }, tx);
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { name: ["This item type already exists"] } };
    throw e;
  }

  revalidatePath("/inventory", "layout");
  return id ? { ok: "Saved." } : { ok: `"${parsed.data.name}" added.` };
}

/** Moves an item type one place up or down; the order is the order of the Item Classes tree and dropdowns. */
export async function moveItemType(id: string, direction: -1 | 1): Promise<ActionState> {
  const user = await requirePermission(P.classesManage);
  await db.$transaction(async (tx) => {
    const types = await tx.itemType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const from = types.findIndex((t) => t.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= types.length) return;
    types.splice(to, 0, types.splice(from, 1)[0]);
    for (const [i, t] of types.entries())
      if (t.sortOrder !== i + 1) await tx.itemType.update({ where: { id: t.id }, data: { sortOrder: i + 1 } });
    await audit({ userId: user.id, action: "reorder", entity: "ItemType", entityId: id, after: { order: types.map((t) => t.name) } }, tx);
  });
  revalidatePath("/inventory", "layout");
  return undefined;
}

/** Deletes unused item types; a type with classes is refused (deactivate it instead). */
export async function deleteItemType(id: string): Promise<ActionState> {
  const user = await requirePermission(P.classesManage);
  const error = await db.$transaction(async (tx) => {
    const before = await tx.itemType.findUniqueOrThrow({ where: { id }, include: { _count: { select: { classes: true } } } });
    if (before._count.classes > 0)
      return `"${before.name}" has ${before._count.classes} class(es). Untick "Active" to retire it instead.`;
    await tx.itemType.delete({ where: { id } });
    await audit({ userId: user.id, action: "delete", entity: "ItemType", entityId: id, before }, tx);
    return null;
  });
  if (error) return { error };
  revalidatePath("/inventory", "layout");
  return undefined;
}
