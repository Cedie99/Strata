import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no cookie → send to /login. The real session and
// permission checks happen in requireUser()/requirePermission() on the server.
const SESSION_COOKIE = "erp_session";

export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // App icons and the brand logo must load before sign-in (browser tab, home screen, sign-in page).
  matcher: ["/((?!login|brand/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
