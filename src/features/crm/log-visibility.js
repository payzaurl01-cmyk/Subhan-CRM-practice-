// Backend RLS is authoritative. Apply the same maximum to unsaved/demo events
// and any already-loaded records while access is being refreshed.
export function visibleActorLog(viewerRole, actorRole) {
  if (viewerRole === "super_admin") return true;
  if (viewerRole === "admin")
    return ["admin", "manager", "installer"].includes(actorRole);
  if (viewerRole === "manager")
    return ["manager", "installer"].includes(actorRole);
  // The module gate still applies; a permitted installer sees installer events.
  return viewerRole === "installer" && actorRole === "installer";
}
