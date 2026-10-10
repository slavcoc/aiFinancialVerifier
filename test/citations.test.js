import test from "node:test";
import assert from "node:assert/strict";
import { extractCitations, checkCitation, classifyFetchError, runCitations } from "../src/citations.js";

test("extractCitations finds URLs and DOIs with exact offsets", () => {
  const text =
    "See https://example.com/a?b=1 and also https://doi.org/10.1000/xyz123, " +
    "plus a bare 10.5555/abc-def and doi:10.9999/q.r.";
  const cs = extractCitations(text);
  assert.equal(cs.length, 4);
  for (const c of cs) {
    assert.equal(text.slice(c.start, c.end), c.text);
  }
  const texts = cs.map((c) => c.text);
  assert.ok(texts.includes("https://example.com/a?b=1"));
  assert.ok(texts.includes("https://doi.org/10.1000/xyz123")); // trailing comma stripped
  assert.ok(texts.includes("10.5555/abc-def"));
  assert.ok(texts.includes("10.9999/q.r")); // trailing period stripped
});

test("extractCitations does not double-count a DOI inside a URL", () => {
  const cs = extractCitations("Read https://doi.org/10.1000/xyz123 for details.");
  assert.equal(cs.length, 1);
  assert.equal(cs[0].text, "https://doi.org/10.1000/xyz123");
  assert.equal(cs[0].kind, "url");
});

test("extractCitations strips trailing punctuation inside prose", () => {
  const cs = extractCitations("Quoting \"https://example.com/x\", then continuing.");
  assert.equal(cs.length, 1);
  assert.equal(cs[0].text, "https://example.com/x");
});

test("extractCitations dedupes identical citations and numbers in document order", () => {
  const text = "First https://a.example.com/x. Again https://a.example.com/x. Then https://b.example.com/y";
  const cs = extractCitations(text);
  assert.equal(cs.length, 2);
  assert.deepEqual(cs.map((c) => c.id), ["c1", "c2"]);
  assert.equal(cs[0].text, "https://a.example.com/x");
  assert.equal(cs[1].text, "https://b.example.com/y");
  assert.ok(cs[0].start < cs[1].start);
});

test("extractCitations ignores non-citation text", () => {
  const cs = extractCitations("Contact user@example.com or visit www.example.com. Just words, no schemes.");
  assert.equal(cs.length, 0);
});

test("extractCitations stops at invisible separators instead of swallowing text", () => {
  // pasted text sometimes has zero-width spaces (U+200B) where line breaks were
  const text = "Portal: https://www.sec.gov/edgar/search/\u200BSEC EDGAR Company";
  const cs = extractCitations(text);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].text, "https://www.sec.gov/edgar/search/");
});

test("extractCitations handles empty and undefined input", () => {
  assert.deepEqual(extractCitations(""), []);
  assert.deepEqual(extractCitations(undefined), []);
});

// --- checkCitation: classification with injected fetch ---

const C = { id: "c1", text: "https://example.com/x", start: 0, end: 21, kind: "url" };
const fetchReturning = (status) => async (url, init) =>
  new Response(init?.method === "GET" ? "body" : "", { status });

function fetchError(name, code) {
  const e = new TypeError(`fetch failed (${code})`);
  e.name = name;
  e.cause = { code };
  return e;
}

test("checkCitation: 200 resolves as passed with HTTP note", async () => {
  const f = await checkCitation(C, { fetch: fetchReturning(200) });
  assert.equal(f.status, "passed");
  assert.equal(f.severity, "green");
  assert.equal(f.note, "HTTP 200");
  assert.equal(f.type, "citation");
  assert.deepEqual(f.spans, [{ text: C.text, start: 0, end: 21 }]);
});

test("checkCitation: 404/410 are dead, with one archive.org availability check", async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push(url);
    if (url.includes("archive.org")) {
      return Response.json({
        archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/20240101000000/https://example.com/x", timestamp: "20240101000000" } },
      });
    }
    return new Response("", { status: 404 });
  };
  const f = await checkCitation(C, { fetch: fetchFn });
  assert.equal(f.status, "failed");
  assert.equal(f.severity, "red");
  assert.equal(f.note, "HTTP 404 · Wayback snapshot: https://web.archive.org/web/20240101000000/https://example.com/x (2024-01-01)");
  assert.equal(calls.filter((u) => u.includes("archive.org")).length, 1);
});

test("checkCitation: 404 without snapshot says so", async () => {
  const fetchFn = async (url) =>
    url.includes("archive.org")
      ? Response.json({ archived_snapshots: {} })
      : new Response("", { status: 404 });
  const f = await checkCitation(C, { fetch: fetchFn });
  assert.equal(f.status, "failed");
  assert.match(f.note, /HTTP 404 · no archive snapshot/);
});

