import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { db } from "@/core/db";
import { fontStack, isFontId } from "@/core/fonts";
import { getSettings } from "@/core/settings";

/*
 * The brand identity an admin edits under Setup → Branding. Stored in the Setting table under
 * "brand.*" keys (the system name stays in "app.name"); anything not set falls back to these defaults,
 * which are the built-in Strata brand and match globals.css.
 */

/** The palette, as CSS custom properties (without the leading "--"). Light-scheme values. */
export const COLOR_DEFAULTS = {
  header: "#0f3b2c",
  "header-text": "#ffffff",
  accent: "#f2c230",
  menubar: "#0a0c0b",
  "menubar-text": "#ffffff",
  "menubar-active": "#1a4a39",
  primary: "#0f3b2c",
  "primary-text": "#ffffff",
  tab: "#0f3b2c",
  "tab-text": "#ffffff",
  "row-selected": "#1a5a43",
  "row-hover": "#e4ece8",
  "row-alt": "#f4f6f5",
  bg: "#ffffff",
  surface: "#ffffff",
  text: "#0a0c0b",
  muted: "#5b6560",
  border: "#d6dbd8",
  danger: "#b42318",
  ok: "#17643a",
} as const;

export type ColorKey = keyof typeof COLOR_DEFAULTS;
export type Palette = Record<ColorKey, string>;
export const COLOR_KEYS = Object.keys(COLOR_DEFAULTS) as ColorKey[];

/** Labels and grouping for the editor. */
export const COLOR_GROUPS: { title: string; hint: string; colors: { key: ColorKey; label: string }[] }[] = [
  {
    title: "Brand",
    hint: "Title bar, sign-in panel and the highlight colour. Applied in light and dark mode.",
    colors: [
      { key: "header", label: "Title bar" },
      { key: "header-text", label: "Title bar text" },
      { key: "accent", label: "Accent (small highlights only)" },
    ],
  },
  {
    title: "Menu bar",
    hint: "Applied in light and dark mode.",
    colors: [
      { key: "menubar", label: "Menu bar" },
      { key: "menubar-text", label: "Menu text" },
      { key: "menubar-active", label: "Open / hovered menu" },
    ],
  },
  {
    title: "Actions & selection",
    hint: "Buttons, links, tabs and selected rows. In dark mode the primary colour is lightened automatically; hovered row and text on primary are light mode only.",
    colors: [
      { key: "primary", label: "Primary (buttons, links)" },
      { key: "primary-text", label: "Text on primary" },
      { key: "tab", label: "Tab" },
      { key: "tab-text", label: "Tab text" },
      { key: "row-selected", label: "Selected row" },
      { key: "row-hover", label: "Hovered row" },
    ],
  },
  {
    title: "Work area",
    hint: "Page background and text. Light mode only; dark mode keeps its own neutral greys.",
    colors: [
      { key: "bg", label: "Page background" },
      { key: "surface", label: "Cards & inputs" },
      { key: "row-alt", label: "Alternate row" },
      { key: "text", label: "Text" },
      { key: "muted", label: "Secondary text" },
      { key: "border", label: "Borders" },
      { key: "danger", label: "Error / delete" },
      { key: "ok", label: "Success" },
    ],
  },
];

/** Shown in both schemes, as-is. */
const CHROME: ColorKey[] = [
  "header",
  "header-text",
  "accent",
  "menubar",
  "menubar-text",
  "menubar-active",
  "tab",
  "tab-text",
  "row-selected",
];
/** Shown in both schemes, lightened for dark mode so they stay readable on dark backgrounds. */
const LIGHTEN_IN_DARK: ColorKey[] = ["primary"];

export const BRAND_DEFAULTS = {
  tagline: "Enterprise Resource Planning",
  loginHeadline: "One system for every branch, warehouse and team.",
  uppercase: true,
  showName: true,
  fontDisplay: "michroma",
  fontText: "manrope",
  fontMono: "plex-mono",
};

export type Branding = typeof BRAND_DEFAULTS & {
  name: string;
  colors: Palette;
  logo: { key: string; type: string } | null;
  /** Changes whenever the logo or colours change, to bust browser caches of /brand/logo. */
  version: string;
};

/** Raster and vector formats a browser shows in <img>; checked against the file's first bytes. */
export const LOGO_TYPES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  "image/svg+xml": (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(b.subarray(0, 4096).toString("utf8")),
};

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

