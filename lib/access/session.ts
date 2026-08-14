import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  demo: boolean;
};

const demoViewer: Viewer = {
  id: "demo-super-admin",
  name: "Alex Morgan",
  email: "alex@interiorblinds.co.uk",
  role: "Super Admin",
  initials: "AM",
  demo: true,
};

export const requireViewer = cache(async (): Promise<Viewer> => {
  if (!isSupabaseConfigured()) return demoViewer;

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  const { data: rawProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, status, roles(name)")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !rawProfile) redirect("/login?reason=profile");

  const profile = rawProfile as unknown as {
    full_name: string | null;
    status: string | null;
    roles: { name: string } | { name: string }[] | null;
  };

  if (profile.status && profile.status !== "active") {
    redirect(`/login?reason=${encodeURIComponent(profile.status)}`);
  }

  const name = profile.full_name || authData.user.email?.split("@")[0] || "CRM user";
  const roles = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;

  return {
    id: authData.user.id,
    name,
    email: authData.user.email || "",
    role: roles?.name || "Team member",
    initials: name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase(),
    demo: false,
  };
});
