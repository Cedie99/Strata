import type { Metadata } from "next";
import { connection } from "next/server";
import { brandCss, getBranding } from "@/core/branding";
import "./globals.css";

// The tab title, favicon, colours and typefaces follow the brand set under Setup → Branding.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  const logo = `/brand/logo?v=${brand.version}`;
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: `${brand.name} — ${brand.tagline || "enterprise resource planning"}`,
    icons: {
      icon: [{ url: logo, type: brand.logo?.type ?? "image/svg+xml" }],
      // iOS ignores SVG touch icons: keep the built-in PNG unless a raster logo was uploaded.
      apple: brand.logo && brand.logo.type !== "image/svg+xml" ? logo : "/apple-icon.png",
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Render per request, never at build time, so a brand change reaches every page (including static ones).
  await connection();
  const brand = await getBranding();
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <style id="brand-theme" dangerouslySetInnerHTML={{ __html: brandCss(brand) }} />
      </head>
      <body className="min-h-full text-sm">{children}</body>
    </html>
  );
}
