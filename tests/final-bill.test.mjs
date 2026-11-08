import assert from "node:assert/strict";
import test from "node:test";
import { finalBillSnapshot } from "../src/features/crm/final-bill.js";
import { createFinance } from "../src/features/crm/views/finance.js";

test("final bill includes every quoted product and service, tax, changes, and return credit", () => {
  const job = {
    service: "Installation",
    items: [{ id: "blind", name: "Roller blind", sku: "RB" }],
    extraItems: [{ requestId: "extra", name: "Bracket set" }],
  };
  const quote = {
    number: "QUOTE-1",
    gstRate: 10,
    gst: 30,
    notes: "Install in lounge",
    items: [
      {
        kind: "Inventory",
        description: "Roller blind",
        sku: "RB",
        quantity: 2,
        unitPrice: 100,
      },
      {
        kind: "Custom",
        description: "Installation service",
        quantity: 1,
        unitPrice: 100,
      },
    ],
  };
  const amounts = {
    baseTotal: 330,
    added: 25,
    credited: 20,
    total: 335,
    additions: [
      { requestId: "extra", sku: "BR", quantity: 1, unitGross: 25, amount: 25 },
    ],
    credits: [
      { itemId: "blind", sku: "RB", quantity: 1, unitGross: 20, amount: 20 },
    ],
  };
  const bill = finalBillSnapshot(job, quote, amounts);
  assert.deepEqual(
    bill.lines.map((line) => line.description),
    [
      "Roller blind",
      "Installation service",
      "GST (10%)",
      "Bracket set",
      "Roller blind",
    ],
  );
  assert.equal(
    bill.lines.reduce((sum, line) => sum + line.amount, 0),
    bill.total,
  );
  assert.equal(bill.lines.at(-1).amount, -20);
  assert.equal(bill.quoteNotes, "Install in lounge");
});

test("legacy bill retains confirmed total and shows unallocated service charges", () => {
  const job = {
    items: [{ id: "blind", name: "Blind", quantityRequired: 2 }],
    billingBasis: { lines: [{ itemId: "blind", unitGross: 40 }] },
  };
  const bill = finalBillSnapshot(job, null, {
    baseTotal: 120,
    added: 0,
    credited: 0,
    total: 120,
    additions: [],
    credits: [],
  });
  assert.equal(bill.lines[0].amount, 80);
  assert.equal(bill.lines[1].description, "Other agreed services and charges");
  assert.equal(bill.lines[1].amount, 40);
});

test("a price variation is shown as an agreed adjustment without duplicating the product", () => {
  const job = {
    items: [{ id: "blind", name: "Blind", quantityRequired: 2 }],
    billingBasis: { lines: [{ itemId: "blind", unitGross: 100 }] },
    variations: [
      {
        id: "change-1",
        lineId: "blind",
        before: { quantityRequired: 2 },
        after: { name: "Blind" },
      },
    ],
  };
  const bill = finalBillSnapshot(job, null, {
    baseTotal: 200,
    added: 20,
    credited: 0,
    total: 220,
    additions: [
      {
        variationId: "change-1",
        itemId: "blind",
        quantity: 0,
        unitGross: 110,
        amount: 20,
      },
    ],
    credits: [],
  });
  assert.deepEqual(
    bill.lines.map((line) => line.amount),
    [200, 20],
  );
  assert.equal(bill.lines[1].quantity, 1);
  assert.equal(bill.lines[1].unitPrice, 20);
});

test("a zero-adjustment settlement still opens a printable full bill", () => {
  const job = {
    id: "job-1",
    number: "JOB-1",
    customer: "Customer",
    quoteId: "quote-1",
    outstanding: 0,
    refundDue: 0,
    finalSettlements: [
      {
        id: "settlement-1",
        at: "2026-11-08",
        previouslyInvoiced: 110,
        adjustment: 0,
        amounts: {
          baseTotal: 110,
          added: 0,
          credited: 0,
          total: 110,
          additions: [],
          credits: [],
        },
      },
    ],
  };
  const ctx = {
    state: {
      jobs: [job],
      quotes: [
        {
          id: "quote-1",
          gst: 10,
          gstRate: 10,
          items: [
            {
              description: "Fitting service",
              kind: "Custom",
              quantity: 1,
              unitPrice: 100,
            },
          ],
        },
      ],
      invoices: [],
    },
    isInstaller: () => false,
    hasCapability: () => true,
    fmt: (value) => value,
    esc: (value) => String(value),
    money: (value) => `$${Number(value).toFixed(2)}`,
    infoFact: (label, value) => `<span>${label}: ${value}</span>`,
    modalFrame: (title, subtitle, body) => `${title} ${subtitle} ${body} Print`,
  };
  const document = createFinance(ctx).renderSettlementDocument("settlement-1");
  assert.match(document, /Fitting service/);
  assert.match(document, /GST \(10%\)/);
  assert.match(document, /This adjustment: \$0\.00/);
  assert.match(document, /Final bill · JOB-1/);
});
