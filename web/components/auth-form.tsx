"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "1";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message || "Something went wrong. Try again.");
      return;
    }
    router.push("/check");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
        <h1 className="font-display text-2xl">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-mut">
          {mode === "login"
            ? "Log in to check a report."
            : "Free while we're in early access."}
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-pine"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-pine"
          />
          <input
            type="password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-pine"
          />

          {error && (
            <p className="rounded-lg bg-blood-soft px-4 py-2.5 text-sm text-blood">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink px-5 py-2.5 text-sm text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-mut">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
            <button
              onClick={() =>
                authClient.signIn.social({ provider: "google", callbackURL: "/check" })
              }
              className="w-full rounded-full border border-line bg-paper px-5 py-2.5 text-sm transition-colors hover:bg-pine-soft"
            >
              Continue with Google
            </button>
          </>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-mut">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <Link href="/signup" className="text-pine underline underline-offset-2">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-pine underline underline-offset-2">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
