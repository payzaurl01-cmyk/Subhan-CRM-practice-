export const contactEmailKey = (value) => String(value || "").trim().toLowerCase();
export const contactPhoneKey = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("61") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits.length >= 7 ? digits : "";
};

export function customerDirectory(leads, jobs, invoices) {
  const parent = leads.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const emailOwners = new Map();
  const phoneOwners = new Map();
  leads.forEach((lead, index) => {
    for (const [key, owners] of [
      [contactEmailKey(lead.email), emailOwners],
      [contactPhoneKey(lead.phone), phoneOwners],
    ]) {
      if (!key) continue;
      if (owners.has(key)) parent[find(index)] = find(owners.get(key));
      else owners.set(key, index);
    }
  });

  const groups = new Map();
  const byLead = new Map();
  leads.forEach((lead, index) => {
    const root = find(index);
    const contact = groups.get(root) || {
      name: "",
      email: "",
      phone: "",
      suburb: "",
      leads: 0,
      jobs: 0,
      invoiced: 0,
      outstanding: 0,
      createdAt: "",
      names: new Set(),
    };
    if (!contact.createdAt || String(lead.createdAt || "") > contact.createdAt) {
      contact.name = lead.customer || contact.name;
      contact.email = lead.email || contact.email;
      contact.phone = lead.phone || contact.phone;
      contact.suburb = lead.suburb || contact.suburb;
      contact.createdAt = lead.createdAt || contact.createdAt;
    }
    contact.email ||= lead.email || "";
    contact.phone ||= lead.phone || "";
    contact.suburb ||= lead.suburb || "";
    contact.names.add(String(lead.customer || "").trim().toLowerCase());
    contact.leads += 1;
    groups.set(root, contact);
    byLead.set(lead.id, contact);
  });
  for (const job of jobs) {
    const contact = byLead.get(job.leadId);
    if (contact) contact.jobs += 1;
  }
  for (const invoice of invoices) {
    const name = String(invoice.customer || "").trim().toLowerCase();
    const contact = [...groups.values()].find((item) => item.names.has(name));
    if (contact) {
      contact.invoiced += Number(invoice.total) || 0;
      contact.outstanding += Number(invoice.balance) || 0;
    }
  }
  return [...groups.values()].map(({ names, ...contact }) => contact);
}
