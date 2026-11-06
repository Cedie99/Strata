/**
 * The built-in mark: three strata rising to an accent-coloured apex. Drawn in the brand colours
 * (--header, --header-text, --accent), so it follows the palette set under Setup → Branding.
 * Without `tile` only the layers are drawn, for use on the title bar.
 */
export function StrataMark({ size = 32, tile = false, className = "" }: { size?: number; tile?: boolean; className?: string }) {
  return (
    <svg viewBox={tile ? "0 0 220 220" : "60 60 100 100"} width={size} height={size} aria-hidden className={`shrink-0 ${className}`}>
      {tile && <rect width="220" height="220" rx="48" style={{ fill: "var(--header)" }} />}
      <path d="M156 64V94H126Z" style={{ fill: "var(--accent)" }} />
      <path d="M119 101H156V122H98Z" style={{ fill: "var(--header-text)" }} />
      <path d="M91 129H156V155H65Z" style={{ fill: "var(--header-text)" }} />
    </svg>
  );
}

export type BrandProps = {
  name: string;
  tagline: string;
  /** URL of the uploaded logo, or null for the built-in mark. */
  logoUrl: string | null;
  showName: boolean;
  uppercase: boolean;
};

/** Logo + wordmark, as in the title bar and on the sign-in page. */
export function Brand({ name, tagline, logoUrl, showName, uppercase }: BrandProps) {
  return (
    <span className="flex items-center gap-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own route, any size/format
        <img src={logoUrl} alt={showName ? "" : name} className="h-10 w-auto max-w-[220px] shrink-0 object-contain" />
      ) : (
        <StrataMark size={34} />
      )}
      {showName && (
        <span className="flex flex-col leading-none">
          <span className={`font-brand text-[24px] ${uppercase ? "tracking-[0.22em] uppercase" : "tracking-tight"}`}>{name}</span>
          {tagline && (
            <span className="mt-1.5 text-[9.5px] font-medium tracking-[0.3em] uppercase opacity-80">{tagline}</span>
          )}
        </span>
      )}
    </span>
  );
}
