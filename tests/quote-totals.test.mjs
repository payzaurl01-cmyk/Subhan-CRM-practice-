import test from "node:test";
import assert from "node:assert/strict";
import { isValidQuoteGstRate, quoteTotals } from "../src/features/crm/quote-totals.js";

test("a manager's GST percentage applies only to taxable quotation lines", () => {
  const lines = [
    { quantity: 2, unitPrice: 100, taxable: true },
    { quantity: 1, unitPrice: 100, taxable: false },
  ];
  assert.deepEqual(quoteTotals({ lines, gstRate: "7.5" }), {
    subtotal: 300,
    gst: 15,
    total: 315,
  });
  assert.deepEqual(quoteTotals({ lines, gstRate: "0" }), {
    subtotal: 300,
    gst: 0,
    total: 300,
  });
  assert.equal(quoteTotals({ lines }).gst, 20);
});

test("GST rate accepts zero and rejects missing or out-of-range values", () => {
  assert.equal(isValidQuoteGstRate("0"), true);
  assert.equal(isValidQuoteGstRate("10.5"), true);
  for (const value of ["", "-1", "101", "not a number", Infinity])
    assert.equal(isValidQuoteGstRate(value), false);
});
