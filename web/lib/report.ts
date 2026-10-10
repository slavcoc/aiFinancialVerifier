// Plain-text findings report for the clipboard. No engine changes — built purely
// from the summary + findings the API already returns. Formatted to survive
// email/Slack: plain text, monospace-friendly, with the skipped count kept in the
// header (the tool is honest about what it can't check).

import { type CheckResponse, type Finding, claimText, orderFindings } from "./claims";

const VERDICT = "Doesn't add up";

function header(result: CheckResponse): string {
  const s = result.summary;
  const checked = s?.checked ?? 0;
  const failed = s?.failed ?? 0;
  const skipped = s?.discarded?.total ?? 0;
  const citations =
    s?.citationsChecked !== undefined
      ? ` · ${s.citationsChecked} links · ${s.citationsDead ?? 0} dead`
      : "";
  return `Second Reader findings — ${checked} checked · ${failed} failed · ${skipped} skipped${citations}`;
}

function row(f: Finding, n: number): string {
  const verdict = f.type === "citation" ? "Dead link" : VERDICT;
  const title = f.label ?? f.type ?? "claim";
  const type = f.type && f.type !== f.label ? ` (${f.type})` : "";
  const lines = [`${n}) ${verdict} — ${title}${type}`];
  const claim = claimText(f);
  if (claim) lines.push(`    "${claim}"`);
  if (f.note) lines.push(`    ${f.note}`);
  else if (f.arithmetic) lines.push(`    Math: ${f.arithmetic}`);
  return lines.join("\n");
}

export function buildPlainReport(result: CheckResponse): string {
  const findings = result.findings ?? [];
  const failures = orderFindings(findings).filter(({ f }) => f.status === "failed");

  if (findings.length === 0) {
    return `${header(result)}\n\nNo numeric claims were found in this text.`;
  }
  if (failures.length === 0) {
    return `${header(result)}\n\nNo errors found.`;
  }
  const rows = failures.map(({ f }, i) => row(f, i + 1));
  return [header(result), ...rows].join("\n\n");
}
