import assert from "node:assert/strict";
import test from "node:test";
import { brandingOf, brandingFormHasDraft, documentBrand, readBrandingForm } from "../src/features/crm/branding.js";
import { createFinance } from "../src/features/crm/views/finance.js";

test("report, invoice, and CRM branding remain independent and reject unsafe image URLs", () => {
  const brand = brandingOf({ branding: {
    reportTitle: "Report Identity",
    invoiceTitle: "Invoice Identity",
    crmTitle: "Workspace Identity",
    reportLogoUrl: "/report-logo.png",
    invoiceLogoUrl: "/invoice-logo.webp",
    crmLogoUrl: "javascript:alert(1)",
    faviconUrl: "data:image/svg+xml;base64,PHN2Zz4=",
    invoiceTemplate: "modern",
  } });
  assert.equal(brand.crmTitle, "Workspace Identity");
  assert.equal(brand.crmLogoUrl, "/company-logo.webp");
  assert.equal(brand.faviconUrl, "/company-logo.webp");
  assert.equal(brandingOf({ branding: { crmLogoUrl: "//outside.example/logo.png" } }).crmLogoUrl, "/company-logo.webp");
  assert.match(documentBrand(brand, String, String, "report"), /Report Identity/);
  assert.doesNotMatch(documentBrand(brand, String, String, "report"), /Invoice Identity/);
  assert.match(documentBrand(brand, String, String, "invoice", "Sample Client"), /invoice-logo\.webp/);
  assert.match(documentBrand(brand, String, String, "invoice", "Sample Client"), /Sample Client/);
});

test("standard invoices use the selected complete printable template", () => {
  const invoice = {
    id: "invoice-1", number: "INV-1", jobId: "job-1", customer: "Sample Client",
    type: "Progress", issueDate: "2026-11-08", dueDate: "2026-11-15",
    total: 200, paid: 50, balance: 150,
  };
  const ctx = {
    state: {
      branding: { invoiceTitle: "Invoice Identity", invoiceTemplate: "modern" },
      invoices: [invoice], jobs: [{ id: "job-1", number: "JOB-1", service: "Blinds" }],
    },
    isInstaller: () => false,
    hasCapability: () => true,
    esc: String,
    attr: String,
    fmt: String,
    money: (value) => `$${Number(value).toFixed(2)}`,
    modalFrame: (_title, _subtitle, body) => body,
  };
  const html = createFinance(ctx).renderInvoiceDocument(invoice.id);
  assert.match(html, /invoice-template-modern/);
  assert.match(html, /Invoice Identity/);
  assert.match(html, /Sample Client/);
  assert.match(html, /INV-1/);
  assert.match(html, /Due 2026-11-15/);
  assert.match(html, /Invoice total/);
  assert.match(html, /Balance due/);
});

test("management branding tab exposes separate report, invoice, and CRM controls", () => {
  const ctx = {
    state: {},
    currentUser: () => ({ role: "manager" }),
    allowedPage: () => true,
    esc: String,
    attr: String,
    header: () => "",
  };
  const html = createFinance(ctx).renderBrandingPage();
  for (const field of ["reportTitle", "reportLogoUrl", "invoiceTitle", "invoiceLogoUrl", "invoiceTemplate", "crmTitle", "crmLogoUrl", "faviconUrl"])
    assert.match(html, new RegExp(`name="${field}"`));
  ctx.currentUser = () => ({ role: "installer" });
  assert.match(createFinance(ctx).renderBrandingPage(), /unavailable/);
});

test("save captures edited titles, template, and files before an asynchronous refresh", () => {
  const current = brandingOf({});
  const logo = { name: "new-logo.png" };
  const fields = {
    reportTitle: { value: "  New report title  " },
    invoiceTitle: { value: "New invoice title" },
    crmTitle: { value: "New CRM title" },
    invoiceTemplate: { value: "modern" },
    reportLogoUrl: { files: [logo] },
    invoiceLogoUrl: { files: [] },
    crmLogoUrl: { files: [] },
    faviconUrl: { files: [] },
  };
  const form = { elements: { namedItem: (key) => fields[key] } };
  assert.equal(brandingFormHasDraft(form, current), true);
  const captured = readBrandingForm(form, current);
  fields.reportTitle.value = current.reportTitle;
  fields.invoiceTemplate.value = current.invoiceTemplate;
  fields.reportLogoUrl.files = [];
  assert.equal(captured.brand.reportTitle, "New report title");
  assert.equal(captured.brand.invoiceTemplate, "modern");
  assert.equal(captured.files.reportLogoUrl, logo);
});
