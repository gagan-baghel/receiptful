import assert from "node:assert/strict";
import type { Doc } from "../_generated/dataModel";
import {
  buildSearchText,
  computeReceiptStatus,
  deriveLowConfidenceFields,
  isValidIsoDate,
  normalizeMerchant,
  parseAmountToCents,
  periodRange,
  quarterOf,
  suggestCategory,
} from "./lib";
import { RATE_LIMIT } from "../../lib/rateLimit";

/** Money parsing — the path where a rounding slip becomes a wrong expense total. */
function testAmounts() {
  assert.equal(parseAmountToCents("42.50"), 4250);
  assert.equal(parseAmountToCents("$1,234.56"), 123456);
  assert.equal(parseAmountToCents("1.234,56"), 123456, "European format");
  assert.equal(parseAmountToCents("1 234,56 €"), 123456, "space thousands + comma decimal");
  assert.equal(parseAmountToCents("0.1"), 10);
  assert.equal(parseAmountToCents("0.07"), 7, "no float drift");
  assert.equal(parseAmountToCents("19.99"), 1999);
  assert.equal(parseAmountToCents(""), 0);
  assert.equal(parseAmountToCents("not a number"), 0);
  assert.equal(parseAmountToCents(12.3), 1230);
  assert.equal(parseAmountToCents("1,000"), 100000, "comma as thousands, no decimals");
}

function testDates() {
  assert.ok(isValidIsoDate("2026-02-28"));
  assert.ok(!isValidIsoDate("2026-02-30"), "rolls over, so not a real date");
  assert.ok(!isValidIsoDate("2026-13-01"));
  assert.ok(!isValidIsoDate("26-01-01"));

  assert.equal(quarterOf("2026-01-15"), 1);
  assert.equal(quarterOf("2026-03-31"), 1);
  assert.equal(quarterOf("2026-04-01"), 2);
  assert.equal(quarterOf("2026-12-31"), 4);

  const march = periodRange("monthly", "2026-03-17");
  assert.deepEqual(march, { from: "2026-03-01", to: "2026-03-31", key: "2026-03" });

  const february = periodRange("monthly", "2024-02-10");
  assert.equal(february.to, "2024-02-29", "leap year");

  const q2 = periodRange("quarterly", "2026-05-02");
  assert.deepEqual(q2, { from: "2026-04-01", to: "2026-06-30", key: "2026-Q2" });

  const year = periodRange("yearly", "2026-08-08");
  assert.deepEqual(year, { from: "2026-01-01", to: "2026-12-31", key: "2026" });
}

function testMerchantNormalization() {
  assert.equal(normalizeMerchant("Starbucks Coffee #1234"), "starbucks coffee 1234");
  assert.equal(normalizeMerchant("ACME Corp."), "acme");
  assert.equal(normalizeMerchant("Foo  Bar   Ltd"), "foo bar");
  assert.equal(
    normalizeMerchant("Whole Foods Market"),
    normalizeMerchant("WHOLE FOODS MARKET"),
    "case-insensitive so duplicates match",
  );
}

function testReviewRouting() {
  assert.equal(
    computeReceiptStatus({
      merchant: "Shell",
      amountCents: 5000,
      date: "2026-01-05",
      lowConfidenceFields: [],
    }),
    "ready",
  );

  assert.equal(
    computeReceiptStatus({
      merchant: "",
      amountCents: 5000,
      date: "2026-01-05",
      lowConfidenceFields: [],
    }),
    "needs_review",
    "missing merchant must reach a human",
  );

  assert.equal(
    computeReceiptStatus({
      merchant: "Shell",
      amountCents: 0,
      date: "2026-01-05",
      lowConfidenceFields: [],
    }),
    "needs_review",
    "zero amount must reach a human",
  );

  assert.equal(
    computeReceiptStatus({
      merchant: "Shell",
      amountCents: 5000,
      date: "2026-01-05",
      lowConfidenceFields: ["amount"],
    }),
    "needs_review",
    "weak amount confidence must reach a human",
  );

  assert.deepEqual(
    deriveLowConfidenceFields([
      { field: "merchant", confidence: 0.9 },
      { field: "amount", confidence: 0.4 },
      { field: "date", confidence: 0.74 },
    ]),
    ["amount", "date"],
  );
}

function testCategorySuggestion() {
  const categories = [
    {
      _id: "cat_food",
      keywords: ["restaurant", "cafe", "coffee", "starbucks"],
      deletedAt: undefined,
    },
    {
      _id: "cat_fuel",
      keywords: ["shell", "petrol", "fuel"],
      deletedAt: undefined,
    },
    {
      _id: "cat_dead",
      keywords: ["starbucks", "coffee", "cafe", "restaurant"],
      deletedAt: 1,
    },
  ] as unknown as Doc<"categories">[];

  const coffee = suggestCategory(categories, {
    merchant: "Starbucks Coffee",
    items: [{ description: "Latte" }],
  });
  assert.equal(coffee?.categoryId, "cat_food");
  assert.ok((coffee?.confidence ?? 0) > 0.5);

  const fuel = suggestCategory(categories, {
    merchant: "Shell Station",
    items: [],
  });
  assert.equal(fuel?.categoryId, "cat_fuel");

  assert.equal(
    suggestCategory(categories, { merchant: "Zzzz Unknown", items: [] }),
    null,
    "no keyword hit means no guess",
  );

  assert.equal(
    suggestCategory(categories, { merchant: "", items: [] }),
    null,
    "empty input never guesses",
  );

  // A deleted category must never win, even with identical keywords.
  const onlyDeleted = suggestCategory(
    [categories[2]] as Doc<"categories">[],
    { merchant: "Starbucks Coffee", items: [] },
  );
  assert.equal(onlyDeleted, null);
}

function testSearchText() {
  const haystack = buildSearchText({
    merchant: "Blue Bottle",
    notes: "client meeting",
    items: [{ description: "Espresso" }],
    tags: ["Client", "Tax"],
    categoryName: "Food & Dining",
    amountLabel: "12.50",
  });

  for (const term of ["Blue Bottle", "client meeting", "Espresso", "Client", "12.50"]) {
    assert.ok(haystack.includes(term), `search text must contain ${term}`);
  }
  assert.ok(buildSearchText({ merchant: "x".repeat(20000) }).length <= 8000, "capped");
}

testAmounts();
testDates();
testMerchantNormalization();
testReviewRouting();
testCategorySuggestion();
testSearchText();

function testRateLimitThresholds() {
  // Constants must stay in the order: warn < lock, and both cooldowns positive.
  assert.ok(
    RATE_LIMIT.warnAfter < RATE_LIMIT.lockAfter,
    "warn threshold must be strictly below the lock threshold",
  );
  assert.ok(RATE_LIMIT.warnCooldownSeconds > 0);
  assert.ok(RATE_LIMIT.lockCooldownSeconds > RATE_LIMIT.warnCooldownSeconds);
}

testRateLimitThresholds();

console.log("convex/model/lib: all checks passed");
