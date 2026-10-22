import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { IMPERSONATION_COOKIE } from "@/features/crm/impersonation.js";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const client = await createServerSupabaseClient(true);
  const { data: owner, error: accessError } = await client.rpc(
    "owner_portal_access",
  );
  if (accessError || owner !== true)
    return NextResponse.json(
      { error: accessError?.message || "Super Admin session required" },
      { status: 403 },
    );
  const jar = await cookies(),
    id = jar.get(IMPERSONATION_COOKIE)?.value;
  if (id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    const { error } = await client.rpc("end_impersonation", {
      p_session_id: id,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    // false means already ended/missing. The original verified owner can still
    // discard an invalid local selector; no target's authorization is granted.
  }
  jar.delete(IMPERSONATION_COOKIE);
  return NextResponse.redirect(new URL("/crm/master", request.url), 303);
}
