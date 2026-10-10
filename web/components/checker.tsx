"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  type CheckResponse,
  type Finding,
  type Mark,
  claimText,
  computeMarks,
  orderFindings,
} from "@/lib/claims";

const EXAMPLE = `Total combined expenditure across all three core sectors reached exactly $150,000.

A granular look at the departmental breakdown shows:
- Personnel and Salaries: $85,000
- Infrastructure and Software Licensing: $45,000
- Travel and Client Entertainment Expenses: $25,000`;

// First rendered mark of each finding carries a stable DOM id so claim rows can
// scroll to and pulse their highlight. Later marks of the same finding get no id
// (ids must be unique); the first one is enough to reveal the claim.
function AnnotatedText({ text, marks }: { text: string; marks: Mark[] }) {
  const nodes: React.ReactNode[] = [];
  const assigned = new Set<number>();
  let cursor = 0;
  for (const m of marks) {
    if (m.start > cursor) nodes.push(text.slice(cursor, m.start));
    const isFirst = !assigned.has(m.findingIndex);
    if (isFirst) assigned.add(m.findingIndex);
    nodes.push(
      <mark
        key={`${m.start}-${m.end}`}
        id={isFirst ? `claim-highlight-${m.findingIndex}` : undefined}
        title={m.tooltip}
        className={
          m.color === "red"
            ? "cursor-help rounded-[3px] bg-blood-soft px-0.5 text-blood"
            : "cursor-help rounded-[3px] bg-pine-soft px-0.5 text-moss"
        }
      >
        {text.slice(m.start, m.end)}
      </mark>
    );
    cursor = m.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <div className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-ink">
      {nodes}
    </div>
  );
}

function VerdictBadge({ status }: { status: Finding["status"] }) {
  const conf = {
    passed: { icon: "✓", text: "Checks out", cls: "text-moss" },
    failed: { icon: "✗", text: "Doesn't add up", cls: "text-blood" },
    discarded: { icon: "⊘", text: "Skipped", cls: "text-mut" },
  }[status];
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${conf.cls}`}
    >
      {conf.icon} {conf.text}
    </span>
  );
}

// One row per claim: verdict badge + verbatim claim text + the math (+ discard
// reason). Clicking reveals the highlight in the annotated report.
function FindingCard({ f, onReveal }: { f: Finding; onReveal?: () => void }) {
  const claim = claimText(f);
  const heading = claim ?? f.label ?? f.type ?? "relation";
  const red = f.status === "failed";
  return (
    <button
      type="button"
      onClick={onReveal}
      disabled={!onReveal}
      className={`w-full rounded-xl border border-line bg-white p-5 text-left transition-shadow ${
        onReveal ? "hover:shadow-md focus-visible:outline-2 focus-visible:outline-pine" : "cursor-default"
      } ${
        f.status === "discarded"
          ? "border-l-4 border-l-line"
          : red
            ? "border-l-4 border-l-blood"
            : "border-l-4 border-l-moss"
      }`}
      aria-label={onReveal ? `Reveal claim in report: ${heading}` : heading}
    >
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge status={f.status} />
        {f.type && (
          <span className="rounded-full border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-mut">
            {f.type}
          </span>
        )}
        {f.status === "discarded" && (
          <span className="font-mono text-xs text-mut">{f.id ?? "?"}</span>
        )}
      </div>
      <p
        className="mt-2 line-clamp-3 text-sm font-medium"
        title={f.status === "discarded" ? undefined : heading}
      >
        {heading}
      </p>
      {f.arithmetic && (
        <p className="mt-2 rounded-lg bg-paper px-3 py-2 font-mono text-[13px] leading-relaxed">
          {f.arithmetic}
        </p>
      )}
      {f.status === "discarded" && f.reason && (
        <p className="mt-1.5 text-xs text-mut">
          {f.label ?? f.type ?? "relation"} — skipped ({f.reason})
        </p>
      )}
    </button>
  );
}

function ClaimsList({
  findings,
  rendered,
  onReveal,
}: {
  findings: Finding[];
  rendered: Set<number>;
  onReveal: (index: number) => void;
}) {
  const rows = orderFindings(findings);
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-lg">Claims</h2>
        <span className="text-xs text-mut">
          {rows.length} {rows.length === 1 ? "claim" : "claims"}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map(({ f, index }) => (
          <FindingCard
            key={`${f.id}-${index}`}
            f={f}
            onReveal={rendered.has(index) ? () => onReveal(index) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function revealClaim(index: number) {
  const el = document.getElementById(`claim-highlight-${index}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("claim-pulse");
  // force reflow so a re-click restarts the animation
  void el.offsetWidth;
  el.classList.add("claim-pulse");
  window.setTimeout(() => el.classList.remove("claim-pulse"), 1500);
}

