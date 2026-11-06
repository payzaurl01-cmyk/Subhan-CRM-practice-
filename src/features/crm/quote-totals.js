export function isValidQuoteGstRate(value) {
  const rate = Number(value);
  return value !== "" && Number.isFinite(rate) && rate >= 0 && rate <= 100;
}

export function quoteTotals(draft) {
  const rate = Number(draft.gstRate ?? 10);
  const subtotal = draft.lines.reduce(
    (sum, line) =>
      sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0,
  );
  const taxableSubtotal = draft.lines.reduce(
    (sum, line) =>
      sum +
      (line.taxable
        ? (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
        : 0),
    0,
  );
  const gst = taxableSubtotal * (Number.isFinite(rate) ? rate / 100 : 0);
  return { subtotal, gst, total: subtotal + gst };
}
