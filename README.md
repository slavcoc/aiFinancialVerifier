# The Second Reader — API (Spike-2)

Extraction→arithmetic verification loop for AI-generated business reports.

**One LLM agent (Gemini Flash) extracts numeric relations as verbatim text spans;
deterministic code does everything else.** The LLM never parses values and never issues
verdicts — it only supplies structure. Verdicts come from pure arithmetic, so the LLM can
cost recall but can never create a false flag.

## Quickstart

```bash
npm install
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # :8787
```

No API key? `GEMINI_MOCK=1 npm run dev` runs the pipeline with a canned extraction
(the motivating example from `ai-extraction-spec.md`).

```bash
curl -s -X POST localhost:8787/check -H 'Content-Type: application/json' -d '{
  "text": "Total combined expenditure across all three core sectors reached exactly $150,000.\n\nA granular look at the departmental breakdown shows:\n- Personnel and Salaries: $85,000\n- Infrastructure and Software Licensing: $45,000\n- Travel and Client Entertainment Expenses: $25,000"
}'
```

Expected (mock mode): one `failed` / `red` finding — parts sum to $155,000, the text
claims $150,000.

## Endpoints

- `GET /health` — model, mock, validity flags
- `POST /check { "text": "..." }` — full pipeline, returns:

```json
{
  "ok": true,
  "summary": { "checked": 1, "passed": 0, "failed": 1, "discarded": { ... }, "validitySkipped": false },
  "findings": [
    {
      "id": "r1", "type": "sum", "label": "departmental expenditure breakdown",
      "status": "failed", "severity": "red",
      "arithmetic": "$85,000 + $45,000 + $25,000 = 155,000 vs stated total 150,000 (off by 5,000)"
    }
  ],
  "meta": { "model": "gemini-3.8-flash", "mock": false, "warnings": [], "totalMs": 1234 }
}
```

## Pipeline (precision-first order)

1. **Extract** (LLM via `MODEL`) → relations JSON, 9 types: `sum`, `difference`,
   `percent-of`, `percent-change`, `year-elapsed`, `duplicate-value`, `product`,
   `comparison`, `ratio`. One retry on invalid JSON/schema or provider errors.
2. **Ground** — every span must exist verbatim in the document (whitespace-normalized).
   Missing span ⇒ relation discarded (`span-not-found`), never flagged.
3. **Validity** (LLM via `MODEL`, optional) — "does the document explicitly state this
   relation?" Guards against the extractor inventing relations. Unstated ⇒ discarded
   (`not-stated`). If the call fails, all relations are discarded
   (`validity-unavailable`): fail closed, precision first.
4. **Verify** — deterministic parser (currency, commas, M/B suffixes, European decimals,
   accounting parens) + arithmetic with tolerances: ±1% relative, ±0.5 percentage
   points, exact for year arithmetic. Failed parse ⇒ discarded (`unparseable-span`).

Discards are counted in `summary.discarded` and appear in `findings` with
`status: "discarded"` — they are never verdicts.

## Env vars

| var | default | meaning |
|---|---|---|
| `MODEL` | `gemini-3.8-flash` | extractor + validity model; "claude" in the name → Anthropic provider, else Gemini |
| `GEMINI_API_KEY` | — | Gemini provider key (needed when `MODEL` is a Gemini model) |
| `ANTHROPIC_API_KEY` | — | Anthropic provider key (needed when `MODEL` is a Claude model) |
| `VALIDITY_PASS` | `on` | `off` skips the validity pass (cheaper, riskier) |
| `GEMINI_MOCK` | `0` | `1` = canned extraction, no API key |
| `PORT` | `8787` | |
| `MAX_INPUT_CHARS` | `100000` | 413 above this |

## Tests

```bash
npm test   # node:test — parser, verifier, grounding unit tests + mock pipeline integration
```

## Known limits (v0)

- **No source retrieval** — verifies internal arithmetic only. External claims come later.
- Every passed/failed finding includes `spans` with `start`/`end` character offsets in
  the original text (whitespace-tolerant), so the UI can highlight exactly what was
  checked.
- Numeric spans with only-dot separators are parsed US-style (`1.500` → `1.5`).
- Mixed-number prose ("between A and B", "3:1 ratios") is not a relation type yet.
- Mock mode returns the canned example for any text containing `$150,000` + `$85,000`.

## Where this fits

Spike-2 is the v0 wedge of the full pipeline in
`../problems/verifier-tool/verifier-plan.md` (Rev 2). Next: wire the existing static UI
(`verifier-tool/index.html`) to this API, deploy with a company-email waitlist, and run
the 2-week validation experiment.

## Web app (in `web/`)

Next.js app — light editorial landing page, email/password + Google auth (Better Auth,
SQLite), and the checker workspace behind login:

```bash
cd web && npm install
cp .env.local.example .env.local   # set BETTER_AUTH_SECRET, optional Google creds
npx @better-auth/cli migrate --config ./lib/auth.ts --y   # first run only
npm run dev                        # :3000 (API must run on :8787)
```

- `/` — landing (hero, example catch, features, how-it-works)
- `/signup`, `/login` — Better Auth email/password; Google button appears when
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` + `NEXT_PUBLIC_GOOGLE_ENABLED=1` are set
- `/check` — protected workspace (middleware + server session check); the textarea calls
  the server-side `/api/check` proxy, which forwards to this Express API — the engine URL
  never reaches the browser.
