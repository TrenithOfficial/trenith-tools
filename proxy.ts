import { NextResponse, type NextRequest } from "next/server";

// One build serves both public hostnames, so the self-referencing canonical
// that hreflang needs cannot live in the static HTML. It is sent as a
// `Link: <…>; rel="canonical"` response header chosen by the request host
// instead (see alternateUrls in lib/site.ts). Region-specific deployments
// (NEXT_PUBLIC_SITE_URL set) also carry it in the HTML, and the two agree.
const INDIA_HOST = "tools.trenith.in";
const GLOBAL_HOST = "tools.trenith.com";

export const config = {
  // Pages only: no API routes, build output, engines, images or other files.
  matcher: ["/((?!api/|_next/|ffmpeg/|pdf/|og/|.*\\.[a-z0-9]+$).*)"],
};

export function proxy(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  const canonicalHost = host === INDIA_HOST || host.endsWith(`.${INDIA_HOST}`) ? INDIA_HOST : GLOBAL_HOST;
  const response = NextResponse.next();
  response.headers.set("Link", `<https://${canonicalHost}${request.nextUrl.pathname}>; rel="canonical"`);
  return response;
}
