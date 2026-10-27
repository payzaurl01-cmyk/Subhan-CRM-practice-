// Every administrative write is authorized again by the deployed RPC, including
// when a caller bypasses the UI. No service key is needed in this adapter.
export function createMasterBackend(client) {
  async function rpc(name, args, confirmation = true) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    if (confirmation && data !== true)
      throw new Error("The backend did not confirm completion");
    if (!confirmation && !data)
      throw new Error("The backend returned no access data");
    return data;
  }
  return {
    async load(user = null, role = null) {
      try {
        return await rpc(
          "admin_get_master_control",
          { p_user_id: user, p_role_key: role },
          false,
        );
      } catch (failure) {
        if (!["PGRST202", "42883"].includes(failure.code)) throw failure;
        // Older deployments retain their ordinary controls while the focused
        // extension is pending. New override controls remain visibly disabled.
        const tables = [
          "system_modules",
          "permissions",
          "roles",
          "role_permissions",
          "user_permissions",
          "module_access_rules",
          "system_lock_rules",
          "impersonation_sessions",
        ];
        const values = await Promise.all(
          tables.map((table) => client.from(table).select("*")),
        );
        for (const result of values)
          if (result.error) throw new Error(result.error.message);
        const rows = Object.fromEntries(
          tables.map((table, i) => [table, values[i].data || []]),
        );
        return {
          schema_version: 1,
          modules: rows.system_modules,
          permissions: rows.permissions,
          roles: rows.roles,
          role_permissions: rows.role_permissions,
          user_permissions: rows.user_permissions,
          module_rules: rows.module_access_rules,
          system_locks: rows.system_lock_rules,
          rules: [],
          effective: [],
          deployment_pending: true,
          active_impersonations: rows.impersonation_sessions.filter(
            (session) =>
              session.status === "active" &&
              new Date(session.expires_at).getTime() > Date.now(),
          ),
        };
      }
    },
    module: (key, scope, target, state) =>
      rpc("admin_set_module_access", {
        p_module_key: key,
        p_scope: scope,
        p_target_id: target,
        p_state: state,
      }),
    permission: (scope, target, key, effect) =>
      rpc(
        scope === "role"
          ? "admin_set_role_permission"
          : "admin_set_user_permission",
        scope === "role"
          ? { p_role_key: target, p_permission_key: key, p_effect: effect }
          : { p_user_id: target, p_permission_key: key, p_effect: effect },
      ),
    rule: (kind, scope, target, module, action, effect) =>
      rpc("admin_set_access_rule", {
        p_kind: kind,
        p_scope: scope,
        p_target_id: target,
        p_module_key: module,
        p_action: action,
        p_effect: effect,
      }),
    bulk: (scope, target, mode, kind = "full") =>
      rpc("admin_bulk_access", {
        p_scope: scope,
        p_target_id: target,
        p_mode: mode,
        p_kind: kind,
      }),
    lock: (locked, title, message) =>
      rpc("admin_set_system_lock", {
        p_locked: locked,
        p_title: title,
        p_message: message,
      }),
    async enrollMFA() {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "CRM owner authenticator",
      });
      if (error) throw new Error(error.message);
      if (!data?.id || !data.totp?.qr_code)
        throw new Error("Authenticator enrollment was not confirmed");
      return { id: data.id, qr: data.totp.qr_code };
    },
    async verifyMFA(id, code) {
      const { data, error } = await client.auth.mfa.challengeAndVerify({
        factorId: id,
        code,
      });
      if (error) throw new Error(error.message);
      if (!data?.access_token)
        throw new Error("Authenticator verification was not confirmed");
    },
    async cancelMFA(id) {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      const factor = data?.all?.find((f) => f.id === id);
      if (factor?.status !== "unverified") return;
      const result = await client.auth.mfa.unenroll({ factorId: id });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.id !== id)
        throw new Error("Authenticator cancellation was not confirmed");
    },
    async start(target) {
      const support = await rpc(
        "get_access_context",
        { p_platform: "web" },
        false,
      );
      if (support.impersonation_supported !== true)
        throw new Error(
          "The scoped impersonation backend must be deployed before Login as user can be used safely",
        );
      const id = await rpc(
        "start_impersonation",
        {
          p_target_user_id: target,
          p_reason: "Super Admin initiated Login as user.",
          p_ticket_reference: null,
        },
        false,
      );
      if (
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
      )
        throw new Error("Impersonation was not confirmed");
      return id;
    },
    async end(id) {
      const { data, error } = await client.rpc("end_impersonation", {
        p_session_id: id,
      });
      if (error)
        throw Object.assign(new Error(error.message), { code: error.code });
      if (typeof data !== "boolean")
        throw new Error("The backend did not confirm session cleanup");
      return data;
    },
  };
}
