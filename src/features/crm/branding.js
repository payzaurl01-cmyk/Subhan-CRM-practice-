export const DEFAULT_BRANDING = {
  crmTitle: "CRM Development",
  crmLogoUrl: "/company-logo.webp",
  faviconUrl: "/company-logo.webp",
  reportTitle: "Interior Blinds & Shutters",
  reportLogoUrl: "/company-logo.webp",
  invoiceTitle: "Interior Blinds & Shutters",
  invoiceLogoUrl: "/company-logo.webp",
  invoiceTemplate: "classic",
};

const safeImage = (value, fallback) =>
  typeof value === "string" &&
  (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) ||
    /^\/(?!\/)[a-z0-9/_-]+\.(?:png|jpe?g|webp)$/i.test(value))
    ? value
    : fallback;

export function brandingOf(state) {
  const saved = state?.branding || {};
  return {
    crmTitle: String(saved.crmTitle || "").trim() || DEFAULT_BRANDING.crmTitle,
    crmLogoUrl: safeImage(saved.crmLogoUrl, DEFAULT_BRANDING.crmLogoUrl),
    faviconUrl: safeImage(saved.faviconUrl, DEFAULT_BRANDING.faviconUrl),
    reportTitle: String(saved.reportTitle || "").trim() || DEFAULT_BRANDING.reportTitle,
    reportLogoUrl: safeImage(saved.reportLogoUrl, DEFAULT_BRANDING.reportLogoUrl),
    invoiceTitle: String(saved.invoiceTitle || "").trim() || DEFAULT_BRANDING.invoiceTitle,
    invoiceLogoUrl: safeImage(saved.invoiceLogoUrl, DEFAULT_BRANDING.invoiceLogoUrl),
    invoiceTemplate: ["classic", "modern"].includes(saved.invoiceTemplate)
      ? saved.invoiceTemplate
      : DEFAULT_BRANDING.invoiceTemplate,
  };
}

const TITLE_FIELDS = ["reportTitle", "invoiceTitle", "crmTitle"];
const IMAGE_FIELDS = ["reportLogoUrl", "invoiceLogoUrl", "crmLogoUrl", "faviconUrl"];

export function readBrandingForm(form, current) {
  const brand = { ...current };
  for (const key of TITLE_FIELDS)
    brand[key] = form.elements.namedItem(key).value.trim();
  brand.invoiceTemplate = form.elements.namedItem("invoiceTemplate").value;
  const files = Object.fromEntries(
    IMAGE_FIELDS.map((key) => [key, form.elements.namedItem(key).files?.[0] || null]),
  );
  return { brand, files };
}

export function brandingFormHasDraft(form, current) {
  if (!form) return false;
  const { brand, files } = readBrandingForm(form, current);
  return [...TITLE_FIELDS, "invoiceTemplate"].some((key) => brand[key] !== current[key]) ||
    IMAGE_FIELDS.some((key) => files[key]);
}

export function documentBrand(brand, esc, attr, kind, client = "") {
  const report = kind === "report";
  const title = report ? brand.reportTitle : brand.invoiceTitle;
  const logo = report ? brand.reportLogoUrl : brand.invoiceLogoUrl;
  const label = report ? "REPORT" : "INVOICE";
  return `<header class="document-brand"><div class="document-brand-company"><img src="${attr(logo)}" alt="${attr(title)} logo" width="54" height="54"><div><strong>${esc(title)}</strong><span>${label}</span></div></div>${client ? `<div class="document-brand-client"><small>Prepared for</small><strong>${esc(client)}</strong></div>` : ""}</header>`;
}
