import test from "node:test";
import assert from "node:assert/strict";
import { runCrossChecks } from "../src/crosschecks.js";

const BS_CFS = `Veloce Mobility Solutions Ltd.
Consolidated Balance Sheets
As of September 30, 2026 and December 31, 2025
(Unaudited; in thousands of U.S. dollars)
Assets September 30, 2026 December 31, 2025
Cash and cash equivalents $14,250 $18,100
Total Assets $64,870 $64,150
Total Liabilities and Stockholders' Equity $64,530 $64,215

Consolidated Statements of Cash Flows
For the Nine Months Ended September 30, 2026
Cash and cash equivalents at beginning of period $18,100
Cash and Cash Equivalents at End of Period $14,105`;

test("balance-sheet identity flags both unbalanced columns", () => {
  const res = runCrossChecks(BS_CFS);
  const bs = res.filter((f) => f.type === "balance-sheet-identity");
  assert.equal(bs.length, 2);
  assert.equal(bs[0].status, "failed");
  assert.match(bs[0].arithmetic, /340/);
  assert.match(bs[0].label, /September 30, 2026/);
  assert.equal(bs[1].status, "failed");
  assert.match(bs[1].arithmetic, /65/);
});

test("cash reconciliation flags inter-statement mismatch", () => {
  const res = runCrossChecks(BS_CFS);
  const cash = res.find((f) => f.type === "cash-reconciliation");
  assert.ok(cash);
  assert.equal(cash.status, "failed");
  assert.match(cash.arithmetic, /145/);
});

test("balanced sheet passes", () => {
  const text =
    "As of September 30, 2026 and December 31, 2025\n" +
    "Total Assets $100 $200\nTotal Liabilities and Stockholders' Equity $100 $200";
  const bs = runCrossChecks(text).filter((f) => f.type === "balance-sheet-identity");
  assert.equal(bs.length, 2);
  assert.ok(bs.every((f) => f.status === "passed"));
});

test("balance-sheet identity without as-of header checks one column only", () => {
  const text = "Total Assets $100 $200\nTotal Liabilities and Stockholders' Equity $100 $200";
  const bs = runCrossChecks(text).filter((f) => f.type === "balance-sheet-identity");
  assert.equal(bs.length, 1); // unknown column count → conservative, first column only
  assert.equal(bs[0].status, "passed");
});

test("matching cash passes", () => {
  const text =
    "As of September 30, 2026\nCash and cash equivalents $14,250\nTotal Assets $14,250\nTotal Liabilities and Stockholders' Equity $14,250\nFor the Nine Months Ended September 30, 2026\nCash and Cash Equivalents at End of Period $14,250";
  const cash = runCrossChecks(text).find((f) => f.type === "cash-reconciliation");
  assert.ok(cash);
  assert.equal(cash.status, "passed");
});

test("cash reconciliation skipped when periods differ", () => {
  const text =
    "As of September 30, 2026\nCash and cash equivalents $14,250\nTotal Assets $14,250\nTotal Liabilities and Stockholders' Equity $14,250\nFor the Nine Months Ended June 30, 2026\nCash and Cash Equivalents at End of Period $14,105";
  const cash = runCrossChecks(text).find((f) => f.type === "cash-reconciliation");
  assert.equal(cash, undefined);
});

test("no BS/CFS rows → no cross findings", () => {
  assert.deepEqual(runCrossChecks("Just prose, nothing financial."), []);
});

test("cross-check findings carry highlight spans", () => {
  const res = runCrossChecks(BS_CFS);
  const cash = res.find((f) => f.type === "cash-reconciliation");
  assert.ok(cash.spans.length >= 2);
  for (const s of cash.spans) {
    assert.equal(BS_CFS.slice(s.start, s.end), s.text);
  }
});

test("cross-checks work when newlines are collapsed (pasted from wrapped text)", () => {
  const aegis =
    "Aegis Industrial Robotics Inc. Consolidated Balance Sheets As of September 30, 2026 and December 31, 2025 " +
    "Assets September 30, 2026 December 31, 2025 Cash and cash equivalents $12,500 $15,000 Total Current Assets $29,900 $29,600 " +
    "Total Assets $76,500 $72,300 Liabilities and Stockholders' Equity Total Liabilities $39,200 $39,800 " +
    "Retained earnings $8,850 $4,650 Total Stockholders' Equity $37,350 $32,500 " +
    "Total Liabilities and Stockholders' Equity $76,550 $72,300 " +
    "Consolidated Statements of Operations For the Three and Nine Months Ended September 30, 2026 and 2025 " +
    "Line Item Three Months Ended Sept 30, 2026 Three Months Ended Sept 30, 2025 Nine Months Ended Sept 30, 2026 Nine Months Ended Sept 30, 2025 " +
    "Net Income $1,800 $1,230 $5,900 $4,070";
  const res = runCrossChecks(aegis);
  const bs = res.filter((f) => f.type === "balance-sheet-identity");
  assert.equal(bs.length, 2, "two as-of dates → two column checks, no trailing values");
  assert.equal(bs[0].status, "failed");
  assert.match(bs[0].arithmetic, /off by -50/);
  assert.equal(bs[1].status, "passed"); // Dec 31, 2025 column balances
  const re = res.find((f) => f.type === "retained-earnings-roll-forward");
  assert.ok(re);
  assert.equal(re.status, "failed");
  // 4,650 + 5,900 (9M) = 10,550 vs stated 8,850
  assert.match(re.arithmetic, /10,550/);
  assert.match(re.arithmetic, /off by -1,700/);
});

