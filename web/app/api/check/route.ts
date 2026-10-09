import { auth } from "@/lib/auth";

// Server-side proxy to the verification engine (Express API).
// Session-gated; the API URL never reaches the browser.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const apiUrl = process.env.API_URL || "http://localhost:8787";
  try {
    const upstream = await fetch(`${apiUrl}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: `verification engine unreachable: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
