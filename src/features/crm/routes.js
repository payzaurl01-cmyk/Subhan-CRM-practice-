export const MODULES = Object.freeze([
  "dashboard",
  "master",
  "chat",
  "leads",
  "contacts",
  "quotes",
  "jobs",
  "tasks",
  "calendar",
  "inventory",
  "picking",
  "returns",
  "purchasing",
  "email",
  "billing",
  "reports",
  "users",
  "logs",
  "profile",
]);
export function modulePath(page, owner = false) {
  const valid = MODULES.includes(page) ? page : "dashboard";
  return owner
    ? valid === "master"
      ? "/owner"
      : `/owner/${valid}`
    : `/crm/${valid}`;
}
export function moduleFromPath(path) {
  const [base, page] = path.split("/").filter(Boolean);
  return MODULES.includes(page)
    ? page
    : base === "owner"
      ? "master"
      : "dashboard";
}
export function resolveEntry(segments = []) {
  if (segments.length === 0) return { page: "dashboard" };
  const [base, page, ...rest] = segments;
  if (rest.length || !["crm", "owner"].includes(base)) return null;
  if (page && !MODULES.includes(page)) return null;
  if (base === "crm" && page === "master") return null;
  return { page: page || (base === "owner" ? "master" : "dashboard") };
}
