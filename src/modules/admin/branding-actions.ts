"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/core/audit";
import { requirePermission } from "@/core/auth/guard";
import { BRAND_DEFAULTS, COLOR_DEFAULTS, COLOR_KEYS, LOGO_TYPES } from "@/core/branding";
import { db } from "@/core/db";
import { isFontId } from "@/core/fonts";
import { checkbox, formObject, fromZod, type ActionState } from "@/core/forms";
import { SETTING_DEFAULTS } from "@/core/settings";
import { removeFile, saveFile } from "@/core/storage";
import { P } from "./module";

const MAX_LOGO_BYTES = 1024 * 1024;
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #0F3B2C")
  .transform((v) => v.toLowerCase());

const brandSchema = z.object({
  name: z.string().trim().min(1, "System name is required").max(40),
  tagline: z.string().trim().max(60),
  loginHeadline: z.string().trim().max(120),
  uppercase: checkbox,
  showName: checkbox,
  removeLogo: checkbox,
  fontDisplay: z.string().refine((v) => isFontId("display", v), "Pick a typeface from the list"),
  fontText: z.string().refine((v) => isFontId("text", v), "Pick a typeface from the list"),
  fontMono: z.string().refine((v) => isFontId("mono", v), "Pick a typeface from the list"),
  ...Object.fromEntries(COLOR_KEYS.map((k) => [`color.${k}`, hex])),
});

async function snapshot() {
  const rows = await db.setting.findMany({ where: { OR: [{ key: { startsWith: "brand." } }, { key: "app.name" }] } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveBranding(_state: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requirePermission(P.brandingManage);
  const parsed = brandSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const data = parsed.data as z.infer<typeof brandSchema> & Record<string, string>;

  // The logo is checked by its content, not the name or the browser's claimed type.
  const file = formData.get("logo");
  let upload: { bytes: Buffer; type: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_BYTES) return { fieldErrors: { logo: ["The logo must be 1 MB or smaller"] } };
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = Object.keys(LOGO_TYPES).find((t) => LOGO_TYPES[t](bytes));
    if (!type) return { fieldErrors: { logo: ["Use a PNG, JPEG, WebP or SVG image"] } };
    upload = { bytes, type };
  }

  const colors = Object.fromEntries(COLOR_KEYS.map((k) => [k, data[`color.${k}`]]));
  const values: Record<string, string> = {
    "app.name": data.name,
    "brand.tagline": data.tagline,
    "brand.loginHeadline": data.loginHeadline || BRAND_DEFAULTS.loginHeadline,
    "brand.uppercase": data.uppercase ? "1" : "0",
    "brand.showName": data.showName ? "1" : "0",
    "brand.fontDisplay": data.fontDisplay,
    "brand.fontText": data.fontText,
    "brand.fontMono": data.fontMono,
    "brand.colors": JSON.stringify(colors),
  };

  const before = await snapshot();
  const oldKey = before["brand.logoKey"];
  const newKey = upload ? await saveFile(upload.bytes) : null;
  if (upload && newKey) Object.assign(values, { "brand.logoKey": newKey, "brand.logoType": upload.type });
  else if (data.removeLogo) Object.assign(values, { "brand.logoKey": "", "brand.logoType": "" });

  try {
    await db.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(values))
        await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      await audit({ userId: me.id, action: "update", entity: "Branding", before, after: values }, tx);
    });
  } catch (e) {
    if (newKey) await removeFile(newKey);
    throw e;
  }
  // The old logo file is no longer referenced once the new value is saved.
  if (oldKey && values["brand.logoKey"] !== undefined && values["brand.logoKey"] !== oldKey) await removeFile(oldKey);

  revalidatePath("/", "layout");
  return { ok: "Branding saved. Every page now uses the new brand." };
}

/** Back to the built-in brand: default name, fonts, colours, and no uploaded logo. */
export async function resetBranding(): Promise<ActionState> {
  const me = await requirePermission(P.brandingManage);
  const before = await snapshot();
  await db.$transaction(async (tx) => {
    await tx.setting.deleteMany({ where: { key: { startsWith: "brand." } } });
    await tx.setting.upsert({
      where: { key: "app.name" },
      create: { key: "app.name", value: SETTING_DEFAULTS["app.name"] },
      update: { value: SETTING_DEFAULTS["app.name"] },
    });
    await audit({ userId: me.id, action: "reset", entity: "Branding", before, after: { colors: COLOR_DEFAULTS } }, tx);
  });
  if (before["brand.logoKey"]) await removeFile(before["brand.logoKey"]);

  revalidatePath("/", "layout");
  return { ok: "Branding reset to the built-in defaults." };
}
