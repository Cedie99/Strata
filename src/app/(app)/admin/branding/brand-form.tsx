"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ActionForm, CheckboxField, FieldErrors, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { Card, sectionLabel } from "@/components/ui/layout";
import type { ColorKey, Palette } from "@/core/branding";
import type { ActionState } from "@/core/forms";

type FontOption = { value: string; label: string; stack: string };
type Initial = {
  name: string;
  tagline: string;
  loginHeadline: string;
  uppercase: boolean;
  showName: boolean;
  fontDisplay: string;
  fontText: string;
  fontMono: string;
  colors: Palette;
  logoUrl: string | null;
};

/** WCAG contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Text/background pairs worth checking: under 4.5:1 is hard to read at body sizes. */
const PAIRS: [ColorKey, ColorKey, string][] = [
  ["header-text", "header", "Title bar"],
  ["menubar-text", "menubar", "Menu bar"],
  ["primary-text", "primary", "Buttons"],
  ["tab-text", "tab", "Tabs"],
  ["text", "bg", "Page text"],
  ["muted", "surface", "Secondary text"],
];

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function ColorField({
  name,
  label,
  value,
  fallback,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  fallback: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="block text-[11px] font-bold tracking-[0.06em] text-muted uppercase">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={isHex(value) ? value : fallback}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-sm border border-border bg-surface p-0.5"
        />
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label} hex value`}
          aria-invalid={!isHex(value) || undefined}
          className="w-full min-w-0 rounded-sm border border-border px-2 py-1.5 font-mono text-[13px] uppercase outline-none focus:border-primary aria-invalid:border-danger"
        />
      </div>
      <FieldErrors name={name} />
    </div>
  );
}

/** A small copy of the app chrome drawn with the chosen values, before anything is saved. */
function Preview({ v, fonts, logoUrl }: { v: Initial; fonts: Record<"display" | "text" | "mono", string>; logoUrl: string | null }) {
  const c = (k: ColorKey) => (isHex(v.colors[k]) ? v.colors[k] : "#000000");
  const vars = { fontFamily: fonts.text, background: c("bg"), color: c("text") } as CSSProperties;
  const mark = (
    <svg viewBox="60 60 100 100" width={28} height={28} aria-hidden>
      <path d="M156 64V94H126Z" fill={c("accent")} />
      <path d="M119 101H156V122H98Z" fill={c("header-text")} />
      <path d="M91 129H156V155H65Z" fill={c("header-text")} />
    </svg>
  );
  return (
    <div className="overflow-hidden border border-border text-[12px] shadow-sm" style={vars}>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ background: c("header"), color: c("header-text") }}>
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file */}
          {logoUrl ? <img src={logoUrl} alt="" className="h-8 w-auto max-w-[140px] object-contain" /> : mark}
          {v.showName && (
            <span className="flex flex-col leading-none">
              <span
                className={`text-[18px] ${v.uppercase ? "tracking-[0.22em] uppercase" : "tracking-tight"}`}
                style={{ fontFamily: fonts.display }}
              >
                {v.name || "Name"}
              </span>
              {v.tagline && <span className="mt-1 text-[7.5px] font-medium tracking-[0.3em] uppercase opacity-80">{v.tagline}</span>}
            </span>
          )}
        </span>
        <span className="text-[11px] italic opacity-90">Licensed to : Company</span>
      </div>
      <div className="flex gap-0.5 px-1 text-[12px]" style={{ background: c("menubar"), color: c("menubar-text") }}>
        <span className="px-3 py-1.5" style={{ background: c("menubar-active"), boxShadow: `inset 0 -2px 0 ${c("accent")}` }}>
          Inventory
        </span>
        <span className="px-3 py-1.5">Sales</span>
        <span className="px-3 py-1.5">Accounting</span>
      </div>
      <div className="space-y-2 p-3">
        <p className="text-[16px] font-semibold">Products</p>
        <div className="flex gap-0.5" style={{ borderBottom: `1px solid ${c("border")}` }}>
          <span className="px-5 py-1 font-semibold" style={{ background: c("surface"), borderTop: `2px solid ${c("accent")}` }}>
            List
          </span>
          <span className="px-5 py-1" style={{ background: c("tab"), color: c("tab-text") }}>
            General
          </span>
        </div>
        <div style={{ border: `1px solid ${c("border")}`, background: c("surface") }}>
          {[
            ["SKU-000123", "Diesel fuel, 1 L", "selected"],
            ["SKU-000124", "Engine oil 5W-30", "alt"],
            ["SKU-000125", "Brake fluid DOT 4", "hover"],
          ].map(([code, label, state]) => (
            <div
              key={code}
              className="flex gap-3 px-2 py-1"
              style={
                state === "selected"
                  ? { background: c("row-selected"), color: "#fff" }
                  : { background: state === "alt" ? c("row-alt") : c("row-hover") }
              }
            >
              <span style={{ fontFamily: fonts.mono }}>{code}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <p style={{ color: c("muted") }}>
          Secondary text with a{" "}
          <span className="font-semibold underline" style={{ color: c("primary") }}>
            link
          </span>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-sm px-3 py-1" style={{ background: c("primary"), color: c("primary-text") }}>
            Save
          </span>
          <span className="rounded-sm px-3 py-1" style={{ border: `1px solid ${c("border")}`, background: c("surface") }}>
            Cancel
          </span>
          <span className="font-semibold" style={{ color: c("ok") }}>
            Saved.
          </span>
          <span className="font-semibold" style={{ color: c("danger") }}>
            Required
          </span>
        </div>
      </div>
    </div>
  );
}

export function BrandForm({
  action,
  initial,
  defaults,
  groups,
  fonts,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: Initial;
  defaults: Readonly<Palette>;
  groups: { title: string; hint: string; colors: { key: ColorKey; label: string }[] }[];
  fonts: Record<"display" | "text" | "mono", FontOption[]>;
}) {
  const [v, setV] = useState(initial);
  const [pickedLogo, setPickedLogo] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const set = <K extends keyof Initial>(key: K, value: Initial[K]) => setV((p) => ({ ...p, [key]: value }));
  const setColor = (key: ColorKey, value: string) => setV((p) => ({ ...p, colors: { ...p.colors, [key]: value } }));

  // Free the object URL of a picked logo when it is replaced or the page closes.
  useEffect(() => () => void (pickedLogo && URL.revokeObjectURL(pickedLogo)), [pickedLogo]);

  const stack = (role: "display" | "text" | "mono", id: string) => fonts[role].find((f) => f.value === id)?.stack ?? "";
  const previewFonts = { display: stack("display", v.fontDisplay), text: stack("text", v.fontText), mono: stack("mono", v.fontMono) };
  const previewLogo = pickedLogo ?? (removeLogo ? null : initial.logoUrl);
  const lowContrast = PAIRS.filter(([fg, bg]) => isHex(v.colors[fg]) && isHex(v.colors[bg]) && contrast(v.colors[fg], v.colors[bg]) < 4.5);

  return (
    <ActionForm action={action} className="grid max-w-6xl gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <Card title="Name">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="name"
              label="System name"
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={40}
              hint="Title bar, browser tab and sign-in page"
              required
            />
            <TextField
              name="tagline"
              label="Tagline"
              value={v.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              maxLength={60}
              hint="Small line under the name; leave empty to hide"
            />
            <div className="sm:col-span-2">
              <TextField
                name="loginHeadline"
                label="Sign-in headline"
                value={v.loginHeadline}
                onChange={(e) => set("loginHeadline", e.target.value)}
                maxLength={120}
                hint="Large text on the sign-in page"
              />
            </div>
            <CheckboxField name="uppercase" label="Wordmark in spaced capitals" checked={v.uppercase} onChange={(e) => set("uppercase", e.target.checked)} />
            <CheckboxField name="showName" label="Show the name next to the logo" checked={v.showName} onChange={(e) => set("showName", e.target.checked)} />
          </div>
        </Card>

        <Card title="Logo">
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="block text-[11px] font-bold tracking-[0.06em] text-muted uppercase">Upload a new logo</span>
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPickedLogo(f ? URL.createObjectURL(f) : null);
                }}
                className="block w-full text-[13px] file:mr-3 file:rounded-sm file:border file:border-border file:bg-surface file:px-3 file:py-1 file:font-semibold hover:file:bg-row-hover"
              />
              <span className="block text-xs text-muted">
                PNG, JPEG, WebP or SVG, up to 1 MB. A transparent logo sized for a dark background works best in the title bar.
                It is also used as the browser tab icon.
              </span>
            </label>
            <FieldErrors name="logo" />
            {initial.logoUrl && !pickedLogo && (
              <CheckboxField
                name="removeLogo"
                label="Remove the uploaded logo (use the built-in mark)"
                checked={removeLogo}
                onChange={(e) => setRemoveLogo(e.target.checked)}
              />
            )}
          </div>
        </Card>

        <Card title="Typefaces">
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              name="fontDisplay"
              label="Wordmark"
              value={v.fontDisplay}
              onChange={(e) => set("fontDisplay", e.target.value)}
              options={fonts.display}
              hint="The system name"
            />
            <SelectField
              name="fontText"
              label="Body text"
              value={v.fontText}
              onChange={(e) => set("fontText", e.target.value)}
              options={fonts.text}
              hint="Menus, forms, lists"
            />
            <SelectField
              name="fontMono"
              label="Codes & numbers"
              value={v.fontMono}
              onChange={(e) => set("fontMono", e.target.value)}
              options={fonts.mono}
              hint="SKUs, document numbers"
            />
          </div>
        </Card>

        <Card title="Colour palette">
          <div className="space-y-5">
            {groups.map((g) => (
              <fieldset key={g.title} className="space-y-2">
                <legend className={sectionLabel}>{g.title}</legend>
                <p className="text-xs text-muted">{g.hint}</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {g.colors.map(({ key, label }) => (
                    <ColorField
                      key={key}
                      name={`color.${key}`}
                      label={label}
                      value={v.colors[key]}
                      fallback={defaults[key]}
                      onChange={(value) => setColor(key, value)}
                    />
                  ))}
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() => set("colors", { ...defaults })}
              className="text-[12px] font-semibold text-primary underline underline-offset-2"
            >
              Restore the default palette
            </button>
          </div>
        </Card>
      </div>

      <div className="space-y-3 lg:sticky lg:top-2 lg:self-start">
        <Card title="Preview">
          <Preview v={v} fonts={previewFonts} logoUrl={previewLogo} />
          {lowContrast.length > 0 && (
            <div className="mt-3 border-l-2 border-accent bg-row-alt px-3 py-2 text-[12px]">
              <p className="font-semibold">Hard to read (contrast under 4.5 : 1):</p>
              <p className="text-muted">{lowContrast.map(([, , label]) => label).join(", ")}</p>
            </div>
          )}
        </Card>
        <SubmitButton className="w-full py-1.5">Save branding</SubmitButton>
      </div>
    </ActionForm>
  );
}
