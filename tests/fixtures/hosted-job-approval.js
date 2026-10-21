import { mountCRM } from "/__approval-fixture/runtime.js";
import { createJobApprovalBackend } from "/__approval-fixture/job-approval-backend.js";

export async function mount(role = "admin") {
  const user = {
    id: role,
    email: `${role}@example.test`,
    name: `${role} Staff`,
    role,
    roleName: role,
    initials: "AS",
  };
  async function call(name, args) {
    return (
      await fetch("/__approval-fixture/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, args, role }),
      })
    ).json();
  }
  const client = {
    rpc: call,
    channel() {
      const channel = {
        on() {
          return channel;
        },
        subscribe() {},
      };
      return channel;
    },
    removeChannel() {},
  };
  const backend = createJobApprovalBackend(client);
  const access = async () => {
    const reply = await call("access");
    if (reply.error) throw new Error(reply.error.message);
    return reply.data;
  };
  const staff = ["admin", "manager", "super_admin", "installer"].map((key) => ({
    id: key,
    email: `${key}@example.test`,
    full_name: `${key} Staff`,
    role_key: key,
  }));
  const store = {
    sync: async (state) => {
      const r = await call("sync", state);
      if (r.error) throw new Error(r.error.message);
    },
    load: async () => (await call("records")).data,
    staff: async () => staff,
    getMedia: async () =>
      new Blob(["mock persisted media"], { type: "image/png" }),
  };
  document.body.innerHTML =
    '<div id="fixture-root"><div id="app"></div><div id="overlay" class="modal-layer"></div><div id="toasts" class="toast-wrap" aria-live="polite"></div></div>';
  history.replaceState(null, "", "/crm/jobs");
  window.approvalFixture = {
    backend,
    dispose: mountCRM(document.getElementById("fixture-root"), "jobs", {
      viewer: user,
      auth: {
        enabled: true,
        jobApprovals: backend,
        accounts: {
          context: access,
          list: async () => [],
          permissionRules: async () => ({ roles: [], users: [] }),
          watch: () => () => {},
        },
        signOut: async () => {},
      },
      accounts: {
        context: await access(),
        accounts: [],
        rules: { roles: [], users: [] },
      },
      cloud: { store, data: await store.load(), staff },
    }),
  };
}
