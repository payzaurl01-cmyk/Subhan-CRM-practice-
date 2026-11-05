import assert from "node:assert/strict";
import test from "node:test";
import { customerDirectory } from "../src/features/crm/contact-directory.js";

test("repeat leads stay separate while contacts merge by email or phone", () => {
  const leads = [
    { id: "a", customer: "Alex", email: "Alex@Example.com", phone: "0412 345 678", createdAt: "2026-11-01" },
    { id: "b", customer: "Alex", email: "other@example.com", phone: "+61 412 345 678", createdAt: "2026-11-02" },
    { id: "c", customer: "Alex", email: "alex@example.com", phone: "", createdAt: "2026-11-03" },
    { id: "d", customer: "Other", email: "", phone: "", createdAt: "2026-11-04" },
  ];
  const contacts = customerDirectory(
    leads,
    [{ leadId: "b" }, { leadId: "c" }],
    [{ customer: "Alex", total: 100, balance: 20 }],
  );
  assert.equal(leads.length, 4);
  assert.equal(contacts.length, 2);
  assert.deepEqual(
    contacts.find((contact) => contact.name === "Alex"),
    {
      name: "Alex",
      email: "alex@example.com",
      phone: "+61 412 345 678",
      suburb: "",
      leads: 3,
      jobs: 2,
      invoiced: 100,
      outstanding: 20,
      createdAt: "2026-11-03",
    },
  );
});
