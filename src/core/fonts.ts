import {
  Audiowide,
  DM_Sans,
  Exo_2,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Lato,
  Manrope,
  Michroma,
  Montserrat,
  Noto_Sans,
  Nunito_Sans,
  Open_Sans,
  Orbitron,
  Oswald,
  Playfair_Display,
  Poppins,
  Public_Sans,
  Raleway,
  Roboto,
  Roboto_Mono,
  Source_Code_Pro,
  Source_Sans_3,
  Space_Grotesk,
  Work_Sans,
} from "next/font/google";

/*
 * Every typeface an admin can pick under Setup → Branding. next/font self-hosts them at build time,
 * so the choice must come from this fixed list (fonts cannot be fetched at run time). Nothing is
 * preloaded: the browser downloads only the faces the current brand actually uses. next/font requires
 * literal options in every call, hence the repetition.
 * The brand stylesheet points --brand-font-* at the chosen face via its generated font-family name.
 */

const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });
const roboto = Roboto({ subsets: ["latin"], display: "swap", preload: false });
const openSans = Open_Sans({ subsets: ["latin"], display: "swap", preload: false });
const lato = Lato({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "700"] });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap", preload: false });
const nunitoSans = Nunito_Sans({ subsets: ["latin"], display: "swap", preload: false });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap", preload: false });
const notoSans = Noto_Sans({ subsets: ["latin"], display: "swap", preload: false });
const publicSans = Public_Sans({ subsets: ["latin"], display: "swap", preload: false });
const poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500", "600", "700"] });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap", preload: false });
const raleway = Raleway({ subsets: ["latin"], display: "swap", preload: false });

const michroma = Michroma({ subsets: ["latin"], display: "swap", preload: false, weight: "400" });
const orbitron = Orbitron({ subsets: ["latin"], display: "swap", preload: false });
const audiowide = Audiowide({ subsets: ["latin"], display: "swap", preload: false, weight: "400" });
const exo2 = Exo_2({ subsets: ["latin"], display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap", preload: false });

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], display: "swap", preload: false, weight: ["400", "500"] });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap", preload: false });
const robotoMono = Roboto_Mono({ subsets: ["latin"], display: "swap", preload: false });
const sourceCodePro = Source_Code_Pro({ subsets: ["latin"], display: "swap", preload: false });

type Font = { style: { fontFamily: string } };
type Entry = { id: string; label: string; font: Font | null; fallback: string };

const SANS = '"Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif';
const MONO = "Consolas, ui-monospace, monospace";
const system = (label: string, fallback: string): Entry => ({ id: "system", label, font: null, fallback });

/** Body text: everything except the wordmark and codes. */
export const TEXT_FONTS: Entry[] = [
  { id: "manrope", label: "Manrope", font: manrope, fallback: SANS },
  { id: "inter", label: "Inter", font: inter, fallback: SANS },
  { id: "roboto", label: "Roboto", font: roboto, fallback: SANS },
  { id: "open-sans", label: "Open Sans", font: openSans, fallback: SANS },
  { id: "lato", label: "Lato", font: lato, fallback: SANS },
  { id: "plex-sans", label: "IBM Plex Sans", font: plexSans, fallback: SANS },
  { id: "source-sans", label: "Source Sans 3", font: sourceSans, fallback: SANS },
  { id: "nunito-sans", label: "Nunito Sans", font: nunitoSans, fallback: SANS },
  { id: "work-sans", label: "Work Sans", font: workSans, fallback: SANS },
  { id: "dm-sans", label: "DM Sans", font: dmSans, fallback: SANS },
  { id: "noto-sans", label: "Noto Sans", font: notoSans, fallback: SANS },
  { id: "public-sans", label: "Public Sans", font: publicSans, fallback: SANS },
  { id: "poppins", label: "Poppins", font: poppins, fallback: SANS },
  { id: "montserrat", label: "Montserrat", font: montserrat, fallback: SANS },
  system("System default (Segoe UI / San Francisco)", SANS),
];

/** The wordmark (system name in the title bar and on the sign-in page). */
export const DISPLAY_FONTS: Entry[] = [
  { id: "michroma", label: "Michroma", font: michroma, fallback: SANS },
  { id: "orbitron", label: "Orbitron", font: orbitron, fallback: SANS },
  { id: "audiowide", label: "Audiowide", font: audiowide, fallback: SANS },
  { id: "exo2", label: "Exo 2", font: exo2, fallback: SANS },
  { id: "oswald", label: "Oswald", font: oswald, fallback: SANS },
  { id: "space-grotesk", label: "Space Grotesk", font: spaceGrotesk, fallback: SANS },
  { id: "playfair", label: "Playfair Display (serif)", font: playfair, fallback: "Georgia, serif" },
  { id: "raleway", label: "Raleway", font: raleway, fallback: SANS },
  { id: "montserrat", label: "Montserrat", font: montserrat, fallback: SANS },
  { id: "poppins", label: "Poppins", font: poppins, fallback: SANS },
  { id: "manrope", label: "Manrope", font: manrope, fallback: SANS },
  { id: "inter", label: "Inter", font: inter, fallback: SANS },
  system("System default", SANS),
];

/** Codes and document numbers: should be fixed-width so they line up. */
export const MONO_FONTS: Entry[] = [
  { id: "plex-mono", label: "IBM Plex Mono", font: plexMono, fallback: MONO },
  { id: "jetbrains-mono", label: "JetBrains Mono", font: jetbrainsMono, fallback: MONO },
  { id: "roboto-mono", label: "Roboto Mono", font: robotoMono, fallback: MONO },
  { id: "source-code-pro", label: "Source Code Pro", font: sourceCodePro, fallback: MONO },
  system("System default (Consolas / Menlo)", MONO),
];

export type FontRole = "text" | "display" | "mono";
const LISTS: Record<FontRole, Entry[]> = { text: TEXT_FONTS, display: DISPLAY_FONTS, mono: MONO_FONTS };

/** Options for a picker (id + label only, safe to send to the browser). */
export const fontOptions = (role: FontRole) => LISTS[role].map(({ id, label }) => ({ value: id, label }));

export const isFontId = (role: FontRole, id: string) => LISTS[role].some((f) => f.id === id);

/** The CSS font-family stack for a chosen font id (falls back to the system stack for unknown ids). */
export function fontStack(role: FontRole, id: string) {
  const entry = LISTS[role].find((f) => f.id === id) ?? LISTS[role].at(-1)!;
  return entry.font ? `${entry.font.style.fontFamily}, ${entry.fallback}` : entry.fallback;
}

