// Deterministic arithmetic. No LLM involvement, no tolerance tuning by the model.
// Tolerances per ai-extraction-spec.md: ±1% relative, ±0.5 percentage points.
// Failed parses and unknown claims are discarded — never a verdict.

import { parseValue } from "./parser.js";

export const REL_TOL = 0.01;
export const PCT_POINT_TOL = 0.5;

function within(a, b, tol = REL_TOL) {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return a === b;
  return Math.abs(a - b) / scale <= tol;
}

// Table relations must foot exactly: financial statements don't round.
// Prose keeps the ±1% tolerance for rounded figures in narrative text.
function withinFor(rel, a, b) {
  return rel.source === "table" ? a === b : within(a, b);
}

function pctDiff(actual, stated) {
  const scale = Math.max(Math.abs(actual), Math.abs(stated));
  if (scale === 0) return 0;
  return ((actual - stated) / scale) * 100;
}

function fmt(n) {
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  if (Math.abs(n) < 1) return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function normalizeClaim(claim) {
  const c = String(claim).toLowerCase().replace(/[\s_\-]/g, "");
  if (["exceeds", "exceed", "greaterthan", "morethan", "higherthan"].includes(c)) return "exceeds";
  const before = c.match(/^(\d+(?:\.\d+)?)[x×]$/);
  if (before) return { factor: Number(before[1]) };
  const after = c.match(/^[x×](\d+(?:\.\d+)?)$/);
  if (after) return { factor: Number(after[1]) };
  switch (c) {
    case "halfof":
    case "half":
      return { factor: 0.5 };
    case "double":
    case "doubles":
    case "twice":
      return { factor: 2 };
    case "triple":
    case "triples":
      return { factor: 3 };
    default:
      return null;
  }
}

function makeVerdict(rel, status, arithmetic, extra = {}) {
  return {
    id: rel.id,
    type: rel.type,
    label: rel.label,
    status,
    severity: status === "failed" ? "red" : status === "passed" ? "green" : null,
    arithmetic,
    ...extra,
  };
}

function discard(rel, reason) {
  return { id: rel.id, type: rel.type, label: rel.label, status: "discarded", severity: null, reason };
}

export function verifyRelation(rel) {
  const failures = [];
  const v = (span) => {
    const n = parseValue(span?.text, span?.kind);
    if (n === null || Number.isNaN(n)) failures.push(span?.text ?? "(missing)");
    return n;
  };

  switch (rel.type) {
    case "sum": {
      const parts = (rel.parts ?? []).map(v);
      const total = v(rel.total);
      if (failures.length) return discard(rel, "unparseable-span");
      const actual = parts.reduce((s, x) => s + x, 0);
      const ok = withinFor(rel, actual, total);
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `${parts.map(fmt).join(" + ")} = ${fmt(actual)} vs stated total ${fmt(total)}${ok ? "" : ` (off by ${fmt(actual - total)})`}`,
        { actual, stated: total, diffPct: pctDiff(actual, total) }
      );
    }
    case "difference": {
      const a = v(rel.a);
      const b = v(rel.b);
      const result = v(rel.result);
      if (failures.length) return discard(rel, "unparseable-span");
      const actual = a - b;
      const ok = withinFor(rel, actual, result);
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `${fmt(a)} − ${fmt(b)} = ${fmt(actual)} vs stated ${fmt(result)}`,
        { actual, stated: result, diffPct: pctDiff(actual, result) }
      );
    }
    case "percent-of": {
      const pct = v(rel.pct);
      const base = v(rel.base);
      const result = v(rel.result);
      if (failures.length) return discard(rel, "unparseable-span");
      const actual = (pct / 100) * base;
      const ok = within(actual, result);
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `${fmt(pct)}% of ${fmt(base)} = ${fmt(actual)} vs stated ${fmt(result)}`,
        { actual, stated: result, diffPct: pctDiff(actual, result) }
      );
    }
    case "percent-change": {
      const from = v(rel.from);
      const to = v(rel.to);
      const pct = v(rel.pct);
      if (failures.length) return discard(rel, "unparseable-span");
      const actual = ((to - from) / from) * 100;
      const diffPp = actual - pct;
      const ok = Math.abs(diffPp) <= PCT_POINT_TOL;
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `(${fmt(to)} − ${fmt(from)}) / ${fmt(from)} = ${fmt(actual)}% vs stated ${fmt(pct)}% (${diffPp >= 0 ? "+" : ""}${fmt(diffPp)} pp)`,
        { actual, stated: pct, diffPp }
      );
    }
    case "year-elapsed": {
      const year = v(rel.year);
      const n = v(rel.n_years);
      const ref = v(rel.refYear);
      if (failures.length) return discard(rel, "unparseable-span");
      const actual = year + n;
      const ok = actual === ref;
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `${fmt(year)} + ${fmt(n)} = ${fmt(actual)} vs stated ${fmt(ref)}`,
        { actual, stated: ref, diffPct: pctDiff(actual, ref) }
      );
    }
    case "duplicate-value": {
      const a = v(rel.a);
      const b = v(rel.b);
      if (failures.length) return discard(rel, "unparseable-span");
      const ok = withinFor(rel, a, b);
      return makeVerdict(rel, ok ? "passed" : "failed", `${fmt(a)} vs ${fmt(b)}`, {
        actual: a,
        stated: b,
        diffPct: pctDiff(a, b),
      });
    }
    case "product": {
      const rate = v(rel.rate);
      const qty = v(rel.qty);
      const total = v(rel.total);
      if (failures.length) return discard(rel, "unparseable-span");
      const actual = rate * qty;
      const ok = withinFor(rel, actual, total);
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `${fmt(rate)} × ${fmt(qty)} = ${fmt(actual)} vs stated ${fmt(total)}`,
        { actual, stated: total, diffPct: pctDiff(actual, total) }
      );
    }
    case "comparison": {
      const a = v(rel.a);
      const b = v(rel.b);
      if (failures.length) return discard(rel, "unparseable-span");
      const claim = normalizeClaim(rel.claim);
      if (claim === null) return discard(rel, "unknown-claim");
      if (claim === "exceeds") {
        const ok = a > b;
        return makeVerdict(rel, ok ? "passed" : "failed", `${fmt(a)} ${ok ? ">" : "≯"} ${fmt(b)}`, {
          actual: a,
          stated: b,
        });
      }
      const expected = b * claim.factor;
      const ok = within(a, expected);
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `${fmt(a)} vs ${fmt(b)} × ${claim.factor} = ${fmt(expected)}`,
        { actual: a, stated: expected, diffPct: pctDiff(a, expected) }
      );
    }
    case "ratio": {
      const numerator = v(rel.numerator);
      const denominator = v(rel.denominator);
      const result = v(rel.result);
      if (failures.length) return discard(rel, "unparseable-span");
      if (denominator === 0) return discard(rel, "unparseable-span");
      const actual = numerator / denominator;
      // Rounding-aware tolerance: small per-share values are often rounded,
      // so allow half a unit in the last displayed decimal of the stated value.
      const decimals = (String(rel.result?.text ?? "").match(/[.,](\d+)$/) ?? [])[1]?.length ?? 0;
      const halfUnit = Math.pow(10, -decimals) / 2;
      const tol = Math.max(REL_TOL, halfUnit / Math.max(Math.abs(result), 1e-9));
      const ok = within(actual, result, tol);
      return makeVerdict(
        rel,
        ok ? "passed" : "failed",
        `${fmt(numerator)} / ${fmt(denominator)} = ${fmt(actual)} vs stated ${fmt(result)}`,
        { actual, stated: result, diffPct: pctDiff(actual, result) }
      );
    }
    default:
      return discard(rel, "schema-invalid");
  }
}
