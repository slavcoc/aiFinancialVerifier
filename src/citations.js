// Dead-citation check. Deterministic — regex extraction + HTTP status classification,
// no LLM anywhere. Offsets come from indexOf on the ORIGINAL text (same pattern as
// crosschecks.js), so the UI can highlight exactly what was checked.
//
// Verdicts:
//   resolves    (2xx/3xx)          → passed / green
//   dead        (404/410/DNS)      → failed / red (+ archive.org snapshot when found)
//   paywall     (401/403)          → passed / ochre ("link exists, content gated")
//   unreachable (timeout/refused/5xx/429) → discarded, reason "unreachable: <kind>"

export const CITATION_TIMEOUT_MS = 5000;
export const CITATION_CONCURRENCY = 5;
const USER_AGENT = "SecondReader/0.1 (citation checker)";

// Invisible separators (zero-width space etc.) sometimes replace real line breaks
// in pasted text. They are NOT whitespace to JS regexes, so without this guard a
// URL match would swallow the following text.
const URL_RE = /https?:\/\/[^\s<>"'`\u200B\u00AD\uFEFF\u2060\u180E]+/gi;
const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:\w]+/g;
const TRAILING_PUNCT = /[.,;:!?)\]}"'…\u200B\u00AD\uFEFF\u2060]+$/;

function stripTrailing(s) {
  const t = s.replace(TRAILING_PUNCT, "");
  return t.length > 0 ? t : s;
}

// Every URL/DOI in the text, deduped, with spans into the original text.
export function extractCitations(text) {
  const doc = String(text ?? "");
  const found = [];
  for (const m of doc.matchAll(URL_RE)) {
    const clean = stripTrailing(m[0]);
    const start = doc.indexOf(clean);
    if (start === -1) continue;
    found.push({ text: clean, start, end: start + clean.length, kind: "url" });
  }
  const urlRanges = found.map((c) => [c.start, c.end]);
  for (const m of doc.matchAll(DOI_RE)) {
    const clean = stripTrailing(m[0]);
    const start = doc.indexOf(clean);
    if (start === -1) continue;
    // a DOI inside a URL (e.g. https://doi.org/10.1000/x) is already a URL citation
    if (urlRanges.some(([a, b]) => start >= a && start + clean.length <= b)) continue;
    found.push({ text: clean, start, end: start + clean.length, kind: "doi" });
  }
  const seen = new Set();
  const unique = found.filter((c) =>
    seen.has(c.text) ? false : (seen.add(c.text), true)
  );
  unique.sort((a, b) => a.start - b.start || a.end - b.end);
  return unique.map((c, i) => ({ id: `c${i + 1}`, ...c }));
}

// Walk the cause chain of a fetch rejection and name the failure.
export function classifyFetchError(e) {
  const codes = [];
  let c = e?.cause;
  while (c) {
    if (typeof c.code === "string") codes.push(c.code);
    c = c.cause;
  }
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || codes.includes("ABORT_ERR")) {
    return "timeout";
  }
  if (codes.includes("ENOTFOUND")) return "dns";
  return codes[0] ?? "network";
}

function classifyStatus(status) {
  if (status >= 200 && status < 400) return "resolves";
  if (status === 404 || status === 410) return "dead";
  if (status === 401 || status === 403) return "paywall";
  return "unreachable"; // 429, 5xx, anything else
}

// HEAD first (cheap); fall back to GET when the server can't answer HEAD, then
// cancel the body — we only need the status, never the content.
async function fetchStatus(fetchFn, url) {
  const opts = (method) => ({
    method,
    redirect: "follow",
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(CITATION_TIMEOUT_MS),
  });
  let res = await fetchFn(url, opts("HEAD"));
  if ([405, 501, 403, 400].includes(res.status)) {
    try { await res.body?.cancel?.(); } catch { /* no body to cancel */ }
    res = await fetchFn(url, opts("GET"));
    try { await res.body?.cancel?.(); } catch { /* no body to cancel */ }
  }
  return res.status;
}

// One availability query for dead links. Never throws — the snapshot is a bonus.
async function archiveSnapshot(fetchFn, url) {
  try {
    const res = await fetchFn(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(CITATION_TIMEOUT_MS),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const closest = data?.archived_snapshots?.closest;
    if (!closest?.available || !closest.url) return null;
    const ts = String(closest.timestamp ?? "");
    const date = /^\d{8}/.test(ts)
      ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`
      : null;
    return { url: closest.url, date: date ?? "date unknown" };
  } catch {
    return null;
  }
}

export async function checkCitation(c, deps = {}) {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const base = {
    id: c.id,
    type: "citation",
    label: "citation",
    claim: c.text,
    spans: [{ text: c.text, start: c.start, end: c.end }],
  };
  const target = c.kind === "doi" ? `https://doi.org/${c.text}` : c.text;

  let status;
  try {
    status = await fetchStatus(fetchFn, target);
  } catch (e) {
    const kind = classifyFetchError(e);
    if (kind === "dns") {
      return { ...base, status: "failed", severity: "red", note: "DNS lookup failed (domain gone)" };
    }
    return { ...base, status: "discarded", severity: null, reason: `unreachable: ${kind}` };
  }

  const cls = classifyStatus(status);
  if (cls === "resolves") {
    return { ...base, status: "passed", severity: "green", note: `HTTP ${status}` };
  }
  if (cls === "paywall") {
    return { ...base, status: "passed", severity: "ochre", note: `HTTP ${status} (paywall)` };
  }
  if (cls === "dead") {
    const snapshot = await archiveSnapshot(fetchFn, target);
    const note = snapshot
      ? `HTTP ${status} · Wayback snapshot: ${snapshot.url} (${snapshot.date})`
      : `HTTP ${status} · no archive snapshot`;
    return { ...base, status: "failed", severity: "red", note };
  }
  return { ...base, status: "discarded", severity: null, reason: `unreachable: http-${status}` };
}

// Concurrency-capped pool over all citations; resolves with finding-shaped results
// in citation order.
export async function runCitations(text, deps = {}) {
  const citations = extractCitations(text);
  if (citations.length === 0) return [];
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const results = new Array(citations.length);
  let next = 0;
  const worker = async () => {
    while (next < citations.length) {
      const i = next++;
      results[i] = await checkCitation(citations[i], { fetch: fetchFn });
    }
  };
  const n = Math.min(CITATION_CONCURRENCY, citations.length);
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
