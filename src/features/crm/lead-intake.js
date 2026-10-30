// Website contact forms stored these values in the lead requirements text.
export function leadIntakeDetails(lead) {
  const intake = String(lead?.requirements || lead?.notes || "");
  const line = (name) =>
    intake.match(new RegExp(`^${name}:\\s*([^\\r\\n]*)`, "im"))?.[1]?.trim() || "";
  const description =
    intake.match(/^Description:\s*([\s\S]*)$/im)?.[1]?.trim() || "";
  const storedService = String(lead?.service || "").trim();

  return {
    postcode: String(lead?.postcode || line("Postcode")).trim(),
    suburb: String(lead?.suburb || lead?.city || line("Suburb") || line("City")).trim(),
    service:
      storedService && storedService.toLowerCase() !== "website enquiry"
        ? storedService
        : line("Service") || storedService,
    description: String(lead?.description ?? lead?.message ?? description).trim(),
  };
}
