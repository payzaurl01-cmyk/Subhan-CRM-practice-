"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { CRMRole, Viewer } from "@/lib/access/session";

type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
  roles: { key: string; name: string } | { key: string; name: string }[] | null;
};

function toViewer(profile: ProfileRecord, authEmail = ""): Viewer {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  if (
    !role ||
    !["super_admin", "admin", "manager", "installer"].includes(role.key)
  ) {
    throw new Error("Your account does not have a supported CRM role.");
  }
  if (profile.status !== "active") {
    throw new Error(
      `Your account is ${profile.status || "pending"}. Contact an administrator.`,
    );
  }

  const email = authEmail || profile.email || "";
  const name = profile.full_name || email.split("@")[0] || "CRM user";
  return {
    id: profile.id,
    name,
    email,
    role: role.key as CRMRole,
    roleName: role.name,
    initials: name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase(),
  };
}

export type CRMAuthBackend = ReturnType<typeof createCRMAuthBackend>;

export function createCRMAuthBackend() {
  const client = createBrowserSupabaseClient();
  if (!client) return null;

  async function loadViewer(userId: string, email = "") {
    const { data, error } = await client
      .from("profiles")
      .select("id, email, full_name, status, roles(key, name)")
      .eq("id", userId)
      .single();
    if (error || !data) {
      throw new Error(
        "Your staff profile is not ready. Contact an administrator.",
      );
    }
    return toViewer(data as unknown as ProfileRecord, email);
  }

  return {
    enabled: true,
    async restore() {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return loadViewer(data.user.id, data.user.email || "");
    },
    /** True only when the database confirms the signed-in user is the Super Admin. */
    async ownerAccess() {
      const { data, error } = await client.rpc("owner_portal_access");
      if (error) throw new Error("Access check failed. Please sign in again.");
      return data === true;
    },
    async reauthenticate(email: string, password: string) {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user)
        throw new Error("Current password is incorrect.");
      return loadViewer(data.user.id, data.user.email || "");
    },
    async updatePassword(password: string) {
      const { error } = await client.auth.updateUser({ password });
      if (error)
        throw new Error(error.message || "Password could not be updated.");
    },
    async signOut() {
      await client.auth.signOut({ scope: "local" });
    },
  };
}
