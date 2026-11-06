import { getBranding, markSvg } from "@/core/branding";
import { readStoredFile } from "@/core/storage";

// The brand logo, public so it shows on the sign-in page and as the favicon. Without an uploaded
// logo, the built-in mark is drawn in the brand colours. Pages link here with ?v=<brand version>,
// so a long cache is safe: any change to the logo or colours produces a new URL.
export async function GET(request: Request) {
  const brand = await getBranding();
  const versioned = new URL(request.url).searchParams.get("v") === brand.version;
  const headers = {
    "X-Content-Type-Options": "nosniff",
    // An uploaded SVG opened directly must never run scripts as a page of this site.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "no-cache",
  };

  if (brand.logo) {
    try {
      const bytes = await readStoredFile(brand.logo.key);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": brand.logo.type } });
    } catch {
      // Missing file (e.g. storage not restored): fall back to the drawn mark.
    }
  }
  return new Response(markSvg(brand.colors), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
