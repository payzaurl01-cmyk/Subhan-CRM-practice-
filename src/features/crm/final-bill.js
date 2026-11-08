const money = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function finalBillSnapshot(job, quote, amounts) {
  const lines = [];
  const add = (kind, description, quantity, unitPrice, amount, sku = "") => {
    lines.push({
      kind,
      description,
      sku,
      quantity,
      unitPrice,
      amount: money(amount),
    });
  };
  if (quote?.items?.length) {
    for (const item of quote.items) {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      add(
        item.kind || "Particular",
        item.description || item.sku || "Item",
        quantity,
        unitPrice,
        quantity * unitPrice,
        item.sku || "",
      );
    }
    if (Number(quote.gst || 0))
      add(
        "Tax",
        `GST (${quote.gstRate ?? 10}%)`,
        1,
        Number(quote.gst),
        Number(quote.gst),
      );
  } else {
    for (const item of job.items || []) {
      const basisLine = job.billingBasis?.lines?.find(
        (line) => line.itemId === item.id,
      );
      if (job.billingBasis?.lines?.length && !basisLine) continue;
      const firstChange = (job.variations || []).find(
        (change) => change.lineId === item.id,
      );
      if (firstChange && !firstChange.before) continue;
      const quantity = Number(
        firstChange?.before?.quantityRequired ?? item.quantityRequired ?? 0,
      );
      const unitPrice = Number(basisLine?.unitGross || 0);
      add(
        item.kind || "Product",
        item.name || item.sku || "Item",
        quantity,
        unitPrice,
        quantity * unitPrice,
        item.sku || "",
      );
    }
  }
  const originalSum = money(lines.reduce((sum, line) => sum + line.amount, 0));
  const originalDifference = money(Number(amounts.baseTotal) - originalSum);
  if (originalDifference) {
    add(
      "Agreed adjustment",
      quote
        ? "Confirmed change to original agreement"
        : "Other agreed services and charges",
      1,
      originalDifference,
      originalDifference,
    );
  }
  for (const item of amounts.additions || []) {
    const source = (job.extraItems || []).find(
      (x) => x.requestId === item.requestId,
    );
    const variation = (job.variations || []).find(
      (x) => x.id === item.variationId,
    );
    const original = (job.items || []).find((x) => x.id === item.itemId);
    const description =
      source?.name ||
      variation?.after?.name ||
      original?.name ||
      item.sku ||
      "Additional product";
    add(
      variation ? "Price / quantity variation" : "Addition",
      variation ? `${description} — agreed adjustment` : description,
      variation ? 1 : Number(item.quantity || 0),
      variation ? Number(item.amount || 0) : Number(item.unitGross || 0),
      item.amount,
      item.sku || "",
    );
  }
  for (const item of amounts.credits || []) {
    const original = (job.items || []).find((x) => x.id === item.itemId);
    const source = (job.extraItems || []).find((x) => x.id === item.itemId);
    add(
      "Return credit",
      original?.name || source?.name || item.sku || "Returned product",
      Number(item.quantity || 0),
      Number(item.unitGross || 0),
      -Number(item.amount || 0),
      item.sku || "",
    );
  }
  const difference = money(
    Number(amounts.total) - lines.reduce((sum, line) => sum + line.amount, 0),
  );
  if (difference)
    add("Rounding", "Rounding adjustment", 1, difference, difference);
  return {
    ...amounts,
    lines,
    quoteNumber: quote?.number || "",
    quoteNotes: quote?.notes || "",
    service: job.service || "",
  };
}
