import "server-only";
import { cache } from "react";
import { db } from "@/core/db";

export const SETTING_DEFAULTS = {
  "app.name": "Strata",
  "company.name": "My Company",
  "company.currency": "PHP",
  "company.address": "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export const getSettings = cache(async () => {
  const rows = await db.setting.findMany();
  const values: Record<SettingKey, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) if (row.key in values) values[row.key as SettingKey] = row.value;
  return values;
});
