import assert from "node:assert/strict";
import type { Doc } from "../_generated/dataModel";
import {
  buildSearchText,
  computeReceiptStatus,
  deriveLowConfidenceFields,
  fiscalQuarterOf,
  fiscalYearOf,
  fiscalYearRange,
  isValidIsoDate,
  findInconsistencies,
  matchesKeyword,
  normalizeMerchant,
  parseAmountToCents,
  periodRange,
  quarterOf,
  suggestCategory,
} from "./lib";
import { backoffSeconds, RATE_LIMIT } from "../../lib/rateLimit";
import { convertMinorUnits, deriveRate, minorUnitFactor } from "../../lib/money";
import { inputToCents } from "../../lib/format";
import { normalizeExtraction } from "../ocr";

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
  assert.equal(parseAmountToCents("1.000"), 100000, "dot as thousands, no decimals");
  assert.equal(parseAmountToCents("-12.34"), -1234, "negative for refund lines");
}

/**
 * The browser used to have its own parser that replaced every comma with a
 * period, so "1,234.56" became "1.234.56" and parseFloat truncated it to 1.234
 * — a $1,234.56 receipt stored as $1.23. Both sides now share one parser.
 */
function testInputParserMatchesBackend() {
  for (const input of ["1,234.56", "1.234,56", "42.50", "1 234,56", "0.07", "1,000"]) {
    assert.equal(
      inputToCents(input),
      parseAmountToCents(input),
      `client and server must agree on "${input}"`,
    );
  }
  assert.equal(inputToCents("1,234.56"), 123456, "thousands separator is not a decimal point");
  assert.equal(inputToCents("12,50", "EUR"), 1250, "European decimal comma");
}

/** JPY has no minor unit; treating it like cents renders amounts 100x too big. */
function testZeroDecimalCurrencies() {
  assert.equal(minorUnitFactor("JPY"), 1);
  assert.equal(minorUnitFactor("USD"), 100);

  assert.equal(parseAmountToCents("10000", "JPY"), 10000, "yen are already minor units");
  assert.equal(parseAmountToCents("10000", "USD"), 1000000);
  assert.equal(parseAmountToCents("999.6", "JPY"), 1000, "rounds rather than truncating");
}

function testCurrencyConversion() {
  const rates = { EUR: 0.9, JPY: 150, INR: 83 };

  assert.equal(deriveRate(rates, "USD", "USD"), 1);
  assert.equal(deriveRate(rates, "USD", "EUR"), 0.9);
  assert.equal(deriveRate(rates, "EUR", "USD"), 1 / 0.9);
  assert.equal(deriveRate(rates, "USD", "ZZZ"), null, "unknown currency must not silently pass");
  assert.equal(deriveRate(null, "USD", "EUR"), null, "no snapshot means no rate");

  // 100 EUR at 1.1111 USD/EUR is about 111.11 USD.
  assert.equal(
    convertMinorUnits(10000, 1 / 0.9, "EUR", "USD"),
    11111,
    "same minor-unit factor on both legs",
  );

  // 10000 JPY at 1/150 USD/JPY is about 66.67 USD — the factors differ, so a
  // naive multiply would be off by 100x.
  assert.equal(convertMinorUnits(10000, 1 / 150, "JPY", "USD"), 6667);

  // 100 USD into JPY at 150.
  assert.equal(convertMinorUnits(10000, 150, "USD", "JPY"), 15000);

  // A missing rate falls back to 1:1 rather than producing NaN.
  assert.equal(convertMinorUnits(10000, 0, "USD", "USD"), 10000);
}

