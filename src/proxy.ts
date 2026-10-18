import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { refreshSupabaseSession } from "@/lib/supabase/session-proxy";

export async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.CRM_E2E_DEMO_AUTH === "1"
  ) {
    return NextResponse.next();
  }
  if (!isSupabaseConfigured()) return NextResponse.next();
  const { response, signedIn } = await refreshSupabaseSession(request);
  const { pathname } = request.nextUrl;
  const isPublic =
    ["/login", "/signup", "/forgot-password", "/reset-password"].includes(
      pathname,
    ) ||
    pathname.startsWith("/auth/") ||
    pathname === "/api/health";
  // Optimistic check only; pages and actions re-verify on the server.
  if (!signedIn && !isPublic)
    return NextResponse.redirect(new URL("/login", request.url));
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
