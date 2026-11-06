import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-dialog";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/core/auth/guard";
import { brandProps, COLOR_DEFAULTS, COLOR_GROUPS, getBranding } from "@/core/branding";
import { fontOptions, fontStack, type FontRole } from "@/core/fonts";
import { resetBranding, saveBranding } from "@/modules/admin/branding-actions";
import { P } from "@/modules/admin/module";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage() {
  await requirePermission(P.brandingManage);
  const brand = await getBranding();

  // Each picker gets its options plus the CSS stack per option, so the preview can show the real face.
  const fonts = Object.fromEntries(
    (["display", "text", "mono"] as FontRole[]).map((role) => [
      role,
      fontOptions(role).map((o) => ({ ...o, stack: fontStack(role, o.value) })),
    ]),
  ) as Record<FontRole, { value: string; label: string; stack: string }[]>;

  return (
    <>
      <PageHeader
        title="Branding"
        description="The system's name, logo, typefaces and colours, shown on every page and on the sign-in screen."
      />
      <BrandForm
        action={saveBranding}
        initial={{
          name: brand.name,
          tagline: brand.tagline,
          loginHeadline: brand.loginHeadline,
          uppercase: brand.uppercase,
          showName: brand.showName,
          fontDisplay: brand.fontDisplay,
          fontText: brand.fontText,
          fontMono: brand.fontMono,
          colors: brand.colors,
          logoUrl: brandProps(brand).logoUrl,
        }}
        defaults={COLOR_DEFAULTS}
        groups={COLOR_GROUPS}
        fonts={fonts}
      />
      <Card className="mt-3 max-w-6xl">
        <ActionForm action={resetBranding} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted">
            Go back to the built-in brand: default name, typefaces and colours, and no uploaded logo.
          </p>
          <ConfirmSubmitButton label="Reset to defaults" title="Reset branding?">
            The system name, logo, typefaces and colours return to the built-in defaults for everyone. Company details are
            not affected.
          </ConfirmSubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
