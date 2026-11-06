import { requireUser } from "@/core/auth/guard";
import "./print.css";

// Printed documents live outside the app frame (no title bar or menus). Each page checks its own permission.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="print-desk">{children}</div>;
}
