import { extract } from "./extractor.js";
import { locateRelation } from "./grounding.js";
import { verifyRelation } from "./verifier.js";
import { validityPass } from "./validity.js";
import { runCrossChecks } from "./crosschecks.js";

// Pipeline: extract → ground (verbatim spans + offsets) → validity (explicitly stated?)
// → parse (deterministic) → verify (deterministic arithmetic) → findings.
//
// Precision-first guarantees:
// - spans not in the document → discarded, never flagged
// - relations the document doesn't state → discarded, never flagged
// - validity pass failure → fail closed (all relations discarded)
// - unparseable spans → discarded, never a verdict
// The LLM can only cost recall; it cannot create a false verdict.

function discardedFinding(rel, reason) {
  return {
    id: rel?.id ?? null,
    type: rel?.type ?? null,
    label: rel?.label ?? null,
    status: "discarded",
    severity: null,
    reason,
  };
}

export async function checkText(text, config, deps = {}) {
  const start = Date.now();
  const summary = {
    checked: 0,
    passed: 0,
    failed: 0,
    discarded: {
      total: 0,
      "schema-invalid": 0,
      "span-not-found": 0,
      "not-stated": 0,
      "unparseable-span": 0,
      "unknown-claim": 0,
      "validity-unavailable": 0,
    },
    validitySkipped: false,
  };
  const meta = { model: config.model, mock: config.mock, version: config.version, warnings: [] };
  const findings = [];

  // 1. Extract
  const extractFn = deps.extract ?? extract;
  const { relations, invalid, attempts } = await extractFn(config, text);
  meta.extractionAttempts = attempts;
  for (const inv of invalid) {
    summary.discarded["schema-invalid"]++;
    findings.push({ id: inv.id, status: "discarded", severity: null, reason: inv.reason });
  }

  // 2. Ground: every span must exist verbatim in the document; record offsets
  const grounded = [];
  for (const rel of relations) {
    const spans = locateRelation(text, rel);
    if (spans) {
      grounded.push({ rel, spans });
    } else {
      summary.discarded["span-not-found"]++;
      findings.push(discardedFinding(rel, "span-not-found"));
    }
  }

  // 3. Validity: the document must explicitly state the relation
  const groundedRels = grounded.map((g) => g.rel);
  let statedMap = new Map(groundedRels.map((r) => [r.id, true]));
  let validityFailed = false;
  if (config.validityPass) {
    try {
      const validityFn = deps.validity ?? validityPass;
      const res = await validityFn(config, text, groundedRels);
      statedMap = new Map((res.stated ?? []).map((s) => [s.id, !!s.stated]));
      if (res.skipped) summary.validitySkipped = true;
    } catch (e) {
      // fail closed: precision first
      validityFailed = true;
      meta.warnings.push(
        `validity pass failed — discarding ${groundedRels.length} relations: ${e.message}`
      );
      for (const { rel } of grounded) {
        summary.discarded["validity-unavailable"]++;
        findings.push(discardedFinding(rel, "validity-unavailable"));
      }
    }
  } else {
    summary.validitySkipped = true;
  }

  // 4. Verify deterministically
  if (!validityFailed) {
    for (const { rel, spans } of grounded) {
      if (statedMap.get(rel.id) === false) {
        summary.discarded["not-stated"]++;
        findings.push(discardedFinding(rel, "not-stated"));
        continue;
      }
      const result = verifyRelation(rel);
      if (result.status === "discarded") {
        summary.discarded[result.reason] = (summary.discarded[result.reason] ?? 0) + 1;
        findings.push(result);
        continue;
      }
      // attach offsets for inline highlighting
      result.spans = spans;
      summary.checked++;
      if (result.status === "passed") summary.passed++;
      else summary.failed++;
      findings.push(result);
    }
  }

  // 5. Deterministic cross-statement checks (no LLM): balance-sheet
  // identity, cash reconciliation. These run even if extraction failed.
  const cross = runCrossChecks(text);
  meta.crossChecks = cross.length;
  for (const f of cross) {
    summary.checked++;
    if (f.status === "failed") summary.failed++;
    else summary.passed++;
    findings.push(f);
  }

  summary.discarded.total = findings.filter((f) => f.status === "discarded").length;
  meta.totalMs = Date.now() - start;
  return { summary, findings, meta };
}
