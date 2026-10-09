import Link from "next/link";
import { Nav, Footer } from "@/components/nav";

const features = [
  {
    title: "Deterministic checks",
    body: "An LLM finds the numbers; pure arithmetic judges them. The model can miss a claim, but it can never invent a false flag.",
  },
  {
    title: "Evidence you can audit",
    body: "Every finding shows the exact calculation — the claim, the math, the gap. You never have to take the tool's word for it.",
  },
  {
    title: "Built for reports",
    body: "Sums that don't total, growth rates that don't grow, years that don't line up — the mistakes AI reports actually make.",
  },
];

const steps = [
  {
    n: "01",
    title: "Extract",
    body: "An LLM reads the report and pulls out every numeric claim — as verbatim quotes, nothing rephrased.",
  },
  {
    n: "02",
    title: "Verify",
    body: "Deterministic code does the arithmetic: totals, percentages, year-over-year changes, comparisons.",
  },
  {
    n: "03",
    title: "Flag",
    body: "Errors come back in red, with the exact calculation shown. What the tool can't check, it says so.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pb-14 pt-20 text-center sm:pt-28">
          <p className="text-[11px] uppercase tracking-[0.25em] text-mut">
            For AI-generated business reports
          </p>
          <h1 className="font-display mt-6 text-4xl leading-[1.15] tracking-tight sm:text-6xl">
            AI wrote it.
            <br />
            <span className="italic text-pine">A second reader</span> should check it.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-mut sm:text-lg">
            Second Reader flags the arithmetic errors AI slips into reports — deterministic
            checks, evidence you can audit, no black-box trust scores.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-ink px-7 py-3 text-sm text-paper transition-opacity hover:opacity-85"
            >
              Start checking — free
            </Link>
            <a
              href="#how"
              className="rounded-full border border-line bg-white px-7 py-3 text-sm transition-colors hover:border-pine"
            >
              See how it works
            </a>
          </div>
        </section>

        {/* Example finding */}
        <section className="mx-auto max-w-2xl px-6 pb-20">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
            <p className="text-[11px] uppercase tracking-[0.25em] text-mut">A real catch</p>
            <p className="mt-4 font-display text-lg leading-snug">
              &ldquo;Total combined expenditure across all three core sectors reached exactly
              $150,000.&rdquo;
            </p>
            <div className="mt-5 rounded-xl border-l-4 border-blood bg-blood-soft p-4">
              <p className="text-sm font-semibold text-blood">The numbers don&rsquo;t add up</p>
              <p className="mt-1.5 font-mono text-sm text-ink">
                $85,000 + $45,000 + $25,000 = $155,000 ≠ $150,000
              </p>
            </div>
            <p className="mt-4 text-xs text-mut">
              The three departments in the report sum to $155,000 — the total it claims is
              $5,000 short. Caught deterministically, shown with the math.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-line bg-white">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 py-20 md:grid-cols-3">
            {features.map((f) => (
              <div key={f.title}>
                <h3 className="font-display text-xl">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-mut">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-display text-3xl tracking-tight">How it works</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="border-t-2 border-ink pt-5">
                <p className="font-mono text-xs text-mut">{s.n}</p>
                <h3 className="mt-2 font-display text-xl">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-mut">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Honesty strip */}
        <section className="mx-auto max-w-2xl px-6 pb-24 text-center">
          <p className="font-display text-xl leading-relaxed text-mut">
            Second Reader checks what numbers claim — not whether opinions are right.
            No sources to check? It says so, out loud.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
