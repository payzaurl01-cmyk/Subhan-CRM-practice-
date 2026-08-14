export type WorkspaceRow = Record<string, string> & { id: string; status: string };

export type WorkspaceConfig = {
  title: string;
  singular: string;
  description: string;
  action: string;
  columns: { key: string; label: string }[];
  stats: { label: string; value: string; change: string }[];
  rows: WorkspaceRow[];
};

const baseColumns = {
  contact: [
    { key: "name", label: "Customer" }, { key: "email", label: "Email" },
    { key: "phone", label: "Phone" }, { key: "postcode", label: "Postcode" },
    { key: "updated", label: "Last activity" }, { key: "status", label: "Status" },
  ],
  lead: [
    { key: "name", label: "Lead" }, { key: "customer", label: "Customer" },
    { key: "source", label: "Source" }, { key: "owner", label: "Owner" },
    { key: "followup", label: "Follow-up" }, { key: "status", label: "Stage" },
  ],
  document: [
    { key: "number", label: "Reference" }, { key: "customer", label: "Customer" },
    { key: "date", label: "Created" }, { key: "owner", label: "Owner" },
    { key: "value", label: "Value" }, { key: "status", label: "Status" },
  ],
  job: [
    { key: "number", label: "Job" }, { key: "customer", label: "Customer" },
    { key: "service", label: "Service" }, { key: "installer", label: "Installer" },
    { key: "date", label: "Scheduled" }, { key: "status", label: "Status" },
  ],
};

