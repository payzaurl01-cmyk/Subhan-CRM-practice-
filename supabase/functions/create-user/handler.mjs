// Targeted compatibility update of the deployed create-user service. No passwords
// are accepted here. The real caller's current users.create flag is authoritative.
export function makeHandler({ createClient, env }) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  const key = (name, fallback) => {
    try {
      const v = JSON.parse(env(name) || "{}").default;
      if (typeof v === "string") return v;
    } catch {}
    return env(fallback) || "";
  };
  return async (req) => {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);
    const authorization = req.headers.get("authorization") || "";
    if (!/^Bearer \S+$/i.test(authorization))
      return json({ error: "authentication_required" }, 401);
    if (req.headers.get("x-crm-impersonation"))
      return json(
        { error: "exit_impersonation_before_account_provisioning" },
        403,
      );
    const url = env("SUPABASE_URL"),
      publicKey = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"),
      secret = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publicKey || !secret)
      return json({ error: "server_configuration_error" }, 500);
    const caller = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await caller.auth.getUser(authorization.slice(7));
    if (identity.error || !identity.data?.user)
      return json({ error: "invalid_session" }, 401);
    const access = await caller.rpc("get_access_context", {
      p_platform: "web",
    });
    if (access.error || !access.data?.profile)
      return json({ error: "access_context_denied" }, 403);
    const users = access.data.modules?.find((m) => m.key === "users");
    if (users?.can_create !== true)
      return json({ error: "user_create_permission_required" }, 403);
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const email = String(body.email || "")
        .trim()
        .toLowerCase(),
      full_name = String(body.full_name || "").trim(),
      role_key = String(body.role_key || "installer");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ error: "invalid_email" }, 400);
    if (!full_name || full_name.length > 150)
      return json({ error: "invalid_full_name" }, 400);
    if (!["admin", "manager", "installer"].includes(role_key))
      return json({ error: "invalid_staff_role" }, 400);
    if (access.data.profile.role !== "super_admin" && role_key === "admin")
      return json({ error: "protected_role_requires_super_admin" }, 403);
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const role = await admin
      .from("roles")
      .select("id,key")
      .eq("key", role_key)
      .eq("active", true)
      .single();
    if (role.error || !role.data)
      return json({ error: "role_not_configured" }, 400);
    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
    });
    if (invited.error || !invited.data?.user)
      return json(
        { error: "invite_failed", message: invited.error?.message },
        400,
      );
    const id = invited.data.user.id;
    const profile = await admin
      .from("profiles")
      .update({ role_id: role.data.id, status: "active" })
      .eq("id", id)
      .select("id")
      .single();
    if (profile.error || profile.data?.id !== id) {
      const cleanup = await admin.auth.admin.deleteUser(id);
      return json(
        {
          error: "profile_initialization_failed",
          account_created: Boolean(cleanup.error),
          user_id: id,
        },
        500,
      );
    }
    const audit = await admin
      .from("privileged_security_events")
      .insert({
        event_type: "user.invited",
        real_actor_user_id: identity.data.user.id,
        effective_actor_user_id: id,
        target_type: "profile",
        target_id: id,
        metadata: { email, role: role_key },
      });
    if (audit.error)
      return json(
        {
          error: "invitation_audit_failed",
          account_created: true,
          invitation_sent: true,
          user_id: id,
        },
        502,
      );
    return json(
      { user_id: id, email, role: role_key, invitation_sent: true },
      201,
    );
  };
}