function testFiscalYear() {
  assert.deepEqual(fiscalYearRange("2026", 1), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(fiscalYearRange("2026", 4), { from: "2026-04-01", to: "2027-03-31" });
  assert.deepEqual(fiscalYearRange("2026", 7), { from: "2026-07-01", to: "2027-06-30" });

  assert.equal(fiscalYearOf("2026-03-31", 4), "2025", "March falls in the prior fiscal year");
  assert.equal(fiscalYearOf("2026-04-01", 4), "2026");
  assert.equal(fiscalYearOf("2026-03-31", 1), "2026", "calendar year is unaffected");

  assert.equal(fiscalQuarterOf("2026-04-15", 4), 1, "first month of the fiscal year is Q1");
  assert.equal(fiscalQuarterOf("2026-07-01", 4), 2);
  assert.equal(fiscalQuarterOf("2026-03-31", 4), 4, "last month of the fiscal year is Q4");
  assert.equal(fiscalQuarterOf("2026-02-10", 1), 1, "calendar year keeps calendar quarters");
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

  assert.equal(quarterOf("2026-06-30"), 2, "quarter boundary is exact, not epsilon-based");
  assert.equal(quarterOf("2026-07-01"), 3);

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

  // "co" used to be stripped as a company suffix anywhere in the name, so two
  // unrelated merchants could collapse together in duplicate detection.
  assert.notEqual(
    normalizeMerchant("Coca Cola Co"),
    normalizeMerchant("Cola"),
    "a company suffix strip must not swallow real words",
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

/** Substring matching filed "Barnes & Noble" under a keyword of "bar". */
function testKeywordBoundaries() {
  assert.ok(matchesKeyword("blue bottle bar", "bar"));
  assert.ok(!matchesKeyword("barnes & noble", "bar"), "must not match inside a word");
  assert.ok(!matchesKeyword("instead of that", "tea"));
  assert.ok(matchesKeyword("green tea house", "tea"));
  assert.ok(matchesKeyword("whole foods market", "whole foods"), "multi-word phrases");
  assert.ok(matchesKeyword("SHELL STATION", "shell"), "case-insensitive");
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

  // A single weak body-text hit is not enough to set a tax treatment.
  assert.equal(
    suggestCategory(categories, {
      merchant: "Unrelated Vendor",
      items: [{ description: "coffee" }],
    }),
    null,
    "one incidental item word must not auto-file a receipt",
  );

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

/**
 * The response used to be trusted via `as Extraction` with no runtime check, so
 * a drifted shape either threw into the failure path or wrote wrong types.
 */
function testExtractionNormalization() {
  const empty = normalizeExtraction(null);
  assert.equal(empty.merchant, "");
  assert.deepEqual(empty.items, []);
  assert.equal(empty.confidence.overall, 0);

  const messy = normalizeExtraction({
    merchant: "  Blue Bottle  ",
    total: 42.5,
    currency: "usd",
    items: [{ description: "Latte", total: "4.50" }, null, "nonsense"],
    confidence: { overall: 5, amount: -1 },
    extra: "ignored",
  });

  assert.equal(messy.merchant, "Blue Bottle", "trims");
  assert.equal(messy.total, "42.5", "coerces a number to the string the parser expects");
  assert.equal(messy.currency, "USD", "upper-cases");
  assert.equal(messy.items.length, 1, "drops entries that are not objects");
  assert.equal(messy.items[0].quantity, "", "fills missing item fields");
  assert.equal(messy.confidence.overall, 1, "clamps above 1");
  assert.equal(messy.confidence.amount, 0, "clamps below 0");

  const wrongTypes = normalizeExtraction({ items: "not an array", confidence: "nope" });
  assert.deepEqual(wrongTypes.items, [], "a non-array items field must not throw");
  assert.equal(wrongTypes.confidence.merchant, 0);
}

testAmounts();
testInputParserMatchesBackend();
testZeroDecimalCurrencies();
testCurrencyConversion();
testFiscalYear();
testDates();
testMerchantNormalization();
testReviewRouting();
testKeywordBoundaries();
testCategorySuggestion();
testSearchText();
testExtractionNormalization();

function testRateLimitThresholds() {
  // Constants must stay in the order: warn < lock, and both cooldowns positive.
  assert.ok(
    RATE_LIMIT.warnAfter < RATE_LIMIT.lockAfter,
    "warn threshold must be strictly below the lock threshold",
  );
  assert.ok(RATE_LIMIT.warnCooldownSeconds > 0);
  assert.ok(RATE_LIMIT.lockCooldownSeconds > RATE_LIMIT.warnCooldownSeconds);
  // A public mutation that can disable an account is a DoS, so the cooldown
  // stays short enough to be a speed bump rather than a lockout.
  assert.ok(
    RATE_LIMIT.lockCooldownSeconds <= 300,
    "the throttle must never become an account lockout an attacker can trigger",
  );
}

testRateLimitThresholds();

/**
 * The deterministic gate. Model self-confidence is not calibrated, so these
 * arithmetic checks — not the confidence score — are what routes a wrong
 * extraction to a human.
 */
function testExtractionCrossChecks() {
  const today = "2026-08-31";

  assert.deepEqual(
    findInconsistencies({
      amountCents: 11000,
      subtotalCents: 10000,
      taxCents: 1000,
      date: "2026-08-01",
      currency: "USD",
      today,
    }),
    [],
    "a receipt that adds up raises nothing",
  );

  assert.ok(
    findInconsistencies({
      amountCents: 11000,
      subtotalCents: 10000,
      taxCents: 5000,
      today,
    }).includes("amount"),
    "subtotal + tax must reconcile with the total",
  );

  assert.deepEqual(
    findInconsistencies({
      amountCents: 10500,
      subtotalCents: 10000,
      taxCents: 501,
      today,
    }),
    [],
    "a minor unit of rounding slack is tolerated",
  );

  assert.ok(
    findInconsistencies({ amountCents: 1000, taxCents: 2000, today }).includes("tax"),
    "tax cannot exceed the total",
  );

  assert.ok(
    findInconsistencies({ amountCents: 0, today }).includes("amount"),
    "a zero total is never right",
  );

  assert.ok(
    findInconsistencies({ amountCents: 5000, itemTotalCents: 9000, today }).includes("amount"),
    "line items cannot overshoot the total",
  );

  assert.deepEqual(
    findInconsistencies({ amountCents: 9000, itemTotalCents: 5000, today }),
    [],
    "line items under the total is normal — they rarely cover tip",
  );

  assert.ok(
    findInconsistencies({ date: "2027-01-01", today }).includes("date"),
    "a future receipt is a misread date",
  );
  assert.ok(
    findInconsistencies({ date: "2010-01-01", today }).includes("date"),
    "a decade-old receipt is a misread date",
  );
  assert.ok(
    findInconsistencies({ currency: "XYZ", today }).includes("currency"),
    "an unsupported currency must not reach the database",
  );
}

testExtractionCrossChecks();

/**
 * The lockout has to escalate enough to matter and cap low enough that a
 * stranger burning attempts against a known email cannot disable the account.
 */
function testLoginBackoff() {
  assert.equal(backoffSeconds(RATE_LIMIT.lockAfter), RATE_LIMIT.lockCooldownSeconds);
  assert.equal(backoffSeconds(RATE_LIMIT.lockAfter + 1), RATE_LIMIT.lockCooldownSeconds * 2);
  assert.equal(backoffSeconds(RATE_LIMIT.lockAfter + 2), RATE_LIMIT.lockCooldownSeconds * 4);
  assert.equal(
    backoffSeconds(RATE_LIMIT.lockAfter + 50),
    RATE_LIMIT.maxCooldownSeconds,
    "escalation is capped, so a lockout can never be permanent",
  );
  assert.ok(
    RATE_LIMIT.warnAfter < RATE_LIMIT.lockAfter,
    "users must be warned before they are throttled",
  );
}

testLoginBackoff();

console.log("convex/model/lib: all checks passed");
