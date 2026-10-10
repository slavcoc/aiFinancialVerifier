---
title: "Claim-level verdicts (Supported / Contradicted / Not checked)"
status: draft
created: "2026-10-10T16:37:04.283Z"
updated: "2026-10-10T16:41:22.146Z"
type: feature
---

# Claim-level verdicts — one row per numeric claim

## Goal

Convert the raw findings list into **one row per numeric claim** a reviewer can read:
verbatim claim text, a verdict badge (✓ Checks out / ✗ Doesn't add up / ⊘ Skipped),
the math, and a click-to-reveal link back to the highlight in the annotated report.

Today the UI lists relations (type + label + arithmetic); reviewers think in claims
("the total says $150,000"), not relations ("sum r1"). Claim text is reconstructed
from spans in document order (engine already returns offsets). The plan's report spec
(§3.8) is one row per claim; this is also the bridge to the post-MVP full report.

## Key design decisions

1. **Engine-side `claim` field (do the "optional nicety")** — attach `claim` to every
   finding that has spans in `src/pipeline.js`, built from the *original document text*
   between first and last span (interior gaps collapsed to " … "). This reads like a
   sentence ("Total combined expenditure … reached exactly $150,000"), is verbatim,
   and makes the API self-describing for non-web consumers. Helper lives in
   `src/grounding.js` next to `locateRelation`.
2. **Client fallback** — `claimText(finding)` in a pure `web/lib/claims.ts` module
   prefers `f.claim`, else joins span texts sorted by offset with " … ". UI stays
   robust even if an old engine version is running.
3. **Show ALL findings as claim rows** — failed, passed, and discarded (with reason).
   Today only failed findings get cards; a reviewer must see every claim that was
   checked (or skipped). Order: failed → passed → discarded, document order within
   each group.
4. **Click → scroll + pulse** — marks in `AnnotatedText` get stable DOM ids
   (`claim-highlight-<findingIndex>`); clicking a row scrolls to and pulses the mark.
   Findings whose marks were dropped by overlap resolution get a non-clickable row.
5. **Reuse `FindingCard`** — rework it into the claim row (badge + claim + arithmetic +
   discard reason); keep it a pure presentational component with an `onReveal` callback.
6. **Testability** — pure helpers (claim reconstruction, mark computation, ordering)
   live in `web/lib/claims.ts`; add `vitest` to the web package for unit tests.
   Engine side uses the existing `node:test` suite.

## Phase 0: Baseline

- `npm test` at repo root — engine suite green.
- `cd web && npm run build` — Next build/typecheck green.
- Note current UI behavior for the example (failed-only cards) as the before-state.

**Verify:** both commands pass before any change.

## Phase 1: Engine — claim reconstruction (TDD) ✅

- `test/grounding.test.js` (red): new `claimFromSpans(text, spans)` expectations —
  spans in non-document order come out in document order; interior gaps become " … ";
  single span → its text; no/empty/unpositioned spans → null.
- `src/grounding.js`: implemented `claimFromSpans(text, spans)` — keeps positioned
  spans, sorts by `start`, joins the verbatim original-text slices with " … "
  (equivalent to span texts concatenated, per the spec's "spans concatenated with '…'";
  implemented as slice+join to stay verbatim-exact).
- `src/pipeline.js`: attaches `result.claim` in step 4 (checked findings) and step 5
  (cross-check findings with spans). Discarded findings get no `claim`.
- `test/pipeline.test.js`: asserts `claim` on failed mock finding, on a passed finding
  (injected extractor dep, green path), and on cross-check findings; discarded → undefined.
- `README.md`: `claim` added to the `POST /check` example finding.

## Phase 2: Web — pure helpers + vitest (TDD)

- `web/lib/claims.ts` (new): shared types (`Span`, `Finding` with `claim?: string`,
  `CheckResponse`), `claimText(finding)`, `computeMarks(findings)`, `orderFindings`.
  - `claimText`: prefer `f.claim`; fallback sorts spans by `start` and joins texts
    with " … "; null when no spans.
  - `computeMarks`: move the existing mark/overlap logic out of `AnnotatedText`;
    marks now carry `findingIndex`; returns `{ marks, rendered: Set<number> }`.
  - `orderFindings`: failed → passed → discarded; within group by first span start
    (discarded by original index).
- Add `vitest` (devDependency) + `"test": "vitest run"` script to `web/package.json`.
- `web/lib/claims.test.ts` (red→green): fallback join order, `f.claim` preference,
  overlap-drop behavior and `rendered` set, verdict-group ordering.
- Refactor `checker.tsx` to import types/helpers from `@/lib/claims` (delete the
  local duplicates) — pure move, no UI change yet.

**Verify:** `cd web && npx vitest run` green; `npm run build` green.

## Phase 3: UI — AnnotatedText stable ids + pulse

- `AnnotatedText` takes `marks` as a prop (computed once in `Checker`); each `<mark>`
  gets `id={\`claim-highlight-${m.findingIndex}\`}`.
- `globals.css`: `@keyframes claim-pulse` (soft ring/flash on the highlight colors)
  and a `.claim-pulse` class; single-run animation.
- Small `revealClaim(findingIndex)` helper in checker.tsx: get element, scrollIntoView
  ({ block: "center" }), add pulse class, remove on `animationend`/timeout. Guard for
  missing element (overlap-dropped marks).

**Verify:** build green; manual smoke — highlight ids present in DOM.

## Phase 4: UI — FindingCard → claim row

- Rework `FindingCard`:
  - verdict badge: ✓ Checks out (green) / ✗ Doesn't add up (red) / ⊘ Skipped (gray),
    uppercase micro-caps as today
  - primary line = claim text (`claimText(f)`, fallback `f.label`), clamped to ~3 lines
    with `title` for full text
  - keep type chip and arithmetic box (math)
  - discarded: keep id + reason line
  - whole card becomes a button-like row (cursor-pointer, hover ring, `aria-label`,
    `role` semantics) with optional `onReveal` — no-op when not provided
- Keep it presentational (no DOM/scroll logic inside).

**Verify:** build green; visual check of all three verdict states.

## Phase 5: UI — ClaimsList wiring in Checker

- New `ClaimsList` component: header "Claims" with count; one `FindingCard` per finding
  in `orderFindings` order; rows for findings in `rendered` set call `onReveal(i)`,
  others rendered non-clickable.
- In `Checker`: compute `marks`/`rendered` once; render claims list directly under the
  summary chips (annotated report above, chips, then claims list); remove the old
  failed-only list; keep the "No errors found" banner and empty state for
  zero-findings results; keep the skipped chip.

**Verify:** `npm run build` + `npx vitest run` green.

## Phase 6: End-to-end verification

- Engine: `npm test` — all suites green.
- Web: `cd web && npm run build && npm test`.
- Manual smoke (mock mode):
  1. `GEMINI_MOCK=1 npm run dev` (engine) + `cd web && npm run dev`.
  2. Paste example → summary chips (1 checked, 1 failed) → annotated report →
     claims list with 1 failed row: ✗ badge, verbatim claim with " … ", arithmetic;
     click row → scrolls to + pulses the highlight.
  3. Passed case: run engine against a text where the sum is correct → ✓ row, no
     failures, banner "No errors found".
  4. Discarded case: text missing part spans ("…reached exactly $150,000.") →
     ⊘ Skipped row showing reason (span-not-found), non-clickable.
  5. Re-check after editing text (the fix loop) — stale state cleared, new rows render.
- Update README screenshot/description only if it shows the old failed-only list.

## Out of scope

- Evidence quotes, sources, confidence (post-MVP full report)
- Changes to `web/app/api/check/route.ts` (claim rides along in findings)
- Filtering/sorting UI controls for the claims list