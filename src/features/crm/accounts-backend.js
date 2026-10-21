export const ACCOUNT_PERMISSIONS = Object.freeze({
  update: "Edit profile",
  change_role: "Change role",
  change_password: "Change password",
  block: "Block / unblock",
  delete: "Delete account",
});

export function usersModule(context) {
  return context?.modules?.find((module) => module.key === "users");
}

export function isProtectedAccount(target) {
  return (
    target?.role === "super_admin" ||
    target?.email?.toLowerCase() === "annasabbas01@gmail.com"
  );
}

export class AccountError extends Error {
  constructor(message, partial = false) {
    super(message);
    this.name = "AccountError";
    this.partial = partial;
  }
}

// Uses only the signed-in user's authenticated client. Never an admin key.
export function createAccountsBackend(client) {
  async function context() {
    const { data, error } = await client.rpc("get_access_context", {
      p_platform: "web",
    });
    if (error) throw new AccountError(error.message);
    if (!data?.profile?.id || data.profile.status !== "active")
      throw new AccountError("Active profile required");
    if (data.system_lock?.locked === true)
      throw new AccountError(
        data.system_lock.message || "Workspace access is locked",
      );
    // The deployed resolver checks auth.sessions. Revoked JWTs resolve no grants,
    // even while get_access_context can still return an active profile.
    if (!data.modules?.some((module) => module.can_view === true))
      throw new AccountError(
        "Your session has no workspace access. Please sign in again.",
      );
    return data;
  }

  async function authorize(action, target) {
    const access = await context();
    if (usersModule(access)?.[`can_${action}`] !== true)
      throw new AccountError(`Account permission required: users.${action}`);
    if (
      target &&
      isProtectedAccount(target) &&
      (["delete", "block", "change_role"].includes(action) ||
        access.profile.role !== "super_admin")
    )
      throw new AccountError("Super Admin account is protected");
    if (
      target?.id === access.profile.id &&
      ["delete", "block", "change_role"].includes(action)
    )
      throw new AccountError(
        "Cannot change your own role or account status, or delete the active account",
      );
    return access;
  }

  async function confirmedRPC(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new AccountError(error.message);
    if (data !== true)
      throw new AccountError("The backend did not confirm completion");
  }

  async function superAdmin() {
    const access = await context();
    if (access.profile.role !== "super_admin")
      throw new AccountError("Super Admin required");
  }

  return {
    context,
    async list(access) {
      if (usersModule(access)?.can_view !== true) return [];
      const { data, error } = await client
        .from("profiles")
        .select("id,email,full_name,phone,status,last_seen_at,roles(key,name)")
        .order("full_name");
      if (error) throw new AccountError(error.message);
      return (data || []).map((profile) => ({
        ...profile,
        role: (Array.isArray(profile.roles) ? profile.roles[0] : profile.roles)
          ?.key,
      }));
    },
    async permissionRules(access) {
      if (access.profile.role !== "super_admin")
        return { roles: [], users: [] };
      const results = await Promise.all([
        client
          .from("role_permissions")
          .select("effect,roles(key),permissions(key)"),
        client
          .from("user_permissions")
          .select("user_id,effect,starts_at,ends_at,permissions(key)"),
      ]);
      for (const result of results)
        if (result.error) throw new AccountError(result.error.message);
      return { roles: results[0].data || [], users: results[1].data || [] };
    },
    async updateProfile(target, details) {
      await authorize("update", target);
      const full_name = String(details.full_name || "").trim();
      if (!full_name) throw new AccountError("Full name is required");
      const { data, error } = await client
        .from("profiles")
        .update({ full_name, phone: String(details.phone || "").trim() })
        .eq("id", target.id)
        .select("id")
        .single();
      if (error) throw new AccountError(error.message);
      if (data?.id !== target.id)
        throw new AccountError("Profile update was not confirmed");
    },
    async changeRole(target, role) {
      await authorize("change_role", target);
      if (!["admin", "manager", "installer"].includes(role))
        throw new AccountError("Invalid staff role");
      await confirmedRPC("admin_update_user_access", {
        p_user_id: target.id,
        p_role_key: role,
        p_status: target.status,
      });
    },
    async setBlocked(target, blocked) {
      await authorize("block", target);
      await confirmedRPC("admin_set_user_blocked", {
        p_user_id: target.id,
        p_blocked: blocked,
      });
    },
    async changePassword(target, password) {
      await authorize("change_password", target);
      if (password.length < 12 || password.length > 1024)
        throw new AccountError("Use a password with 12 to 1024 characters");
      const { data: session, error: sessionError } =
        await client.auth.getSession();
      if (sessionError) throw new AccountError(sessionError.message);
      if (!session?.session?.access_token)
        throw new AccountError("Active session required");
      const { data, error } = await client.functions.invoke(
        "owner-change-password",
        {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
          body: { user_id: target.id, password },
        },
      );
      let body = data;
      if (error?.context instanceof Response) {
        try {
          body = await error.context.clone().json();
        } catch {
          /* Keep original backend error. */
        }
      }
      if (error || body?.success !== true) {
        const partial = body?.password_changed === true;
        throw new AccountError(
          `${body?.error || error?.message || "Password update was not confirmed"}${partial ? ". Password changed, but session cleanup or auditing did not complete. Do not retry the password change automatically." : ""}`,
          partial,
        );
      }
    },
    async deleteAccount(target) {
      await authorize("delete", target);
      await confirmedRPC("admin_delete_user", { p_user_id: target.id });
    },
    async setRolePermission(role, key, effect) {
      await superAdmin();
      if (
        !["admin", "manager"].includes(role) ||
        !["allow", "deny"].includes(effect) ||
        !Object.hasOwn(ACCOUNT_PERMISSIONS, key)
      )
        throw new AccountError("Invalid role permission");
      await confirmedRPC("admin_set_role_permission", {
        p_role_key: role,
        p_permission_key: `users.${key}`,
        p_effect: effect,
      });
    },
    async setUserPermission(target, key, effect) {
      await superAdmin();
      if (isProtectedAccount(target))
        throw new AccountError("Super Admin remains unrestricted");
      if (
        !Object.hasOwn(ACCOUNT_PERMISSIONS, key) ||
        !["allow", "deny", "default"].includes(effect)
      )
        throw new AccountError("Invalid user permission");
      await confirmedRPC("admin_set_user_permission", {
        p_user_id: target.id,
        p_permission_key: `users.${key}`,
        p_effect: effect,
      });
    },
    watch(onChange) {
      let timer;
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 150);
      };
      const channel = client.channel("crm-account-access");
      for (const table of [
        "profiles",
        "role_permissions",
        "user_permissions",
        "module_access_rules",
        "system_lock_rules",
      ])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          schedule,
        );
      channel.subscribe();
      const { data } = client.auth.onAuthStateChange(schedule);
      return () => {
        clearTimeout(timer);
        data.subscription.unsubscribe();
        void client.removeChannel(channel);
      };
    },
  };
}