test("retained earnings roll-forward flags unexplained movement", () => {
  const text =
    "As of September 30, 2026 and December 31, 2025\n" +
    "Accumulated deficit ($6,808) ($7,258)\n" +
    "Net Income / (Loss) $330 ($1,940)\n";
  const re = runCrossChecks(text).find((f) => f.type === "retained-earnings-roll-forward");
  assert.ok(re);
  assert.equal(re.status, "failed");
  assert.match(re.arithmetic, /-6,928/);
  assert.match(re.arithmetic, /off by 120/);
});

test("retained earnings roll-forward passes when it reconciles", () => {
  const text =
    "As of September 30, 2026 and December 31, 2025\n" +
    "Accumulated deficit ($6,928) ($7,258)\n" +
    "Net Income / (Loss) $330 ($1,940)\n";
  const re = runCrossChecks(text).find((f) => f.type === "retained-earnings-roll-forward");
  assert.ok(re);
  assert.equal(re.status, "passed");
});

test("retained earnings check skipped when dividends are disclosed", () => {
  const text =
    "As of September 30, 2026\n" +
    "Accumulated deficit ($6,808) ($7,258)\n" +
    "Net Income / (Loss) $330\n" +
    "Dividends declared and paid $120\n";
  const re = runCrossChecks(text).find((f) => f.type === "retained-earnings-roll-forward");
  assert.equal(re, undefined);
});

test("RE roll-forward picks the nine-month column in a 3M+9M statement", () => {
  const text =
    "As of September 30, 2026 and December 31, 2025\n" +
    "Accumulated deficit ($5,812) ($9,060)\n" +
    "Line Item Three Months Ended Sept 30, 2026 Three Months Ended Sept 30, 2025 Nine Months Ended Sept 30, 2026 Nine Months Ended Sept 30, 2025\n" +
    "Net Income $2,250 $750 $5,550 $1,920\n";
  const re = runCrossChecks(text).find((f) => f.type === "retained-earnings-roll-forward");
  assert.ok(re);
  assert.equal(re.status, "failed");
  // -9,060 + 5,550 (9M) = -3,510 vs stated -5,812 → off by 2,302
  assert.match(re.arithmetic, /-3,510/);
  assert.match(re.arithmetic, /off by -?2,302/);
});

test("RE roll-forward passes when the 9M column reconciles", () => {
  const text =
    "As of September 30, 2026 and December 31, 2025\n" +
    "Accumulated deficit ($3,510) ($9,060)\n" +
    "Line Item Three Months Ended Sept 30, 2026 Three Months Ended Sept 30, 2025 Nine Months Ended Sept 30, 2026 Nine Months Ended Sept 30, 2025\n" +
    "Net Income $2,250 $750 $5,550 $1,920\n";
  const re = runCrossChecks(text).find((f) => f.type === "retained-earnings-roll-forward");
  assert.ok(re);
  assert.equal(re.status, "passed");
});

test("RE roll-forward handles 'Net Income / (Loss)' rows with parenthesized values", () => {
  const text =
    "As of September 30, 2026 and December 31, 2025\n" +
    "Accumulated deficit ($668) ($4,655)\n" +
    "Line Item Three Months Ended Sept 30, 2026 Three Months Ended Sept 30, 2025 Nine Months Ended Sept 30, 2026 Nine Months Ended Sept 30, 2025\n" +
    "Net Income / (Loss) ($180) ($920) ($720) ($2,700)\n";
  const re = runCrossChecks(text).find((f) => f.type === "retained-earnings-roll-forward");
  assert.ok(re);
  assert.equal(re.status, "failed");
  // -4,655 + (-720) = -5,375 vs stated -668 → off by 4,707
  assert.match(re.arithmetic, /-5,375/);
  assert.match(re.arithmetic, /off by 4,707/);
});

test("title lines with a single period label don't break column detection", () => {
  const text =
    "Consolidated Statements of Operations\n" +
    "For the Three and Nine Months Ended September 30, 2026 and 2025\n" +
    "As of September 30, 2026 and December 31, 2025\n" +
    "Accumulated deficit ($5,812) ($9,060)\n" +
    "Line Item Three Months Ended Sept 30, 2026 Three Months Ended Sept 30, 2025 Nine Months Ended Sept 30, 2026 Nine Months Ended Sept 30, 2025\n" +
    "Net Income $2,250 $750 $5,550 $1,920\n";
  const re = runCrossChecks(text).find((f) => f.type === "retained-earnings-roll-forward");
  assert.ok(re);
  assert.match(re.arithmetic, /off by -?2,302/);
});
