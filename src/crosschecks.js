// Deterministic cross-statement checks. No LLM involved — values come from
// verbatim rows parsed by regex, so the verdicts cannot hallucinate.
// These catch structural errors that per-relation checks can't see:
//  - the balance-sheet equation (Assets = Liabilities + Equity)
//  - cash flow ending cash vs balance sheet cash (same period)

import { parseValue } from "./parser.js";
import { locateSpan } from "./grounding.js";

function fmt(n) {
  return Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Row detection must work even when newlines were collapsed (text pasted from a
// wrapped paragraph). Preprocess: insert a newline before every known row label,
// so the line-anchored matching below works on any layout. Offsets are always
// located in the ORIGINAL text, so highlighting is unaffected.
const ROW_LABEL_BOUNDARIES =
  /\s*(?=(?:total\s+assets|total\s+liabilities(?:\s+and)?\s+(?:stockholders?['\u2019]?\s*)?equity|cash\s+and\s+cash\s+equivalents(?:\s+at\s+end\s+of\s+period)?|accumulated\s+deficit|retained\s+earnings|net\s+income(?:\s*\/\s*\(?loss\)?)?)(?![a-z]))/gi;

function rowsView(text) {
  return String(text).replace(ROW_LABEL_BOUNDARIES, "\n");
}

function rowLines(text) {
  return rowsView(text).split(/\r?\n/);
}

// Find the first line whose label matches, and extract every money value on it.
function findRow(text, labelRe) {
  for (const line of rowLines(text)) {
    if (!labelRe.test(line)) continue;
    const spans = [];
    const moneyRe = /\(?\$[\d,]+(?:\.\d+)?\)?/g;
    let m;
    while ((m = moneyRe.exec(line))) {
      const value = parseValue(m[0], "money");
      if (value === null) continue;
      const pos = locateSpan(text, m[0]);
      spans.push({ text: m[0], value, pos: pos || undefined });
    }
    if (spans.length) return { line, spans };
  }
  return null;
}

const TOTAL_ASSETS_RE = /^\s*\|?\s*total\s+assets\s*[\|$]/i;
const LIA_EQ_RE =
  /^\s*\|?\s*total\s+liabilities(?:\s+and)?\s+(?:stockholders?['\u2019]?\s*)?equity\s*[\|$]/i;

function balanceSheetDates(text) {
  const m = String(text).match(
    /as\s+of\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})(?:\s+and\s+([A-Za-z]+\s+\d{1,2},\s+\d{4}))?/i
  );
  return m ? [m[1], m[2]].filter(Boolean) : [];
}

function balanceSheetIdentity(text) {
  const assets = findRow(text, TOTAL_ASSETS_RE);
  const liab = findRow(text, LIA_EQ_RE);
  if (!assets || !liab) return [];
  const dates = balanceSheetDates(text);
  // Compare only the real columns: the number of as-of dates in the header
  // (1 when unknown). In collapsed text the line may carry values from
  // subsequent rows — never pair beyond the column count.
  const n = Math.min(assets.spans.length, liab.spans.length, dates.length || 1);
  const findings = [];
  for (let i = 0; i < n; i++) {
    const a = assets.spans[i];
    const l = liab.spans[i];
    const ok = a.value === l.value;
    const when = dates[i] ? `as of ${dates[i]}` : `column ${i + 1}`;
    findings.push({
      id: `xc-bs-${i + 1}`,
      type: "balance-sheet-identity",
      label: `Total Assets vs Total Liabilities & Equity — ${when}`,
      status: ok ? "passed" : "failed",
      severity: ok ? "green" : "red",
      arithmetic: ok
        ? `${fmt(a.value)} = ${fmt(l.value)}`
        : `${fmt(a.value)} ≠ ${fmt(l.value)} (off by ${fmt(a.value - l.value)})`,
      spans: [spanOf(a), spanOf(l)].filter(Boolean),
    });
  }
  return findings;
}

const BS_CASH_RE = /^\s*\|?\s*cash\s+and\s+cash\s+equivalents\s*[\|$]/i;
const CFS_END_CASH_RE =
  /^\s*\|?\s*cash\s+and\s+cash\s+equivalents\s+at\s+end\s+of\s+period\s*[\|$]/i;

function spanOf(s) {
  return s.pos ? { text: s.text, ...s.pos } : undefined;
}

function cashFlowEndDate(text) {
  const m = String(text).match(
    /(?:nine|three|six|twelve)\s+months\s+ended\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i
  );
  return m ? m[1] : null;
}

function cashReconciliation(text) {
  const bs = findRow(text, BS_CASH_RE);
  const cfs = findRow(text, CFS_END_CASH_RE);
  if (!bs || !cfs) return [];

  // Only compare when the periods line up: balance sheet first as-of date
  // must equal the cash flow period end date. If either is unknown, run it.
  const bsDates = balanceSheetDates(text);
  const cfsDate = cashFlowEndDate(text);
  if (bsDates[0] && cfsDate && bsDates[0] !== cfsDate) return [];

  const a = bs.spans[0]; // first column = most recent period
  const b = cfs.spans[0];
  const ok = a.value === b.value;
  return [
    {
      id: "xc-cash-1",
      type: "cash-reconciliation",
      label: "Balance sheet cash vs cash flow ending cash",
      status: ok ? "passed" : "failed",
      severity: ok ? "green" : "red",
      arithmetic: ok
        ? `${fmt(a.value)} = ${fmt(b.value)}`
        : `${fmt(a.value)} ≠ ${fmt(b.value)} (off by ${fmt(a.value - b.value)})`,
      spans: [spanOf(a), spanOf(b)].filter(Boolean),
    },
  ];
}

export function runCrossChecks(text) {
  return [
    ...balanceSheetIdentity(text),
    ...cashReconciliation(text),
    ...retainedEarningsRollForward(text),
  ];
}

const RE_DEFICIT_RE = /^\s*\|?\s*accumulated\s+deficit\s*[\|$(]/i;
const RE_POSITIVE_RE = /^\s*\|?\s*retained\s+earnings\s*[\|$(]/i;
const NET_INCOME_RE = /^\s*\|?\s*net\s+income(?:\s*\/\s*\(?loss\)?)?\s*[\|$(]/i;

// Financial knowledge, encoded generically: the retained-earnings roll-forward
// uses the net income of the FULL period between the two balance-sheet dates.
// Multi-period statements (e.g., "Three and Nine Months Ended") put that in the
// longest-period column — find it by parsing the column-header line, with a
// standard-layout fallback ([3M, 3M, 9M, 9M] → index 2).

function dayYearKey(dateStr) {
  const m = String(dateStr).match(/(\d{1,2}),\s*(\d{4})\s*$/);
  return m ? `${Number(m[1])}-${m[2]}` : null;
}

function ytdColumnIndex(text, valueCount) {
  // Collect every period label in document order, then take the LAST
  // longest-period label (nine/twelve months or full year) whose end date
  // matches the balance sheet's as-of date and whose position could be a
  // column of the target row. Column headers come after titles, so the last
  // such match is the header column — works on collapsed text too.
  const bsDates = balanceSheetDates(text);
  const bsKey = bsDates[0] ? dayYearKey(bsDates[0]) : null;
  const periodRe =
    /(three|six|nine|twelve)\s+months\s+ended\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})|((?:fiscal\s+)?year\s+ended)\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/gi;

  const matches = [];
  for (const line of rowLines(text)) {
    for (const m of line.matchAll(periodRe)) {
      // skip title labels: "For the ... Nine Months Ended Sept 30, 2026 and 2025"
      // describes both periods at once and is not a column
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 25);
      if (/^\s+and\s+\d{4}/.test(after)) continue;
      matches.push({ label: (m[1] || m[3] || "").toLowerCase(), date: m[2] || m[4] || "" });
    }
  }
  if (matches.length < 2) return null; // one label = title only, no column header

  let idx = null;
  for (let i = 0; i < matches.length; i++) {
    if (i >= valueCount) break; // cannot be a column of the target row
    const { label, date } = matches[i];
    if (!(label.startsWith("nine") || label.startsWith("twelve") || label.includes("year"))) {
      continue;
    }
    if (bsKey && date && dayYearKey(date) !== bsKey) continue;
    idx = i;
  }
  return idx;
}

// Ending retained earnings (or accumulated deficit) must equal the beginning
// balance plus net income for the period in between, unless dividends are
// disclosed (then we can't check).
function retainedEarningsRollForward(text) {
  if (/dividend/i.test(text)) return [];
  const dates = balanceSheetDates(text);
  const columnCount = dates.length || 1;
  if (columnCount < 2) return []; // roll-forward needs a prior-period balance
  const re = findRow(text, RE_DEFICIT_RE) || findRow(text, RE_POSITIVE_RE);
  const ni = findRow(text, NET_INCOME_RE);
  if (!re || !ni) return [];
  if (re.spans.length < columnCount || ni.spans.length < 1) return [];

  let idx = ytdColumnIndex(text, ni.spans.length);
  if (idx === null) {
    // no parseable column headers — fall back to standard layouts:
    // 2 values → single-period statement; 4 values → [3M, 3M, 9M, 9M]
    if (ni.spans.length === 2) idx = 0;
    else if (ni.spans.length === 4) idx = 2;
    else return [];
  }
  if (idx >= ni.spans.length) return [];

  const end = re.spans[0].value; // current period
  const begin = re.spans[columnCount - 1].value; // prior period
  const net = ni.spans[idx].value; // net income / (loss) for the full period
  const expected = begin + net;
  const ok = end === expected;
  return [
    {
      id: "xc-re-1",
      type: "retained-earnings-roll-forward",
      label: "Accumulated deficit roll-forward vs net income",
      status: ok ? "passed" : "failed",
      severity: ok ? "green" : "red",
      arithmetic: ok
        ? `${fmt(begin)} + ${fmt(net)} = ${fmt(end)}`
        : `${fmt(begin)} + ${fmt(net)} = ${fmt(expected)} vs stated ${fmt(end)} (off by ${fmt(end - expected)})`,
      spans: [spanOf(re.spans[0]), spanOf(re.spans[columnCount - 1]), spanOf(ni.spans[idx])].filter(Boolean),
    },
  ];
}
