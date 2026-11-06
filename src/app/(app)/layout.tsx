import Link from "next/link";
import { Brand } from "@/components/brand";
import { can, requireUser } from "@/core/auth/guard";
import { pickBranch } from "@/core/branch-actions";
import { getBranchScope } from "@/core/branches";
import { brandProps, getBranding } from "@/core/branding";
import { getSettings } from "@/core/settings";
import { getModules } from "@/modules/registry";
import { logout } from "../login/actions";
import { BranchPicker, MenuBar, UserMenu } from "./menu-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, settings, brand, modules, scope] = await Promise.all([
    requireUser(),
    getSettings(),
    getBranding(),
    getModules(),
    getBranchScope(),
  ]);

  // Each module contributes its own menu, filtered by what this user may see. Modules placed in
  // another module's menu (e.g. an admin-built Item Master under Inventory) add their items to it,
  // so a user who can only see the Item Master still gets an Inventory menu with just that.
  const own = modules.filter((m) => !m.menu);
  const sections = own
    .map((m) => ({
      id: m.id,
      name: m.name,
      nav: [m, ...modules.filter((p) => p.menu === m.id)]
        .flatMap((x) => x.nav)
        .filter((item) => can(user, item.permission)),
    }))
    .filter((m) => m.nav.length > 0);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-stretch justify-between gap-4 bg-header px-3 text-header-text">
        <Link href="/" className="flex items-center py-3">
          <Brand {...brandProps(brand)} />
        </Link>
        <div className="flex flex-col items-end justify-between py-1.5 text-[13px]">
          <div className="flex items-center gap-5">
            <BranchPicker
              key={scope.current?.id ?? ""}
              branches={scope.allowed.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
              currentId={scope.current?.id ?? ""}
              pick={pickBranch}
            />
            <UserMenu name={user.name} signOut={logout} />
            <span className="hidden items-center gap-1.5 sm:flex">
              <svg viewBox="0 0 20 16" className="h-4 w-5 fill-current" aria-hidden>
                <circle cx="7" cy="4" r="3.2" />
                <circle cx="14.5" cy="5" r="2.6" />
                <path d="M0 15c0-3.6 3-6 7-6s7 2.4 7 6z" />
                <path d="M13 9.4c3.7-.5 7 1.4 7 5.6h-5c0-2.3-.7-4.2-2-5.6z" />
              </svg>
              {user.roles.join(", ") || "No role"}
            </span>
          </div>
          <p className="hidden sm:block">
            <span className="text-[10px] italic opacity-90">Licensed to : </span>
            <span className="text-[15px] italic">{settings["company.name"]}</span>
          </p>
        </div>
      </header>
      <MenuBar sections={sections} />
      <main className="min-w-0 flex-1 px-1 pt-1 pb-6">{children}</main>
    </div>
  );
}
