import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  // Fail closed: the signaling origin must be set explicitly. There is no
  // hardcoded fallback host, so an unset var returns 503 instead of silently
  // routing room traffic (with its auth token and invite proof) to an
  // unintended third-party origin.
  const configured = (process.env.WATCH_SIGNAL_ORIGIN || "").replace(/\/$/, "");
  if (!configured) {
    return NextResponse.json({ error: "Watch Together room storage is not configured on this deployment." }, { status: 503 });
  }
  const incoming = new URL(request.url);
  const targetBase = new URL(configured);
  if (incoming.host === targetBase.host) {
    return NextResponse.json({ error: "Watch Together room storage is not configured on this deployment." }, { status: 503 });
  }
  const target = new URL(`/api/watch/${path.join("/")}${incoming.search}`, `${configured}/`);
  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("origin", incoming.origin);
  // Forward the real client IP so the signaling worker can attribute per-IP
  // abuse limits to the caller rather than to this proxy's address.
  const clientIp = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
  });
  const responseHeaders = new Headers();
  for (const name of ["content-type", "cache-control"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: "GET, POST, DELETE, OPTIONS" } });
}
