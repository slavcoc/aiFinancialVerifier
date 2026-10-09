import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWs, spanExists, spansExist, locateSpan, locateRelation } from "../src/grounding.js";

test("normalizeWs collapses whitespace", () => {
  assert.equal(normalizeWs("a\n  b\t c"), "a b c");
});

test("spanExists matches verbatim span", () => {
  assert.equal(spanExists("Revenue reached $1.5M in 2024.", "$1.5M"), true);
});

test("spanExists tolerates stripped trailing punctuation", () => {
  assert.equal(spanExists("Revenue reached $1.5M, in 2024.", "$1.5M"), true);
});

test("spanExists rejects spans not in the text", () => {
  assert.equal(spanExists("No money here.", "$1.5M"), false);
});

test("spansExist requires every span of the relation", () => {
  const rel = {
    id: "r1",
    type: "sum",
    parts: [{ text: "$85,000", kind: "money" }],
    total: { text: "$150,000", kind: "money" },
  };
  assert.equal(spansExist("Total is $150,000.", rel), false);
});

test("locateSpan maps back to original offsets across newlines", () => {
  const text = "Line one\n\n  with   spaces";
  const pos = locateSpan(text, "one with");
  assert.ok(pos);
  assert.equal(text.slice(pos.start, pos.end), "one\n\n  with");
});

test("locateSpan handles trailing punctuation stripped", () => {
  const text = "Revenue reached $1.5M, in 2024.";
  const pos = locateSpan(text, "$1.5M");
  assert.ok(pos);
  assert.equal(text.slice(pos.start, pos.end), "$1.5M");
});

test("locateSpan returns null for missing spans", () => {
  assert.equal(locateSpan("nothing here", "$1.5M"), null);
});

test("locateRelation returns offsets for every span", () => {
  const text =
    "Total combined expenditure reached exactly $150,000.\n\n- Personnel: $85,000\n- Infrastructure: $45,000\n- Travel: $25,000";
  const rel = {
    id: "r1",
    type: "sum",
    parts: [
      { text: "$85,000", kind: "money" },
      { text: "$45,000", kind: "money" },
      { text: "$25,000", kind: "money" },
    ],
    total: { text: "$150,000", kind: "money" },
  };
  const located = locateRelation(text, rel);
  assert.ok(located);
  assert.equal(located.length, 4);
  for (const s of located) {
    assert.equal(text.slice(s.start, s.end), s.text);
  }
});
