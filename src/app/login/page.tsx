import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand, StrataMark } from "@/components/brand";
import { getCurrentUser } from "@/core/auth/guard";
import { brandProps, getBranding } from "@/core/branding";
import { getSettings } from "@/core/settings";
import packageJson from "../../../package.json";
import { login } from "./actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// What the system does today; keep this list to features that exist.
const HIGHLIGHTS = [
  { title: "Inventory across branches", text: "Stock on hand, movements and warehouses for every site." },
  { title: "Role-based access", text: "Each team sees only the menus and branches it needs." },
  { title: "Complete audit trail", text: "Every change is recorded with who, when and what changed." },
  { title: "Your own modules", text: "Build new record types and menus without writing code." },
];

/** Large faint logo (or the built-in mark) behind the brand panel. */
function Backdrop({ logoUrl }: { logoUrl: string | null }) {
  const className = "pointer-events-none absolute -right-24 -bottom-24 h-[34rem] w-[34rem] object-contain opacity-[0.07]";
  // eslint-disable-next-line @next/next/no-img-element -- decorative copy of the brand logo
  return logoUrl ? <img src={logoUrl} alt="" className={className} /> : <StrataMark size={544} className={className} />;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const [{ next }, settings, brand] = await Promise.all([searchParams, getSettings(), getBranding()]);
  const appName = brand.name;
  const brandInfo = brandProps(brand);
  const company = settings["company.name"];
  const year = new Date().getFullYear();

  return (
    <main className="flex min-h-screen flex-col bg-bg lg:flex-row">
      {/* Brand panel */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-header px-6 py-6 text-header-text lg:w-[46%] lg:px-12 lg:py-10">
        <Backdrop logoUrl={brandInfo.logoUrl} />
        <Brand {...brandInfo} />
        <div className="relative my-10 hidden max-w-md lg:block">
          <p className="mb-3 text-[11px] font-bold tracking-[0.3em] text-accent uppercase">
            Welcome back
          </p>
          <h2 className="text-[30px] leading-tight font-semibold tracking-tight">
            {brand.loginHeadline}
          </h2>
          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 bg-accent" aria-hidden />
                <span>
                  <span className="block font-semibold">{h.title}</span>
                  <span className="block text-[13px] text-header-text/70">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden text-[12px] text-header-text/60 lg:block">
          © {year} {appName} · Version {packageJson.version}
        </p>
      </section>

      {/* Sign-in */}
      <section className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[25rem]">
            <div className="mb-6">
              <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Licensed to</p>
              <p className="mt-0.5 text-[15px] font-semibold">{company}</p>
              {settings["company.address"] && (
                <p className="mt-0.5 text-[12px] whitespace-pre-line text-muted">{settings["company.address"]}</p>
              )}
            </div>

            <div className="border border-border border-t-[3px] border-t-primary bg-surface p-7 shadow-[0_8px_30px_rgba(10,12,11,0.08)]">
              <h1 className="text-[22px] font-semibold tracking-tight">Sign in to your account</h1>
              <p className="mt-1 mb-6 text-muted">Use the email and password given to you by your administrator.</p>
              <LoginForm action={login} next={next} />
              <p className="mt-6 border-t border-border pt-4 text-[12px] text-muted">
                Forgot your password or need access? Contact your system administrator.
              </p>
            </div>

            <div className="mt-5 flex gap-2.5 border-l-2 border-accent bg-surface/60 py-1 pl-3 text-[12px] text-muted">
              <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 fill-primary" aria-hidden>
                <path d="M10 1 3 3.8v5.1c0 4.4 3 8.5 7 10.1 4-1.6 7-5.7 7-10.1V3.8L10 1Zm-1 12.6L5.6 10.2l1.3-1.3L9 11l4.1-4.1 1.3 1.3L9 13.6Z" />
              </svg>
              <p>
                For authorized users of {company} only. Sign-ins and changes are recorded in the audit log. Do not share
                your password.
              </p>
            </div>
          </div>
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-border px-6 py-3 text-[11px] text-muted lg:justify-end">
          <span className="lg:hidden">
            © {year} {appName} · v{packageJson.version}
          </span>
          <span>Sessions expire 7 days after sign-in</span>
        </footer>
      </section>
    </main>
  );
}
