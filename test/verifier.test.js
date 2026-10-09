import test from "node:test";
import assert from "node:assert/strict";
import { verifyRelation } from "../src/verifier.js";

const sumRel = () => ({
  id: "r1",
  type: "sum",
  label: "departmental expenditure breakdown",
  parts: [
    { text: "$85,000", kind: "money" },
    { text: "$45,000", kind: "money" },
    { text: "$25,000", kind: "money" },
  ],
  total: { text: "$150,000", kind: "money" },
});

test("sum: parts exceed stated total → failed (the motivating example)", () => {
  const r = verifyRelation(sumRel());
  assert.equal(r.status, "failed");
  assert.equal(r.severity, "red");
  assert.equal(r.actual, 155000);
});

test("sum: correct total → passed", () => {
  const rel = sumRel();
  rel.total = { text: "$155,000", kind: "money" };
  assert.equal(verifyRelation(rel).status, "passed");
});

test("sum: within 1% tolerance → passed", () => {
  const rel = sumRel();
  rel.total = { text: "$156,500", kind: "money" }; // 155,000 vs 156,500 ≈ 0.96%
  assert.equal(verifyRelation(rel).status, "passed");
});

test("sum: beyond tolerance → failed", () => {
  const rel = sumRel();
  rel.total = { text: "$160,000", kind: "money" };
  assert.equal(verifyRelation(rel).status, "failed");
});

test("percent-change: within 0.5 pp → passed", () => {
  const rel = {
    id: "r2",
    type: "percent-change",
    label: "revenue growth",
    from: { text: "100", kind: "number" },
    to: { text: "110", kind: "number" },
    pct: { text: "10.3%", kind: "pct" },
  };
  assert.equal(verifyRelation(rel).status, "passed");
});

test("percent-change: beyond 0.5 pp → failed", () => {
  const rel = {
    id: "r2",
    type: "percent-change",
    label: "revenue growth",
    from: { text: "100", kind: "number" },
    to: { text: "110", kind: "number" },
    pct: { text: "10.6%", kind: "pct" },
  };
  assert.equal(verifyRelation(rel).status, "failed");
});

test("percent-of", () => {
  const rel = {
    id: "r3",
    type: "percent-of",
    label: "tax share",
    pct: { text: "20%", kind: "pct" },
    base: { text: "$1,000", kind: "money" },
    result: { text: "$200", kind: "money" },
  };
  assert.equal(verifyRelation(rel).status, "passed");
});

test("difference", () => {
  const rel = {
    id: "r4",
    type: "difference",
    label: "net revenue",
    a: { text: "$1,000", kind: "money" },
    b: { text: "$400", kind: "money" },
    result: { text: "$600", kind: "money" },
  };
  assert.equal(verifyRelation(rel).status, "passed");
});

test("product", () => {
  const rel = {
    id: "r5",
    type: "product",
    label: "subscription revenue",
    rate: { text: "$20", kind: "money" },
    qty: { text: "50", kind: "number" },
    total: { text: "$1,000", kind: "money" },
  };
  assert.equal(verifyRelation(rel).status, "passed");
});

test("year-elapsed: exact, then mismatch", () => {
  const rel = {
    id: "r6",
    type: "year-elapsed",
    label: "company age",
    year: { text: "2010", kind: "year" },
    n_years: { text: "15", kind: "number" },
    refYear: { text: "2025", kind: "year" },
  };
  assert.equal(verifyRelation(rel).status, "passed");
  rel.refYear = { text: "2026", kind: "year" };
  assert.equal(verifyRelation(rel).status, "failed");
});

test("duplicate-value: mismatch beyond 1% → failed", () => {
  const rel = {
    id: "r7",
    type: "duplicate-value",
    label: "figure stated twice",
    a: { text: "100", kind: "number" },
    b: { text: "105", kind: "number" },
  };
  assert.equal(verifyRelation(rel).status, "failed");
});

test("comparison: double / triple / exceeds / ×N", () => {
  const base = { id: "r8", type: "comparison", label: "market share" };
  const mk = (a, b, claim) => ({
    ...base,
    a: { text: String(a), kind: "number" },
    b: { text: String(b), kind: "number" },
    claim,
  });
  assert.equal(verifyRelation(mk(40, 20, "double")).status, "passed");
  assert.equal(verifyRelation(mk(60, 20, "triple")).status, "passed");
  assert.equal(verifyRelation(mk(41, 20, "exceeds")).status, "passed");
  assert.equal(verifyRelation(mk(19, 20, "exceeds")).status, "failed");
  assert.equal(verifyRelation(mk(50, 20, "×2.5")).status, "passed");
});

test("unparseable span → discarded, never a verdict", () => {
  const rel = sumRel();
  rel.parts[0] = { text: "lots of money", kind: "money" };
  const r = verifyRelation(rel);
  assert.equal(r.status, "discarded");
  assert.equal(r.reason, "unparseable-span");
});

test("unknown comparison claim → discarded", () => {
  const r = verifyRelation({
    id: "r9",
    type: "comparison",
    label: "x",
    a: { text: "10", kind: "number" },
    b: { text: "5", kind: "number" },
    claim: "way bigger than",
  });
  assert.equal(r.status, "discarded");
  assert.equal(r.reason, "unknown-claim");
});

test("ratio: EPS with rounding-aware tolerance", () => {
  const mk = (n, d, r) => ({
    id: "r10",
    type: "ratio",
    label: "basic earnings per share",
    numerator: { text: n, kind: "money" },
    denominator: { text: d, kind: "number" },
    result: { text: r, kind: "money" },
  });
  // 1,960 / 55,000 = 0.035636... — stated 0.036 (rounded); 1.01% off but rounding-valid
  assert.equal(verifyRelation(mk("$1,960", "55,000", "$0.036")).status, "passed");
  // 775 / 52,100 = 0.014875 — stated 0.015
  assert.equal(verifyRelation(mk("$775", "52,100", "$0.015")).status, "passed");
  // genuinely wrong EPS
  assert.equal(verifyRelation(mk("$775", "52,100", "$0.040")).status, "failed");
});

test("table-source sum must foot exactly: off-by-10 fails", () => {
  const rel = {
    id: "t1",
    type: "sum",
    source: "table",
    label: "nine-month net cash from operating activities",
    parts: [
      { text: "($615)", kind: "money" },
      { text: "$3,120", kind: "money" },
      { text: "$300", kind: "money" },
      { text: "($1,320)", kind: "money" },
      { text: "($670)", kind: "money" },
      { text: "($330)", kind: "money" },
      { text: "$750", kind: "money" },
      { text: "$330", kind: "money" },
    ],
    total: { text: "$1,575", kind: "money" },
  };
  const r = verifyRelation(rel);
  assert.equal(r.status, "failed");
  assert.equal(r.actual, 1565);
});

test("prose-source sum keeps ±1% tolerance", () => {
  const rel = {
    id: "p1",
    type: "sum",
    source: "prose",
    label: "rounded figures in narrative",
    parts: [
      { text: "$85,000", kind: "money" },
      { text: "$45,000", kind: "money" },
      { text: "$25,000", kind: "money" },
    ],
    total: { text: "$156,500", kind: "money" }, // 155,000 vs 156,500 ≈ 0.96%
  };
  assert.equal(verifyRelation(rel).status, "passed");
});
