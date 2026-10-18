import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const CRM_ROLES = [
  "super_admin",
  "admin",
  "manager",
  "installer",
] as const;

export type CRMRole = (typeof CRM_ROLES)[number];

export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: CRMRole;
  roleName: string;
  initials: string;
};

type ProfileRecord = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: string | null;
  roles: { key: string; name: string } | { key: string; name: string }[] | null;
};

function roleRecord(profile: ProfileRecord) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export const requireViewer = cache(async (): Promise<Viewer> => {
  if (!isSupabaseConfigured()) redirect("/login?reason=configuration");

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, status, roles(key, name)")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !data) redirect("/login?reason=profile");
  const profile = data as unknown as ProfileRecord;
  if (profile.status !== "active") {
    redirect(
      `/login?reason=${encodeURIComponent(profile.status || "pending")}`,
    );
  }

  const role = roleRecord(profile);
  if (!role || !CRM_ROLES.includes(role.key as CRMRole)) {
    redirect("/login?reason=role");
  }

  const email = authData.user.email || profile.email || "";
  const name = profile.full_name || email.split("@")[0] || "CRM user";

  return {
    id: authData.user.id,
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
});

/**
 * Asks the database whether the signed-in user is the Super Admin, using the
 * user's own session. Only an exact `true` with no error grants access.
 */
export const getOwnerAccess = cache(async (): Promise<boolean> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("owner_portal_access");
  if (error) redirect("/login?reason=access");
  return data === true;
});

/** Use at the top of privileged pages, route handlers and server actions. */
export async function requireOwner(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!(await getOwnerAccess())) redirect("/crm/dashboard");
  return viewer;
}
