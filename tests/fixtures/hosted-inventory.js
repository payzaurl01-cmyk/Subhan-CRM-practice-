import { mountCRM } from "/__inventory-fixture/runtime.js";
import { createInventoryBackend } from "/__inventory-fixture/inventory-backend.js";

export async function mount(role = "admin") {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "inventory@example.com",
    name: "Inventory Staff",
    role,
    roleName: role,
    initials: "IS",
  };
  const context = {
    profile: { ...user, status: "active" },
    modules: [
      { key: "dashboard", can_view: true },
      ...["inventory", "warehouse", "purchasing", "jobs"].map((key) => ({
        key,
        can_view: role !== "installer" || key !== "purchasing",
        can_create: role !== "installer",
        can_update: role !== "installer" || key === "jobs",
        can_delete: role !== "installer",
      })),
    ],
  };
  async function call(name, args) {
    const response = await fetch("/__inventory-fixture/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args, role }),
    });
    return response.json();
  }
  const client = {
    rpc: call,
    auth: { getUser: async () => ({ data: { user } }) },
    storage: {
      from() {
        return {
          upload: (path, file) =>
            call("upload", { path, type: file.type, size: file.size }),
          createSignedUrl: async () => ({
            data: {
              signedUrl:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            },
          }),
        };
      },
    },
    from() {
      return {
        select() {
          return {
            eq(key, id) {
              const chain = {
                order() {
                  return chain;
                },
                range: async (offset) => call("history", { id, offset }),
              };
              return chain;
            },
          };
        },
      };
    },
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
  const backend = createInventoryBackend(client);
  document.body.innerHTML =
    '<div id="fixture-root"><div id="app"></div><div id="overlay" class="modal-layer"></div><div id="toasts" class="toast-wrap" aria-live="polite"></div></div>';
  history.replaceState(null, "", "/crm/inventory");
  window.inventoryFixture = {
    context,
    backend,
    dispose: mountCRM(document.getElementById("fixture-root"), "inventory", {
      viewer: user,
      auth: { enabled: true, inventory: backend, signOut: async () => {} },
      accounts: { context, accounts: [], rules: { roles: [], users: [] } },
      inventory: { data: await backend.load(), error: "" },
      cloud: {
        data: {},
        staff: [
          {
            id: user.id,
            email: user.email,
            full_name: user.name,
            role_key: role,
          },
        ],
        store: {
          sync: async () => {},
          load: async () => ({}),
          staff: async () => [
            {
              id: user.id,
              email: user.email,
              full_name: user.name,
              role_key: role,
            },
          ],
        },
      },
    }),
  };
}