function parsePalette(json: string | undefined): Palette {
  const colors: Palette = { ...COLOR_DEFAULTS };
  try {
    const saved = JSON.parse(json ?? "{}") as Record<string, unknown>;
    for (const key of COLOR_KEYS) if (isHex(saved[key])) colors[key] = saved[key].toLowerCase();
  } catch {
    // A damaged value falls back to the defaults rather than breaking every page.
  }
  return colors;
}

export const getBranding = cache(async (): Promise<Branding> => {
  const [settings, rows] = await Promise.all([
    getSettings(),
    db.setting.findMany({ where: { key: { startsWith: "brand." } } }),
  ]);
  const s = Object.fromEntries(rows.map((r) => [r.key.slice("brand.".length), r.value]));
  const pick = (role: "display" | "text" | "mono", id: string | undefined, fallback: string) =>
    id && isFontId(role, id) ? id : fallback;
  const colors = parsePalette(s.colors);
  const logo = s.logoKey && s.logoType ? { key: s.logoKey, type: s.logoType } : null;

  return {
    name: settings["app.name"],
    tagline: s.tagline ?? BRAND_DEFAULTS.tagline,
    loginHeadline: s.loginHeadline ?? BRAND_DEFAULTS.loginHeadline,
    uppercase: s.uppercase === undefined ? BRAND_DEFAULTS.uppercase : s.uppercase === "1",
    showName: s.showName === undefined ? BRAND_DEFAULTS.showName : s.showName === "1",
    fontDisplay: pick("display", s.fontDisplay, BRAND_DEFAULTS.fontDisplay),
    fontText: pick("text", s.fontText, BRAND_DEFAULTS.fontText),
    fontMono: pick("mono", s.fontMono, BRAND_DEFAULTS.fontMono),
    colors,
    logo,
    version: createHash("sha1")
      .update(JSON.stringify([logo?.key, colors]))
      .digest("hex")
      .slice(0, 10),
  };
});

/**
 * The stylesheet that applies the brand on top of globals.css. Only colours that differ from the
 * defaults are written, so the built-in dark scheme stays intact unless the admin changed something.
 * `html:root` outranks the plain `:root` rules in globals.css regardless of stylesheet order.
 */
export function brandCss(b: Pick<Branding, "colors" | "fontDisplay" | "fontText" | "fontMono">) {
  const changed = COLOR_KEYS.filter((k) => b.colors[k] !== COLOR_DEFAULTS[k]);
  const decl = (keys: ColorKey[], value: (k: ColorKey) => string) => keys.map((k) => `--${k}:${value(k)};`).join("");

  const both = changed.filter((k) => CHROME.includes(k));
  const lighten = changed.filter((k) => LIGHTEN_IN_DARK.includes(k));
  const lightOnly = changed.filter((k) => !CHROME.includes(k));

  const fonts =
    `--brand-font-display:${fontStack("display", b.fontDisplay)};` +
    `--brand-font-text:${fontStack("text", b.fontText)};` +
    `--brand-font-mono:${fontStack("mono", b.fontMono)};`;

  let css = `html:root{${fonts}${decl(both, (k) => b.colors[k])}}`;
  if (lightOnly.length) css += `@media (prefers-color-scheme: light){html:root{${decl(lightOnly, (k) => b.colors[k])}}}`;
  if (lighten.length)
    css += `@media (prefers-color-scheme: dark){html:root{${decl(lighten, (k) => `color-mix(in oklab, ${b.colors[k]} 62%, white)`)}}}`;
  // Font names come from next/font and colours are validated hex, but never let a value close the tag.
  return css.replace(/<\/?style/gi, "");
}

/** The mark drawn in the brand colours, used as the default logo and favicon. */
export function markSvg(colors: Pick<Palette, "header" | "header-text" | "accent">) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><rect width="220" height="220" rx="48" fill="${colors.header}"/><path d="M156 64V94H126Z" fill="${colors.accent}"/><path d="M119 101H156V122H98Z" fill="${colors["header-text"]}"/><path d="M91 129H156V155H65Z" fill="${colors["header-text"]}"/></svg>`;
}

/** What the <Brand> component needs. */
export const brandProps = (b: Branding) => ({
  name: b.name,
  tagline: b.tagline,
  logoUrl: b.logo ? `/brand/logo?v=${b.version}` : null,
  showName: b.showName,
  uppercase: b.uppercase,
});