export function Checker({ userName, userEmail }: { userName: string; userEmail: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);

  async function runCheck() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data: CheckResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Request failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch {
      setError("Couldn't reach the checker. Is the engine running?");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  const s = result?.summary;
  const discardedTotal = s ? s.discarded.total : 0;
  const findings = result?.findings ?? [];
  const { marks, rendered } = useMemo(() => computeMarks(findings), [result]);

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <span className="font-display text-xl tracking-tight">Second&nbsp;Reader</span>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-mut sm:inline">
              {userName || userEmail}
            </span>
            <button
              onClick={signOut}
              className="rounded-full border border-line px-4 py-1.5 transition-colors hover:border-pine"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl tracking-tight">Check a report</h1>
        <p className="mt-2 text-sm text-mut">
          Paste the report text. Second Reader finds every numeric claim and checks the math.
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-sm">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            className="h-64 w-full resize-y rounded-xl border border-line bg-paper p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-pine"
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={runCheck}
              disabled={busy || !text.trim()}
              className="rounded-full bg-ink px-6 py-2.5 text-sm text-paper transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {busy ? "Checking…" : "Check report"}
            </button>
            {!text.trim() && (
              <button
                onClick={() => setText(EXAMPLE)}
                className="text-sm text-mut underline underline-offset-2 hover:text-ink"
              >
                Try the example
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border-l-4 border-blood bg-blood-soft p-4 text-sm text-blood">
            {error}
          </div>
        )}

        {busy && (
          <div className="mt-6 rounded-xl border border-line bg-white p-6 text-center text-sm text-mut">
            Reading the report, checking every number…
          </div>
        )}

        {result && s && (
          <section className="mt-8">
            {marks.length > 0 && (
              <div className="mb-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg">Annotated report</h2>
                  <div className="flex gap-4 text-xs text-mut">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-[3px] bg-blood-soft" /> doesn't add up
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-[3px] bg-pine-soft" /> checks out
                    </span>
                  </div>
                </div>
                <AnnotatedText text={text} marks={marks} />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-mut">
                <b className="text-ink">{s.checked}</b> checked
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-mut">
                <b className="text-moss">{s.passed}</b> passed
              </span>
              <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-mut">
                <b className="text-blood">{s.failed}</b> failed
              </span>
              {discardedTotal > 0 && (
                <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-mut">
                  <b>{discardedTotal}</b> skipped
                </span>
              )}
            </div>

            {findings.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-mut">
                No checkable relations found in this text.
                <br />
                Try a report with stated totals, percentages, or year-over-year figures.
              </div>
            ) : (
              <>
                {s.checked > 0 && s.failed === 0 && (
                  <div className="mt-5 rounded-xl border-l-4 border-moss bg-pine-soft p-5 text-sm">
                    <p className="font-semibold text-moss">No errors found</p>
                    <p className="mt-1 text-mut">
                      All {s.checked} checked claims add up.
                    </p>
                  </div>
                )}
                <ClaimsList findings={findings} rendered={rendered} onReveal={revealClaim} />
              </>
            )}

            {result.meta && (
              <p className="mt-6 text-xs text-mut">
                engine {result.meta.version} · model {result.meta.model}
                {result.meta.mock ? " · mock mode" : ""} ·{" "}
                {(result.meta.totalMs / 1000).toFixed(1)}s
                {result.meta.warnings?.length ? (
                  <span className="text-ochre"> · {result.meta.warnings.join("; ")}</span>
                ) : null}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
