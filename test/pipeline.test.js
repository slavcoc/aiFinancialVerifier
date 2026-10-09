import test from "node:test";
import assert from "node:assert/strict";
import { checkText } from "../src/pipeline.js";

const config = { model: "mock", mock: true, validityPass: true, apiKey: "" };

const EXAMPLE = `Total combined expenditure across all three core sectors reached exactly $150,000.

A granular look at the departmental breakdown shows:
- Personnel and Salaries: $85,000
- Infrastructure and Software Licensing: $45,000
- Travel and Client Entertainment Expenses: $25,000`;

test("pipeline: finds the red sum (mock mode, end to end)", async () => {
  const res = await checkText(EXAMPLE, config);
  assert.equal(res.summary.checked, 1);
  assert.equal(res.summary.failed, 1);
  assert.equal(res.summary.passed, 0);
  const f = res.findings.find((x) => x.id === "r1");
  assert.equal(f.status, "failed");
  assert.equal(f.severity, "red");
  assert.match(f.arithmetic, /155,000/);
  assert.ok(Array.isArray(f.spans) && f.spans.length === 4);
  for (const s of f.spans) {
    assert.equal(EXAMPLE.slice(s.start, s.end), s.text);
  }
});

test("pipeline: ungrounded spans are discarded, never flagged", async () => {
  // mock fires only when the text contains $150,000 + $85,000; parts are missing here
  const res = await checkText(
    "Total combined expenditure reached exactly $150,000. Personnel and Salaries: $85,000.",
    config
  );
  assert.equal(res.summary.checked, 0);
  assert.equal(res.summary.discarded["span-not-found"], 1);
});

test("pipeline: not-stated relations are dropped by the validity pass", async () => {
  const res = await checkText(EXAMPLE, config, {
    validity: async () => ({ stated: [{ id: "r1", stated: false }] }),
  });
  assert.equal(res.summary.discarded["not-stated"], 1);
  assert.equal(res.summary.checked, 0);
});

test("pipeline: validity failure fails closed — no verdicts", async () => {
  const res = await checkText(EXAMPLE, config, {
    validity: async () => {
      throw new Error("model unavailable");
    },
  });
  assert.equal(res.summary.discarded["validity-unavailable"], 1);
  assert.equal(res.summary.checked, 0);
  assert.equal(res.meta.warnings.length, 1);
});

test("pipeline: validity pass off → skipped but still verifies", async () => {
  const res = await checkText(EXAMPLE, { ...config, validityPass: false });
  assert.equal(res.summary.validitySkipped, true);
  assert.equal(res.summary.checked, 1);
});

test("pipeline: runs deterministic cross-statement checks", async () => {
  const bsText =
    "As of September 30, 2026 and December 31, 2025\n" +
    "Cash and cash equivalents $14,250 $18,100\n" +
    "Total Assets $64,870 $64,150\n" +
    "Total Liabilities and Stockholders' Equity $64,530 $64,215\n" +
    "For the Nine Months Ended September 30, 2026\n" +
    "Cash and Cash Equivalents at End of Period $14,105";
  const res = await checkText(bsText, config); // mock extractor → no relations
  const types = res.findings.map((f) => f.type);
  assert.ok(types.includes("balance-sheet-identity"));
  assert.ok(types.includes("cash-reconciliation"));
  assert.equal(res.summary.failed, 3);
  assert.equal(res.summary.checked, 3);
  assert.equal(res.meta.crossChecks, 3);
});
