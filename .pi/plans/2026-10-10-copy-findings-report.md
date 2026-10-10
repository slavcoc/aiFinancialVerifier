---
title: "Copy/shareable findings report"
status: draft
created: "2026-10-10T16:56:01.507Z"
updated: "2026-10-10T17:06:05.300Z"
type: feature
---

# Copy/shareable findings report

## Goal

A **"Copy findings"** button that builds a plain-text report from the check result and
puts it on the clipboard: header (N checked · M failed · K skipped), then each error as
claim text + math line, formatted to survive email/Slack (plain text, monospace-friendly).
No team workspace in the MVP, so the report travels by clipboard — this is the smallest
stand-in for the team layer. The skipped count must stay in the header (the tool is
honest about what it can't check).

## Key design decisions

1. **Pure function in `web/lib/report.ts`, not `checker.tsx`** — the spec suggests
   `buildPlainReport` in checker.tsx, but the codebase pattern (claims.ts, vitest) is
   pure helpers in `web/lib` + thin wiring in components. Same here: the report builder
   is fully unit-testable, the button is the only part in checker.tsx.
2. **Signature** — `buildPlainReport(result: CheckResponse): string`. The spec's
   `text` param is unused: claim strings already ride on findings (engine `claim` or
   the `claimText` span fallback).
3. **Report shape** — spec-literal:
   ```
   Second Reader findings — 3 checked · 1 failed · 2 skipped

   1) Doesn't add up — departmental expenditure breakdown (sum)
      "$150,000 … $85,000 … $45,000 … $25,000"
      Math: $85,000 + $45,000 + $25,000 = 155,000 vs stated total 150,000 (off by 5,000)
   ```
   - header always; errors numbered, in document order (reuse `orderFindings`,
     filter to failed)
   - claim quoted on its own line (fallback: label/type when no spans)
   - math prefixed `Math:` so Slack/email clients keep it readable
   - zero failures → "No errors found." under the header; zero findings at all →
     "No numeric claims were found in this text." (never a misleading all-clear)
4. **Clipboard robustness** — `navigator.clipboard.writeText` with a
   `document.execCommand("copy")` textarea fallback (older Safari / permission
   issues). Button shows "Copied ✓" for 2s (timeout ref cleaned up on unmount).
5. **No engine changes.** Report is built from existing summary + findings.

## Phase 0: Baseline

- Engine `npm test` and web `cd web && npx vitest run && npm run build` green.
- Servers currently stopped (user asked); restart only for the final smoke.

## Phase 1: `web/lib/report.ts` — report builder (TDD)

- `web/lib/report.test.ts` (red):
  - header format from summary (`checked`, `failed`, `discarded.total`)
  - one numbered row per failed finding: verdict words, label/type, quoted claim,
    `Math:` line
  - failures ordered in document order (by first span start), not findings order
  - claim fallback: no engine `claim` → spans joined in document order; no spans →
    label/type; no arithmetic → no `Math:` line
  - skipped findings appear only in the header count, never as rows
  - zero failed → "No errors found."; zero findings → "No numeric claims were found…"
- `web/lib/report.ts`: implement `buildPlainReport(result)` reusing `claimText` and
  `orderFindings` from `@/lib/claims`.

**Verify:** `cd web && npx vitest run` green.

## Phase 2: Copy button in `web/components/checker.tsx`

- Results section gets a header row: `<h2>Findings report</h2>` + **Copy findings**
  button (outline pill matching the app's button style), right-aligned.
- `copyFindings()`: build the report, `navigator.clipboard.writeText`, fallback
  textarea+`execCommand("copy")` on failure; on success set `copied` → "Copied ✓",
  revert after 2s. Timeout id in a ref, cleared on unmount; `copied` reset when a new
  check starts.
- Button rendered only when a result exists (it's inside the results section anyway).

**Verify:** `npm run build` + `npx vitest run` green.

## Phase 3: End-to-end verification ✅

- `cd web && npx vitest run && npm run build` — 13/13 green, build clean.
- Engine suite still 70/70.
- E2E payload check against the live mock engine via vite-node — the exact string
  the button copies:

  ```
  Second Reader findings — 1 checked · 1 failed · 0 skipped

  1) Doesn't add up — departmental expenditure breakdown (sum)
      "$150,000 … $85,000 … $45,000 … $25,000"
      Math: 85,000 + 45,000 + 25,000 = 155,000 vs stated total 150,000 (off by 5,000)
  ```

- Web dev server boots clean (login 200); servers stopped again after the smoke.
- Remaining manual check: click the button in-browser (clipboard API can't be
  exercised headlessly) — `GEMINI_MOCK=1 npm run dev` + `cd web && npm run dev`.

## Out of scope

- "Copy as Markdown" (post-MVP)
- Team/workspace layer, permalinks, saving reports server-side