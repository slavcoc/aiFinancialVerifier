import { describe, expect, it } from "vitest";
import { claimText, computeMarks, orderFindings, type Finding } from "./claims";

const span = (text: string, start: number, end = start + text.length) => ({
  text,
  start,
  end,
});

describe("claimText", () => {
  it("prefers the engine claim", () => {
    const f: Finding = {
      id: "r1",
      status: "failed",
      claim: "$150,000 … $85,000 … $45,000 … $25,000",
      spans: [span("$85,000", 100), span("$150,000", 10)],
    };
    expect(claimText(f)).toBe("$150,000 … $85,000 … $45,000 … $25,000");
  });

  it("falls back to spans joined in document order", () => {
    const f: Finding = {
      id: "r1",
      status: "failed",
      // relation order (parts first, total last) differs from document order
      spans: [span("$85,000", 200), span("$25,000", 400), span("$150,000", 100), span("$45,000", 300)],
    };
    expect(claimText(f)).toBe("$150,000 … $85,000 … $45,000 … $25,000");
  });

  it("returns null when there is nothing to join", () => {
    expect(claimText({ id: null, status: "discarded", spans: [] })).toBeNull();
    expect(claimText({ id: null, status: "discarded" })).toBeNull();
  });
});

describe("computeMarks", () => {
  const findings: Finding[] = [
    {
      id: "r1",
      type: "sum",
      label: "expenditure",
      status: "failed",
      severity: "red",
      arithmetic: "$85,000 + $45,000 + $25,000 = 155,000",
      spans: [span("$85,000", 200), span("$150,000", 100)],
    },
    {
      id: "r2",
      type: "sum",
      label: "headcount",
      status: "passed",
      severity: "green",
      spans: [span("10", 105)], // overlaps r1's "$150,000" mark (100-107) → dropped
    },
    { id: "r3", status: "discarded", reason: "span-not-found" },
  ];

  it("keeps first/longest mark on overlap and reports rendered findings", () => {
    const { marks, rendered } = computeMarks(findings);
    expect(marks.map((m) => m.findingIndex)).toEqual([0, 0]);
    expect(rendered.has(0)).toBe(true);
    expect(rendered.has(1)).toBe(false); // dropped by overlap
    expect(rendered.has(2)).toBe(false); // discarded
  });

  it("colors by severity and embeds the math in the tooltip", () => {
    const { marks } = computeMarks(findings);
    const red = marks.find((m) => m.findingIndex === 0)!;
    expect(red.color).toBe("red");
    expect(red.tooltip).toContain("Doesn't add up");
    expect(red.tooltip).toContain("$85,000 + $45,000 + $25,000 = 155,000");
  });

  it("uses citation verdict words and ochre for paywalls", () => {
    const citations: Finding[] = [
      {
        id: "c1",
        type: "citation",
        label: "citation",
        status: "failed",
        severity: "red",
        note: "HTTP 404 · no archive snapshot",
        spans: [{ text: "https://dead.example.com", start: 10, end: 36 }],
      },
      {
        id: "c2",
        type: "citation",
        label: "citation",
        status: "passed",
        severity: "ochre",
        note: "HTTP 403 (paywall)",
        spans: [{ text: "https://pay.example.com", start: 50, end: 76 }],
      },
      {
        id: "c3",
        type: "citation",
        label: "citation",
        status: "passed",
        severity: "green",
        note: "HTTP 200",
        spans: [{ text: "https://live.example.com", start: 90, end: 116 }],
      },
    ];
    const { marks } = computeMarks(citations);
    expect(marks[0].color).toBe("red");
    expect(marks[0].tooltip).toContain("Dead link");
    expect(marks[0].tooltip).toContain("HTTP 404");
    expect(marks[1].color).toBe("ochre");
    expect(marks[1].tooltip).toContain("Paywall");
    expect(marks[2].color).toBe("green");
    expect(marks[2].tooltip).toContain("Link resolves");
  });

  it("is stable in document order", () => {
    const { marks } = computeMarks(findings);
    const starts = marks.map((m) => m.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("orderFindings", () => {
  const findings: Finding[] = [
    { id: "p1", status: "passed", spans: [span("$2", 40)] },
    { id: "d1", status: "discarded", reason: "not-stated" },
    { id: "f1", status: "failed", spans: [span("$9", 90)] },
    { id: "p2", status: "passed", spans: [span("$1", 10)] },
    { id: "f2", status: "failed", spans: [span("$5", 50)] },
  ];

  it("orders failed → passed → discarded, document order within groups", () => {
    const ids = orderFindings(findings).map(({ f }) => f.id);
    expect(ids).toEqual(["f2", "f1", "p2", "p1", "d1"]);
  });

  it("keeps original index available for highlight linking", () => {
    const rows = orderFindings(findings);
    expect(rows.map((r) => r.index)).toEqual([4, 2, 3, 0, 1]);
  });
});
