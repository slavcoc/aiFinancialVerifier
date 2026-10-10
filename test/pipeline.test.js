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
  // claim: verbatim span texts in DOCUMENT order (total first), gaps elided
  assert.equal(f.claim, "$150,000 … $85,000 … $45,000 … $25,000");
});

test("pipeline: ungrounded spans are discarded, never flagged", async () => {
  // mock fires only when the text contains $150,000 + $85,000; parts are missing here
  const res = await checkText(
    "Total combined expenditure reached exactly $150,000. Personnel and Salaries: $85,000.",
    config
  );
  assert.equal(res.summary.checked, 0);
  assert.equal(res.summary.discarded["span-not-found"], 1);
  const f = res.findings.find((x) => x.status === "discarded");
  assert.equal(f.claim, undefined);
});

test("pipeline: not-stated relations are dropped by the validity pass", async () => {
  const res = await checkText(EXAMPLE, config, {
    validity: async () => ({ stated: [{ id: "r1", stated: false }] }),
  });
  assert.equal(res.summary.discarded["not-stated"], 1);
  assert.equal(res.summary.checked, 0);
});

test("pipeline: passed findings carry the claim too", async () => {
  const text = "Total is $150,000. Parts: $85,000, $45,000 and $20,000.";
  const res = await checkText(text, config, {
    extract: async () => ({
      relations: [
        {
          id: "r1",
          type: "sum",
          label: "total vs parts",
          parts: [
            { text: "$85,000", kind: "money" },
            { text: "$45,000", kind: "money" },
            { text: "$20,000", kind: "money" },
          ],
          total: { text: "$150,000", kind: "money" },
        },
      ],
      invalid: [],
      attempts: 1,
    }),
    validity: async () => ({ stated: [{ id: "r1", stated: true }] }),
  });
  const f = res.findings.find((x) => x.id === "r1");
  assert.equal(f.status, "passed");
  assert.equal(f.severity, "green");
  // total is first in document order; parts follow in the order they appear
  assert.equal(f.claim, "$150,000 … $85,000 … $45,000 … $20,000");
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
  const identity = res.findings.find((f) => f.type === "balance-sheet-identity");
  assert.equal(identity.claim, "$64,870 … $64,530");
  for (const f of res.findings) {
    if (f.status === "discarded") assert.equal(f.claim, undefined);
    else if (f.spans?.length) assert.equal(typeof f.claim, "string");
  }
});

test("pipeline: citation checks classify links and feed the summary", async () => {
  const text =
    "See https://live.example.com for the source, but https://dead.example.com/x is gone " +
    "and https://slow.example.com never answers.";
  const fetchStub = async (url, init) => {
    if (url.includes("archive.org")) {
      return Response.json({ archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/20240101000000/https://dead.example.com/x", timestamp: "20240101000000" } } });
    }
    if (url.includes("dead.example.com")) return new Response("", { status: 404 });
    if (url.includes("slow.example.com")) {
      const e = new TypeError("fetch failed");
      e.name = "TimeoutError";
      e.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
      throw e;
    }
    if (url.includes("live.example.com")) return new Response("", { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  };
  const res = await checkText(text, config, { fetch: fetchStub });

  assert.equal(res.summary.citationsChecked, 2); // live + dead; slow is discarded
  assert.equal(res.summary.citationsDead, 1);
  assert.equal(res.summary.checked, 2);
  assert.equal(res.summary.failed, 1);
  assert.equal(res.summary.passed, 1);
  assert.equal(res.summary.discarded.total, 1);
  assert.equal(res.summary.discarded["unreachable: timeout"], 1);

  const dead = res.findings.find((f) => f.type === "citation" && f.status === "failed");
  assert.equal(dead.severity, "red");
  assert.match(dead.note, /HTTP 404 · Wayback snapshot: .+ \(2024-01-01\)/);
  assert.equal(dead.claim, "https://dead.example.com/x");
  assert.equal(text.slice(dead.spans[0].start, dead.spans[0].end), dead.claim);

  const live = res.findings.find((f) => f.type === "citation" && f.status === "passed");
  assert.equal(live.severity, "green");
  assert.equal(live.note, "HTTP 200");

  const slow = res.findings.find((f) => f.type === "citation" && f.status === "discarded");
  assert.equal(slow.reason, "unreachable: timeout");
});