export const workspaces: Record<string, WorkspaceConfig> = {
  contacts: {
    title: "Contacts", singular: "contact", description: "Manage customers, addresses and communication history.", action: "New contact",
    columns: baseColumns.contact,
    stats: [{ label: "Total contacts", value: "8,921", change: "+12% this month" }, { label: "New this month", value: "142", change: "+18%" }, { label: "With active jobs", value: "38", change: "6 due today" }, { label: "Duplicates to review", value: "4", change: "Needs attention" }],
    rows: [
      { id: "1", name: "Olivia Williams", email: "olivia@example.com", phone: "07700 900 211", postcode: "SW11 3RA", updated: "8 min ago", status: "Active" },
      { id: "2", name: "North & Co. Offices", email: "facilities@nco.co.uk", phone: "020 7946 0281", postcode: "EC2A 4BX", updated: "32 min ago", status: "Active" },
      { id: "3", name: "Emma Roberts", email: "emma.roberts@example.com", phone: "07700 900 126", postcode: "KT3 4LE", updated: "Today", status: "Customer" },
      { id: "4", name: "Harrison Suite", email: "hello@harrisonsuite.co.uk", phone: "020 7946 0448", postcode: "W1K 2HE", updated: "Yesterday", status: "Prospect" },
      { id: "5", name: "James Lawson", email: "james.lawson@example.com", phone: "07700 900 384", postcode: "SE10 9NN", updated: "14 Aug", status: "New" },
    ],
  },
  leads: {
    title: "Lead Pipeline", singular: "lead", description: "Qualify enquiries, schedule follow-ups and move opportunities forward.", action: "New lead",
    columns: baseColumns.lead,
    stats: [{ label: "Open leads", value: "28", change: "+8.2%" }, { label: "New enquiries", value: "11", change: "This week" }, { label: "Pipeline value", value: "£89,420", change: "+14.8%" }, { label: "Conversion rate", value: "31.6%", change: "+2.4%" }],
    rows: [
      { id: "LD-1094", name: "Full house shutters", customer: "James Lawson", source: "Website", owner: "Sarah Chen", followup: "Today, 16:30", status: "New" },
      { id: "LD-1091", name: "Office roller blinds", customer: "North & Co.", source: "Referral", owner: "Alex Morgan", followup: "15 Aug", status: "Qualified" },
      { id: "LD-1087", name: "Bedroom blackout blinds", customer: "Sophie Grant", source: "Google", owner: "Sarah Chen", followup: "16 Aug", status: "Quote sent" },
      { id: "LD-1082", name: "Plantation shutters", customer: "Olivia Williams", source: "Website", owner: "Alex Morgan", followup: "18 Aug", status: "Won" },
      { id: "LD-1079", name: "Conservatory blinds", customer: "David Patel", source: "Walk-in", owner: "Maya Reed", followup: "Overdue", status: "Contacted" },
    ],
  },
  quotations: {
    title: "Quotations", singular: "quotation", description: "Build, send and track customer quotations with stable pricing snapshots.", action: "Create quotation",
    columns: baseColumns.document,
    stats: [{ label: "Draft", value: "12", change: "£31,240" }, { label: "Awaiting action", value: "9", change: "3 overdue" }, { label: "Accepted", value: "18", change: "+12%" }, { label: "Quoted this month", value: "£62,080", change: "+7.4%" }],
    rows: [
      { id: "1", number: "QT-1092", customer: "James Lawson", date: "14 Aug 2026", owner: "Sarah Chen", value: "£4,860.00", status: "Draft" },
      { id: "2", number: "QT-1089", customer: "North & Co. Offices", date: "13 Aug 2026", owner: "Alex Morgan", value: "£8,450.00", status: "Sent" },
      { id: "3", number: "QT-1086", customer: "Sophie Grant", date: "12 Aug 2026", owner: "Sarah Chen", value: "£2,180.00", status: "Ready" },
      { id: "4", number: "QT-1082", customer: "Olivia Williams", date: "10 Aug 2026", owner: "Alex Morgan", value: "£6,720.00", status: "Accepted" },
      { id: "5", number: "QT-1078", customer: "David Patel", date: "8 Aug 2026", owner: "Maya Reed", value: "£1,940.00", status: "Expired" },
    ],
  },
  jobs: {
    title: "Job Orders", singular: "job", description: "Schedule installations, coordinate teams and review completion evidence.", action: "New job",
    columns: baseColumns.job,
    stats: [{ label: "Active jobs", value: "16", change: "+12.5%" }, { label: "Scheduled this week", value: "9", change: "2 today" }, { label: "Ready to install", value: "6", change: "Stock confirmed" }, { label: "Awaiting review", value: "3", change: "Evidence received" }],
    rows: [
      { id: "1", number: "JOB-2048", customer: "Williams Residence", service: "Plantation shutters", installer: "Mike Khan", date: "15 Aug", status: "Scheduled" },
      { id: "2", number: "JOB-2045", customer: "North & Co. Offices", service: "Roller blinds", installer: "Tom Adams", date: "16 Aug", status: "Ready" },
      { id: "3", number: "JOB-2041", customer: "Emma Roberts", service: "Venetian blinds", installer: "Mike Khan", date: "Today", status: "Review" },
      { id: "4", number: "JOB-2039", customer: "Harrison Suite", service: "Blackout blinds", installer: "Ryan Smith", date: "18 Aug", status: "Picking" },
      { id: "5", number: "JOB-2035", customer: "David Patel", service: "Conservatory blinds", installer: "Unassigned", date: "20 Aug", status: "Planning" },
    ],
  },
  tasks: {
    title: "Tasks", singular: "task", description: "Organise sales follow-ups, installations and warehouse work.", action: "Add task",
    columns: [{ key: "name", label: "Task" }, { key: "linked", label: "Linked record" }, { key: "assignee", label: "Assignee" }, { key: "priority", label: "Priority" }, { key: "date", label: "Due" }, { key: "status", label: "Status" }],
    stats: [{ label: "My open tasks", value: "14", change: "5 due today" }, { label: "Overdue", value: "7", change: "3 urgent" }, { label: "Team workload", value: "42", change: "Across 8 people" }, { label: "Completed today", value: "18", change: "+22%" }],
    rows: [
      { id: "TSK-501", name: "Call James about survey", linked: "LD-1094", assignee: "Sarah Chen", priority: "High", date: "Today, 16:30", status: "In progress" },
      { id: "TSK-498", name: "Confirm fabric delivery", linked: "JOB-2045", assignee: "Alex Morgan", priority: "Urgent", date: "Overdue", status: "Open" },
      { id: "TSK-493", name: "Review installation photos", linked: "JOB-2041", assignee: "Maya Reed", priority: "Medium", date: "Today", status: "Review" },
      { id: "TSK-487", name: "Pick order for Williams", linked: "PICK-804", assignee: "Tom Adams", priority: "High", date: "15 Aug", status: "Open" },
    ],
  },
  products: {
    title: "Product Catalogue", singular: "product", description: "Manage products, variants, SKUs, barcodes and suppliers.", action: "New product",
    columns: [{ key: "name", label: "Product" }, { key: "sku", label: "SKU" }, { key: "category", label: "Category" }, { key: "variants", label: "Variants" }, { key: "price", label: "From" }, { key: "status", label: "Status" }],
    stats: [{ label: "Active products", value: "486", change: "1,204 variants" }, { label: "Categories", value: "18", change: "4 featured" }, { label: "Low stock", value: "12", change: "Needs attention" }, { label: "Inactive", value: "26", change: "Hidden from quotes" }],
    rows: [
      { id: "PRD-102", name: "Premium Plantation Shutter", sku: "PS-WHT-63", category: "Shutters", variants: "24", price: "£148.00", status: "Active" },
      { id: "PRD-098", name: "Solace Blackout Roller", sku: "SBR-900", category: "Roller Blinds", variants: "36", price: "£62.00", status: "Active" },
      { id: "PRD-074", name: "Aluminium Venetian 25mm", sku: "AV-25", category: "Venetian", variants: "48", price: "£54.00", status: "Low stock" },
      { id: "PRD-061", name: "Day & Night Duo", sku: "DND-120", category: "Roller Blinds", variants: "18", price: "£89.00", status: "Active" },
    ],
  },
  inventory: {
    title: "Inventory", singular: "stock workflow", description: "Monitor on-hand, reserved and available stock from controlled balances.", action: "Stock movement",
    columns: [{ key: "name", label: "Product / variant" }, { key: "sku", label: "SKU" }, { key: "location", label: "Location" }, { key: "onhand", label: "On hand" }, { key: "available", label: "Available" }, { key: "status", label: "Stock state" }],
    stats: [{ label: "Stock value", value: "£124,860", change: "+4.1%" }, { label: "Available units", value: "8,421", change: "Across 2 warehouses" }, { label: "Reserved", value: "286", change: "For 16 jobs" }, { label: "Low stock alerts", value: "12", change: "4 critical" }],
    rows: [
      { id: "INV-1", name: "Solace Blackout · Charcoal", sku: "SBR-900-CH", location: "Main · A-04-02", onhand: "64", available: "52", status: "Healthy" },
      { id: "INV-2", name: "Venetian 25mm · White", sku: "AV25-WHT", location: "Main · B-02-01", onhand: "11", available: "4", status: "Low stock" },
      { id: "INV-3", name: "Shutter frame · Silk White", sku: "PS-FRM-SW", location: "Main · C-01-04", onhand: "28", available: "18", status: "Healthy" },
      { id: "INV-4", name: "Day & Night · Linen", sku: "DND-LIN", location: "South · A-01-02", onhand: "6", available: "2", status: "Critical" },
    ],
  },
  warehouse: {
    title: "Warehouse", singular: "warehouse workflow", description: "Control Pick Lists, goods receipts, transfers, counts and returns.", action: "New workflow",
    columns: [{ key: "number", label: "Reference" }, { key: "type", label: "Workflow" }, { key: "linked", label: "Linked record" }, { key: "owner", label: "Owner" }, { key: "date", label: "Required" }, { key: "status", label: "Status" }],
    stats: [{ label: "Open Pick Lists", value: "8", change: "3 due today" }, { label: "Goods receipts", value: "4", change: "This week" }, { label: "Pending returns", value: "6", change: "2 to inspect" }, { label: "Stock counts", value: "2", change: "In progress" }],
    rows: [
      { id: "1", number: "PICK-804", type: "Pick List", linked: "JOB-2048", owner: "Tom Adams", date: "15 Aug", status: "In progress" },
      { id: "2", number: "GRN-188", type: "Goods receipt", linked: "PO-302", owner: "Maya Reed", date: "Today", status: "Awaiting" },
      { id: "3", number: "RET-094", type: "Installer return", linked: "JOB-2041", owner: "Mike Khan", date: "Today", status: "Inspection" },
      { id: "4", number: "TRF-042", type: "Stock transfer", linked: "Main → South", owner: "Tom Adams", date: "16 Aug", status: "Draft" },
    ],
  },
  "finance-invoices": {
    title: "Invoices", singular: "invoice", description: "Issue invoices, monitor balances and keep immutable financial history.", action: "Create invoice",
    columns: baseColumns.document,
    stats: [{ label: "Outstanding", value: "£18,460", change: "24 invoices" }, { label: "Overdue", value: "£6,240", change: "8 invoices" }, { label: "Paid this month", value: "£42,180", change: "+16.8%" }, { label: "Draft", value: "6", change: "£12,840" }],
    rows: [
      { id: "1", number: "INV-0958", customer: "North & Co. Offices", date: "14 Aug 2026", owner: "Alex Morgan", value: "£8,450.00", status: "Issued" },
      { id: "2", number: "INV-0954", customer: "Williams Residence", date: "12 Aug 2026", owner: "Sarah Chen", value: "£6,720.00", status: "Part paid" },
      { id: "3", number: "INV-0952", customer: "Emma Roberts", date: "10 Aug 2026", owner: "Maya Reed", value: "£2,180.00", status: "Paid" },
      { id: "4", number: "INV-0948", customer: "Harrison Suite", date: "2 Aug 2026", owner: "Alex Morgan", value: "£4,940.00", status: "Overdue" },
    ],
  },
  "finance-payments": {
    title: "Payments", singular: "payment", description: "Record payments and allocate them through the trusted finance workflow.", action: "Record payment",
    columns: [{ key: "number", label: "Payment" }, { key: "customer", label: "Customer" }, { key: "method", label: "Method" }, { key: "date", label: "Received" }, { key: "value", label: "Amount" }, { key: "status", label: "Allocation" }],
    stats: [{ label: "Received this month", value: "£42,180", change: "+16.8%" }, { label: "Unallocated", value: "£1,240", change: "2 payments" }, { label: "Card payments", value: "£18,620", change: "44.1%" }, { label: "Refunds", value: "£420", change: "1 pending" }],
    rows: [
      { id: "1", number: "PAY-0621", customer: "Emma Roberts", method: "Bank transfer", date: "Today, 11:24", value: "£2,180.00", status: "Allocated" },
      { id: "2", number: "PAY-0618", customer: "Williams Residence", method: "Card", date: "13 Aug", value: "£3,360.00", status: "Allocated" },
      { id: "3", number: "PAY-0616", customer: "Harrison Suite", method: "Bank transfer", date: "12 Aug", value: "£1,240.00", status: "Unallocated" },
    ],
  },
  "admin-users": {
    title: "Users", singular: "user", description: "Manage staff lifecycle, roles, account state and session revocation.", action: "Invite user",
    columns: [{ key: "name", label: "User" }, { key: "email", label: "Email" }, { key: "role", label: "Role" }, { key: "last", label: "Last active" }, { key: "access", label: "Module access" }, { key: "status", label: "Account" }],
    stats: [{ label: "Active users", value: "24", change: "4 roles" }, { label: "Online now", value: "8", change: "Across web & mobile" }, { label: "Invited", value: "3", change: "Awaiting signup" }, { label: "Suspended", value: "1", change: "Access denied" }],
    rows: [
      { id: "1", name: "Alex Morgan", email: "alex@interiorblinds.co.uk", role: "Super Admin", last: "Now", access: "All modules", status: "Active" },
      { id: "2", name: "Sarah Chen", email: "sarah@interiorblinds.co.uk", role: "Manager", last: "4 min ago", access: "Sales, Operations", status: "Active" },
      { id: "3", name: "Mike Khan", email: "mike@interiorblinds.co.uk", role: "Installer", last: "18 min ago", access: "Assigned jobs", status: "Active" },
      { id: "4", name: "Maya Reed", email: "maya@interiorblinds.co.uk", role: "Admin", last: "1 hr ago", access: "All except Master", status: "Active" },
    ],
  },
  "admin-audit": {
    title: "Audit Logs", singular: "audit event", description: "Review traceable business and protected security activity.", action: "Export view",
    columns: [{ key: "date", label: "Time" }, { key: "actor", label: "Actor" }, { key: "action", label: "Action" }, { key: "module", label: "Module" }, { key: "record", label: "Record" }, { key: "status", label: "Result" }],
    stats: [{ label: "Events today", value: "248", change: "All modules" }, { label: "Protected events", value: "12", change: "Append-only" }, { label: "Failed actions", value: "3", change: "Permission denied" }, { label: "Active sessions", value: "18", change: "8 users" }],
    rows: [
      { id: "1", date: "14:42:18", actor: "Alex Morgan", action: "quotation.accepted", module: "Quotations", record: "QT-1082", status: "Success" },
      { id: "2", date: "14:31:04", actor: "Mike Khan", action: "job.photo_added", module: "Jobs", record: "JOB-2041", status: "Success" },
      { id: "3", date: "14:08:51", actor: "Sarah Chen", action: "lead.stage_changed", module: "Leads", record: "LD-1087", status: "Success" },
      { id: "4", date: "13:54:22", actor: "Unknown session", action: "record.read", module: "Finance", record: "INV-0952", status: "Denied" },
    ],
  },
};

export function getWorkspace(key: string) {
  return workspaces[key] || workspaces.tasks;
}
