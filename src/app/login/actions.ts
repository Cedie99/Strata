"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/core/audit";
import { verifyPassword } from "@/core/auth/password";
import { createSession, deleteSession } from "@/core/auth/session";
import { getCurrentUser } from "@/core/auth/guard";
import { db } from "@/core/db";
import type { ActionState } from "@/core/forms";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function login(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Same message for every failure so the form does not reveal which emails exist.
  if (!user || !user.isActive || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id);
  await audit({ userId: user.id, action: "login", entity: "User", entityId: user.id });

  const next = parsed.data.next;
  // Only allow local paths, never "//evil.com".
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit({ userId: user.id, action: "logout", entity: "User", entityId: user.id });
  await deleteSession();
  redirect("/login");
}
