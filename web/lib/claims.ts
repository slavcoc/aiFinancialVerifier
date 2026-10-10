// Pure helpers for claim-level presentation. No React, no DOM — unit-testable.

export type Span = { text: string; kind?: string; start: number; end: number };

export type Finding = {
  id: string | null;
  type?: string | null;
  label?: string | null;
  status: "passed" | "failed" | "discarded";
  severity?: "red" | "green" | "ochre" | null;
  arithmetic?: string;
  note?: string;
  reason?: string;
  actual?: number;
  stated?: number;
  diffPct?: number;
  diffPp?: number;
  spans?: Span[];
  claim?: string;
};

export type CheckResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    checked: number;
    passed: number;
    failed: number;
    discarded: Record<string, number>;
    validitySkipped: boolean;
    citationsChecked?: number;
    citationsDead?: number;
  };
  findings?: Finding[];
  meta?: {
    model: string;
    mock: boolean;
    version?: string;
    warnings: string[];
    totalMs: number;
  };
};

// The claim as a reviewer reads it. Prefer the engine's reconstructed claim;
// fall back to joining span texts in document order (older engines omit it).
export function claimText(f: Finding): string | null {
  if (f.claim) return f.claim;
  const positioned = (f.spans ?? [])
    .filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (positioned.length === 0) return null;
  return positioned.map((s) => s.text).join(" … ");
}

export type Mark = {
  start: number;
  end: number;
  color: "red" | "green" | "ochre";
  tooltip: string;
  findingIndex: number;
};

export type Marks = {
  marks: Mark[];
  /** Finding indices that have at least one rendered highlight. */
  rendered: Set<number>;
};

// Compute highlight marks for the annotated report. Sort; first (longest) wins on
// overlaps — keep highlighting simple and stable. `rendered` tells the claims list
// which findings have a clickable link back to the report.
export function computeMarks(findings: Finding[]): Marks {
  const marks: Mark[] = [];
  findings.forEach((f, findingIndex) => {
    if (f.status === "discarded" || !f.spans) return;
    const color = f.severity === "red" ? "red" : f.severity === "ochre" ? "ochre" : "green";
    const verdict = f.type === "citation"
      ? color === "red"
        ? "Dead link"
        : color === "ochre"
          ? "Paywall"
          : "Link resolves"
      : color === "red"
        ? "Doesn't add up"
        : "Checks out";
    for (const s of f.spans) {
      marks.push({
        start: s.start,
        end: s.end,
        color,
        tooltip: `${verdict} · ${f.label ?? f.type}${f.arithmetic ?? f.note ? `\n${f.arithmetic ?? f.note}` : ""}`,
        findingIndex,
      });
    }
  });
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Mark[] = [];
  const rendered = new Set<number>();
  for (const m of marks) {
    const last = kept[kept.length - 1];
    if (last && m.start < last.end) continue;
    kept.push(m);
    rendered.add(m.findingIndex);
  }
  return { marks: kept, rendered };
}

// Reviewer-first order: failures, then passes, then skips — document order within
// each group. Discarded findings have no spans, so they keep their original order.
export function orderFindings(findings: Finding[]): { f: Finding; index: number }[] {
  const firstSpan = (f: Finding) =>
    Math.min(...(f.spans ?? []).map((s) => Number.isFinite(s.start) ? s.start : Infinity));
  const rank = (f: Finding) => (f.status === "failed" ? 0 : f.status === "passed" ? 1 : 2);
  return findings
    .map((f, index) => ({ f, index }))
    .sort((a, b) => {
      const d = rank(a.f) - rank(b.f);
      if (d !== 0) return d;
      const da = firstSpan(a.f) - firstSpan(b.f);
      if (Number.isFinite(da)) return da;
      return a.index - b.index;
    });
}
