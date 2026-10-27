import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_RETURN_COOKIE,
} from "@/features/crm/impersonation.js";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const client = await createServerSupabaseClient(true);
  const { data: auth } = await client.auth.getUser();
  const jar = await cookies(),
    id = jar.get(IMPERSONATION_COOKIE)?.value;
  if (
    auth.user &&
    id &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
  ) {
    const { error } = await client.rpc("end_impersonation", {
      p_session_id: id,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    // The RPC verifies the original actor and login session, including cleanup
    // after authority revocation. false confirms an already ended/missing record.
  }
  const returnTo = ["/crm/users", encodeURIComponent("/crm/users")].includes(
    jar.get(IMPERSONATION_RETURN_COOKIE)?.value || "",
  )
    ? "/crm/users"
    : "/crm/master";
  jar.delete(IMPERSONATION_COOKIE);
  jar.delete(IMPERSONATION_RETURN_COOKIE);
  const { data: access, error } = await client.rpc("get_access_context", {
    p_platform: "web",
  });
  const destination =
    error ||
    access?.profile?.status !== "active" ||
    !access?.modules?.some((m: { can_view: boolean }) => m.can_view)
      ? "/login?reason=access"
      : access.profile.role === "super_admin"
        ? returnTo
        : "/crm/dashboard";
  return NextResponse.redirect(new URL(destination, request.url), 303);
}
