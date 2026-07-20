import { NextResponse } from "next/server";
import { FORWARDED_CLIENT_HEADERS } from "../../../../lib/watch-proxy-headers";

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
  // Forward the gate headers (`x-watch-access`, `x-watch-admin`) alongside the
  // usual ones — the worker enforces the access gate and only sees what this
  // proxy passes through. See lib/watch-proxy-headers.ts.
  for (const name of FORWARDED_CLIENT_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("origin", incoming.origin);
  // Forward the real client IP so the signaling worker can attribute per-IP
  // abuse limits to the caller rather than to this proxy's address. The worker
  // trusts the asserted IP only when the shared secret is presented, which stops
  // a direct caller from spoofing it.
  const clientIp = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);
  const proxySecret = process.env.WATCH_PROXY_SECRET;
  if (proxySecret && clientIp) {
    headers.set("x-trenith-client-ip", clientIp);
    headers.set("x-trenith-proxy-auth", proxySecret);
  }
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
