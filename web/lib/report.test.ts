import { describe, expect, it } from "vitest";
import { buildPlainReport } from "./report";
import type { CheckResponse } from "./claims";

const span = (text: string, start: number, end = start + text.length) => ({
  text,
  start,
  end,
});

const baseSummary = {
  checked: 3,
  passed: 2,
  failed: 1,
  discarded: { total: 2, "span-not-found": 2 },
  validitySkipped: false,
};

describe("buildPlainReport", () => {
  it("renders the header and one numbered row per failed finding", () => {
    const r: CheckResponse = {
      ok: true,
      summary: baseSummary,
      findings: [
        {
          id: "r1",
          type: "sum",
          label: "departmental expenditure breakdown",
          status: "failed",
          severity: "red",
          claim: "$150,000 … $85,000 … $45,000 … $25,000",
          arithmetic: "$85,000 + $45,000 + $25,000 = 155,000 vs stated total 150,000 (off by 5,000)",
          spans: [span("$150,000", 10)],
        },
        { id: "r2", status: "passed", severity: "green", spans: [span("$2", 20)] },
        { id: "r3", status: "discarded", reason: "span-not-found" },
      ],
    };
    expect(buildPlainReport(r)).toBe(
      [
        "Second Reader findings — 3 checked · 1 failed · 2 skipped",
        "",
        "1) Doesn't add up — departmental expenditure breakdown (sum)",
        '    "$150,000 … $85,000 … $45,000 … $25,000"',
        "    Math: $85,000 + $45,000 + $25,000 = 155,000 vs stated total 150,000 (off by 5,000)",
      ].join("\n")
    );
  });

  it("orders failures in document order, not findings order", () => {
    const r: CheckResponse = {
      ok: true,
      summary: { ...baseSummary, failed: 2, checked: 4 },
      findings: [
        { id: "f1", status: "failed", claim: "first in doc", spans: [span("$9", 90)] },
        { id: "f2", status: "failed", claim: "second in doc", spans: [span("$5", 50)] },
      ],
    };
    const lines = buildPlainReport(r).split("\n");
    // layout: header, blank, then per row: title line + quoted claim line
    expect(lines[3]).toContain("second in doc"); // span start 50 → first row
    expect(lines[6]).toContain("first in doc"); // span start 90 → second row
  });

  it("falls back to span join, label, and omits missing math", () => {
    const r: CheckResponse = {
      ok: true,
      summary: { ...baseSummary, failed: 2, checked: 4 },
      findings: [
        {
          id: "f1",
          type: "sum",
          label: "parts",
          status: "failed",
          // no engine claim → joined from spans in document order
          spans: [span("$85,000", 200), span("$150,000", 100)],
        },
        { id: "f2", status: "failed" }, // no spans, no label, no arithmetic
      ],
    };
    const report = buildPlainReport(r);
    expect(report).toContain('"$150,000 … $85,000"');
    expect(report).toContain("1) Doesn't add up — parts (sum)");
    expect(report).toContain("2) Doesn't add up — claim");
    expect(report).not.toContain("Math:");
  });

  it("never lists skipped findings as rows, but keeps their count in the header", () => {
    const r: CheckResponse = {
      ok: true,
      summary: { ...baseSummary, failed: 0, checked: 2 },
      findings: [
        { id: "d1", status: "discarded", reason: "not-stated" },
        { id: "d2", status: "discarded", reason: "span-not-found" },
        { id: "p1", status: "passed", spans: [span("$2", 10)] },
      ],
    };
    const report = buildPlainReport(r);
    expect(report).toBe(
      ["Second Reader findings — 2 checked · 0 failed · 2 skipped", "", "No errors found."].join("\n")
    );
  });

  it("distinguishes an empty result from an all-clear", () => {
    const empty: CheckResponse = {
      ok: true,
      summary: { ...baseSummary, checked: 0, failed: 0, discarded: { total: 0 } },
      findings: [],
    };
    expect(buildPlainReport(empty)).toContain("No numeric claims were found in this text.");
    const clean: CheckResponse = {
      ok: true,
      summary: { ...baseSummary, failed: 0, discarded: { total: 0 } },
      findings: [{ id: "p1", status: "passed", spans: [span("$2", 10)] }],
    };
    expect(buildPlainReport(clean)).toContain("No errors found.");
  });

  it("lists dead citations as rows and adds link counts to the header", () => {
    const r: CheckResponse = {
      ok: true,
      summary: {
        ...baseSummary,
        failed: 1,
        checked: 3,
        discarded: { total: 0 },
        citationsChecked: 2,
        citationsDead: 1,
      },
      findings: [
        {
          id: "c1",
          type: "citation",
          label: "citation",
          status: "failed",
          severity: "red",
          claim: "https://dead.example.com/x",
          note: "HTTP 404 · Wayback snapshot: https://web.archive.org/web/20240101000000/https://dead.example.com/x (2024-01-01)",
          spans: [span("https://dead.example.com/x", 10)],
        },
        {
          id: "c2",
          type: "citation",
          label: "citation",
          status: "passed",
          severity: "green",
          claim: "https://live.example.com",
          note: "HTTP 200",
          spans: [span("https://live.example.com", 50)],
        },
      ],
    };
    const report = buildPlainReport(r);
    expect(report.split("\n")[0]).toBe(
      "Second Reader findings — 3 checked · 1 failed · 0 skipped · 2 links · 1 dead"
    );
    expect(report).toContain('1) Dead link — citation');
    expect(report).toContain('"https://dead.example.com/x"');
    expect(report).toContain("HTTP 404 · Wayback snapshot:");
    expect(report).not.toContain("Math:");
    expect(report).not.toContain("c2"); // passed links are not errors
  });

  it("omits link counts when the engine response predates citations", () => {
    const r: CheckResponse = {
      ok: true,
      summary: { ...baseSummary, failed: 0, discarded: { total: 0 } },
      findings: [{ id: "p1", status: "passed", spans: [span("$2", 10)] }],
    };
    expect(buildPlainReport(r).split("\n")[0]).toBe(
      "Second Reader findings — 3 checked · 0 failed · 0 skipped"
    );
  });
});
