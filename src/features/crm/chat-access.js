export function canUseChat(user) {
  return Boolean(user && user.role !== "super_admin");
}

export function availableChatUsers(viewer, users) {
  if (!canUseChat(viewer)) return [];
  return users.filter(
    (user) =>
      user.id !== viewer.id &&
      user.status === "Active" &&
      user.role !== "super_admin" &&
      (viewer.role !== "installer" ||
        ["admin", "manager"].includes(user.role)),
  );
}
