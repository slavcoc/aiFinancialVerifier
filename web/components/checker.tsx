"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Span = { text: string; kind?: string; start: number; end: number };

type Finding = {
  id: string | null;
  type?: string | null;
  label?: string | null;
  status: "passed" | "failed" | "discarded";
  severity?: "red" | "green" | null;
  arithmetic?: string;
  reason?: string;
  actual?: number;
  stated?: number;
  diffPct?: number;
  diffPp?: number;
  spans?: Span[];
};

type CheckResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    checked: number;
    passed: number;
    failed: number;
    discarded: Record<string, number>;
    validitySkipped: boolean;
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

const EXAMPLE = `Total combined expenditure across all three core sectors reached exactly $150,000.

A granular look at the departmental breakdown shows:
- Personnel and Salaries: $85,000
- Infrastructure and Software Licensing: $45,000
- Travel and Client Entertainment Expenses: $25,000`;

function AnnotatedText({ text, findings }: { text: string; findings: Finding[] }) {
  type Mark = { start: number; end: number; color: "red" | "green"; tooltip: string };
  const marks: Mark[] = [];
  for (const f of findings) {
    if (f.status === "discarded" || !f.spans) continue;
    const color = f.severity === "red" ? "red" : "green";
    const verdict = f.severity === "red" ? "Doesn't add up" : "Checks out";
    for (const s of f.spans) {
      marks.push({
        start: s.start,
        end: s.end,
        color,
        tooltip: `${verdict} · ${f.label ?? f.type}${f.arithmetic ? `\n${f.arithmetic}` : ""}`,
      });
    }
  }
  // sort; first (longest) wins on overlaps — keep highlighting simple and stable
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Mark[] = [];
  for (const m of marks) {
    const last = kept[kept.length - 1];
    if (last && m.start < last.end) continue;
    kept.push(m);
  }

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of kept) {
    if (m.start > cursor) nodes.push(text.slice(cursor, m.start));
    nodes.push(
      <mark
        key={`${m.start}-${m.end}`}
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

function FindingCard({ f }: { f: Finding }) {
  if (f.status === "discarded") {
    return (
      <div className="flex items-baseline gap-3 rounded-lg border border-line bg-white px-4 py-2.5 text-sm text-mut">
        <span className="font-mono text-xs">{f.id ?? "?"}</span>
        <span>
          {f.label ?? f.type ?? "relation"} — skipped ({f.reason ?? "unknown"})
        </span>
      </div>
    );
  }
  const red = f.severity === "red";
  return (
    <div
      className={`rounded-xl border border-line bg-white p-5 ${
        red ? "border-l-4 border-l-blood" : "border-l-4 border-l-moss"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${
            red ? "text-blood" : "text-moss"
          }`}
        >
          {red ? "Doesn't add up" : "Checks out"}
        </span>
        {f.type && (
          <span className="rounded-full border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-mut">
            {f.type}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-medium">{f.label}</p>
      {f.arithmetic && (
        <p className="mt-2 rounded-lg bg-paper px-3 py-2 font-mono text-[13px] leading-relaxed">
          {f.arithmetic}
        </p>
      )}
    </div>
  );
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
  const failedFindings = (result?.findings ?? []).filter((f) => f.status === "failed");

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
            {result.findings?.some(
              (f) => f.status !== "discarded" && f.spans && f.spans.length > 0
            ) && (
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
                <AnnotatedText text={text} findings={result.findings ?? []} />
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

            <div className="mt-5 flex flex-col gap-3">
              {failedFindings.length > 0 ? (
                failedFindings.map((f, i) => (
                  <FindingCard key={`${f.id}-${i}`} f={f} />
                ))
              ) : s.checked === 0 && discardedTotal === 0 ? (
                <div className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-mut">
                  No checkable relations found in this text.
                  <br />
                  Try a report with stated totals, percentages, or year-over-year figures.
                </div>
              ) : (
                <div className="rounded-xl border-l-4 border-moss bg-pine-soft p-5 text-sm">
                  <p className="font-semibold text-moss">No errors found</p>
                  <p className="mt-1 text-mut">
                    All {s.checked} checked relations add up.
                  </p>
                </div>
              )}
            </div>

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
