---
title: "Dead-citation check (deterministic "is it true?" slice)"
status: draft
created: "2026-10-10T17:19:10.097Z"
type: feature
---

# Dead-citation check (deterministic "is it true?" slice)

## Goal

Deterministic engine module that pulls every URL/DOI out of the text, fetches each
(HEAD → GET fallback, redirects followed, ~5s timeout), and classifies: **resolves /
dead / unreachable / paywall**. Dead links get one archive.org availability check and
the snapshot is noted. Findings carry span offsets (same pattern as `crosschecks.js`)
so the URL is highlighted in the annotated report. **No LLM anywhere in this feature.**

Verdict mapping (honest, consistent with the claims list's ✓/✗/⊘ semantics):
- **resolves** (2xx/3xx) → passed / green
- **dead** (404, 410, DNS NXDOMAIN) → failed / **red**
- **paywall** (401/403) → passed / **ochre** ("link exists, content gated" — the
  amber state the spec asks for)
- **unreachable** (timeout, refused, 5xx, rate-limit) → discarded, reason
  `unreachable: <kind>` → shows as ⊘ in the claims list, counted in skipped

## Key design decisions

1. **One module, three functions** in `src/citations.js`:
   - `extractCitations(text)` — URL + DOI regexes, spans via `indexOf` on the original
     text (offsets correct by construction), trailing-punctuation strip, dedupe by
     exact text, DOIs skipped when contained in a URL match, id `c{n}` in document
     order.
   - `checkCitation(c, deps)` — HEAD with GET fallback (405/501/403/400 → GET with
     body cancelled immediately; we only need the status), `AbortSignal.timeout(5000)`,
     classification above, archive.org query on dead.
   - `runCitations(text, deps)` — concurrency-capped pool (5 in flight) over all
     citations; returns finding-shaped results.
2. **Everything injectable** — `deps.fetch` flows through pipeline deps; `node:test`
   unit tests never touch the network (Response/TypeError built by the test).
3. **Pipeline wiring** — step 6 after cross-checks, always runs (like cross-checks,
   deterministic even when extraction failed). Counts feed the existing
   `summary.checked/passed/failed` + new `summary.citationsChecked/citationsDead`.
   No config flag: citations only fire when the text contains them, so mock-mode
   texts without URLs stay offline.
4. **Finding shape** — `{ id, type: "citation", label: "citation", claim: <url>,
   spans: [{ text, start, end }], status, severity, note }`. `claim` rides along so
   the existing claims-list + copy machinery works unchanged; `note` is the new
   detail line ("HTTP 404 · Wayback snapshot: …", "HTTP 403 (paywall)", "HTTP 200").
5. **UI delta is small** — citation-type verdict words ("✗ Dead link", "✓ Link
   resolves", "◐ Paywall", "⊘ Not checked"), an ochre mark color (new in
   claims.ts), `note` rendered in the card's mono box, `break-all` for long URLs,
   chips "N links checked · M dead", and the copied report header gains the same
   counts with citation rows listed as errors.
6. **Verdict words must match the card semantics** — the generic "Doesn't add up"
   is wrong for a 404; verdict text is selected by `type === "citation"` everywhere
   it appears (badge, tooltip, copied report).

## Phase 0: Baseline

- `npm test` (root) 70/70, `cd web && npx vitest run` 13/13, `npm run build` clean.
- Servers are stopped; restart only for the final smoke.

## Phase 1: `extractCitations` (TDD, red → green)

- `test/citations.test.js` (red): URLs and DOIs found with exact offsets
  (`text.slice(start,end) === match`); trailing `.,;:!)` stripped; `doi:10.1000/x`
  and bare `10.1000/x`; DOI inside a URL not double-counted; duplicate URLs kept
  once; ids `c1..cn` in document order; no false hits (plain words, emails).
- `src/citations.js`: implement `extractCitations`.

**Verify:** `node --test test/citations.test.js` green.

## Phase 2: `checkCitation` classification (TDD, injected fetch)

- Tests (red): 200 → resolves/passed with "HTTP 200" note; 404/410 → failed/red;
  fetch rejection with `cause.code === "ENOTFOUND"` → failed/red; 403 (after HEAD
  fallback) → passed/ochre paywall note; timeout (signal abort) → discarded
  `unreachable: timeout`; ECONNREFUSED → discarded; 5xx → discarded; HEAD 405 then
  GET 200 → resolves (assert both calls + GET body cancelled); dead link →
  archive.org called once with the URL; snapshot available → note contains
  `Wayback snapshot:` + url; no snapshot → "no archive snapshot"; archive fetch
  failure → note still says HTTP 404.
- `src/citations.js`: `checkCitation` + `classifyFetchError` (walk `cause` chain),
  archive query `https://archive.org/wayback/available?url=…`, UA header on all
  fetches.

**Verify:** citations tests green.

## Phase 3: `runCitations` + pipeline wiring (TDD)

- Tests (red): concurrency capped at 5 (track in-flight max via injected fetch);
  findings appended with `type: "citation"`; summary gains `citationsChecked`/
  `citationsDead`; existing pipeline tests still pass untouched (their texts have
  no URLs → no network).
- `src/citations.js`: `runCitations` pool.
- `src/pipeline.js`: after cross-checks → `await runCitations(text, deps)`; merge
  findings; increment checked/passed/failed/discarded; set summary citation counts;
  add `citations` log field in `src/index.js` request logger.
- `test/pipeline.test.js`: new cases with injected `deps.fetch` (a dead + a live
  URL in one text) asserting findings, counts, and that discarded totals include
  unreachable.

**Verify:** `npm test` full suite green.

## Phase 4: Web libs — types, marks, report (TDD)

- `web/lib/claims.ts`: `Finding.note?: string`, severity union + `"ochre"`,
  `CheckResponse.summary.citationsChecked/citationsDead`; `computeMarks` maps
  severity → color and uses citation verdict words in tooltips.
- `web/lib/report.ts`: header appends `· X links · Y dead` when present; citation
  rows use "Dead link" verdict and print `note` instead of `Math:`.
- Tests: claims.test.ts (ochre color, citation tooltips, note passthrough),
  report.test.ts (citation row + header counts, absence when engine is old).

**Verify:** `cd web && npx vitest run` green.

## Phase 5: UI — checker.tsx

- `VerdictBadge`: citation branch — ✗ Dead link / ✓ Link resolves / ◐ Paywall /
  ⊘ Not checked.
- `FindingCard`: `note` in the mono box (in place of arithmetic when present);
  `break-all` on claim line for citation findings.
- `AnnotatedText`: ochre mark class (`bg-ochre/10`-style soft amber).
- Summary chips: "N links checked" (+ "M dead" in red) when `citationsChecked`
  present.
- `globals.css`: soft-ochre highlight color token if not present.

**Verify:** `npm run build` + `npx vitest run` green.

## Phase 6: E2E verification + docs ✅

- Engine 91/91 (Node 20), web 16/16 + build clean (Node 20 — remember `nvm use`).
- Live smoke via `GEMINI_MOCK=1 npm run dev:all` against the real network:
  - `https://example.com/definitely-not-a-real-page-987654` → failed/red, `HTTP 404 · no archive snapshot`
  - `https://httpbin.org/status/403` → passed/ochre, `HTTP 403 (paywall)`
  - `https://httpbin.org/status/200` → passed/green, `HTTP 200`
  - summary `{ citationsChecked: 3, citationsDead: 1 }`
- Copied report (vite-node against the live response) includes header counts and the
  dead-link row. Web boots clean; servers stopped after the smoke.
- README: citation pass described in the pipeline list + response example + verdict
  semantics. httpstat.us turned out blocked on this network — correctly classified
  as unreachable, never flagged dead.

- `npm test` + `cd web && npx vitest run && npm run build` all green.
- Manual smoke (mock): `GEMINI_MOCK=1 npm run dev:all`; paste a report containing
  a live URL (https://example.com) and a dead one (https://httpstat.us/404) →
  arithmetic finding + citation rows; dead URL red in text + claims list with
  archive note; chips show links/dead counts; Copy findings includes the dead link
  row and counts.
- README: feature paragraph + response example with a citation finding and new
  summary fields.

## Out of scope

- Recrawl/refresh, citation *content* verification (stage-2 full)
- "Copy as Markdown", amber for anything beyond paywall
- Config flags for the citation pass (always on; only fires when URLs exist)