test("checkCitation: archive check failure still reports dead", async () => {
  const fetchFn = async (url) => {
    if (url.includes("archive.org")) throw fetchError("Error", "ECONNREFUSED");
    return new Response("", { status: 410 });
  };
  const f = await checkCitation(C, { fetch: fetchFn });
  assert.equal(f.status, "failed");
  assert.match(f.note, /HTTP 410 · no archive snapshot/);
});

test("checkCitation: DNS failure is dead, not unreachable", async () => {
  const f = await checkCitation(C, {
    fetch: async () => {
      throw fetchError("TypeError", "ENOTFOUND");
    },
  });
  assert.equal(f.status, "failed");
  assert.equal(f.severity, "red");
  assert.match(f.note, /DNS/);
});

test("checkCitation: timeout is discarded as unreachable", async () => {
  const f = await checkCitation(C, {
    fetch: async () => {
      throw fetchError("TimeoutError", "UND_ERR_CONNECT_TIMEOUT");
    },
  });
  assert.equal(f.status, "discarded");
  assert.equal(f.reason, "unreachable: timeout");
});

test("checkCitation: connection refused is discarded as unreachable", async () => {
  const f = await checkCitation(C, {
    fetch: async () => {
      throw fetchError("TypeError", "ECONNREFUSED");
    },
  });
  assert.equal(f.status, "discarded");
  assert.equal(f.reason, "unreachable: ECONNREFUSED");
});

test("checkCitation: HEAD 405 falls back to GET and cancels the body", async () => {
  const calls = [];
  let cancelled = false;
  // GET returns a Response whose body tracks cancel()
  const fetchStub = async (url, init) => {
    calls.push(init.method);
    if (init.method === "HEAD") return new Response("", { status: 405 });
    const res = new Response("huge", { status: 200 });
    res.body.cancel = () => {
      cancelled = true;
      return Promise.resolve();
    };
    return res;
  };
  const f = await checkCitation(C, { fetch: fetchStub });
  assert.deepEqual(calls, ["HEAD", "GET"]);
  assert.equal(f.status, "passed");
  assert.equal(cancelled, true);
});

test("checkCitation: 403 is a paywall (ochre), not dead", async () => {
  const f = await checkCitation(C, { fetch: fetchReturning(403) });
  assert.equal(f.status, "passed");
  assert.equal(f.severity, "ochre");
  assert.equal(f.note, "HTTP 403 (paywall)");
});

test("checkCitation: 5xx and 429 are discarded as unreachable", async () => {
  const f500 = await checkCitation(C, { fetch: fetchReturning(500) });
  assert.equal(f500.status, "discarded");
  assert.equal(f500.reason, "unreachable: http-500");
  const f429 = await checkCitation(C, { fetch: fetchReturning(429) });
  assert.equal(f429.reason, "unreachable: http-429");
});

test("checkCitation: DOIs are resolved through doi.org", async () => {
  let target;
  const doi = { id: "c2", text: "10.1000/xyz123", start: 0, end: 14, kind: "doi" };
  const f = await checkCitation(doi, {
    fetch: async (url) => {
      target = url;
      return new Response("", { status: 200 });
    },
  });
  assert.equal(target, "https://doi.org/10.1000/xyz123");
  assert.equal(f.status, "passed");
});

test("classifyFetchError walks the cause chain", () => {
  const nested = new Error("outer");
  nested.cause = { code: "ENOTFOUND", cause: null };
  assert.equal(classifyFetchError(nested), "dns");
  assert.equal(classifyFetchError({ name: "AbortError" }), "timeout");
  assert.equal(classifyFetchError({}), "network");
});

// --- runCitations: pool + pipeline integration ---

test("runCitations caps concurrency and returns findings in citation order", async () => {
  const text =
    "a https://one.example.com b https://two.example.com c https://three.example.com " +
    "d https://four.example.com e https://five.example.com f https://six.example.com " +
    "g https://seven.example.com h https://eight.example.com";
  let inflight = 0;
  let maxInflight = 0;
  let active = 0;
  const fetchFn = async (url, init) => {
    inflight++;
    active++;
    maxInflight = Math.max(maxInflight, active);
    await new Promise((r) => setTimeout(r, 15));
    active--;
    return new Response("", { status: 200 });
  };
  const results = await runCitations(text, { fetch: fetchFn });
  assert.equal(results.length, 8);
  assert.equal(maxInflight, 5); // CITATION_CONCURRENCY
  assert.deepEqual(results.map((f) => f.id), ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
  assert.equal(inflight, 8);
});

test("runCitations returns [] when the text has no citations", async () => {
  let called = false;
  const results = await runCitations("no links here", {
    fetch: async () => {
      called = true;
      return new Response("", { status: 200 });
    },
  });
  assert.deepEqual(results, []);
  assert.equal(called, false);
});
