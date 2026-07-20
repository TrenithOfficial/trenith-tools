import { handleWatchApi, type WatchApiEnv, type WatchExecutionCtx } from "./watch-api";

// Minimal Cloudflare Worker whose only job is to own the Watch Together D1
// database and serve /api/watch/*. The site itself is served by Vercel, which
// proxies /api/watch/* to this origin through WATCH_SIGNAL_ORIGIN — so the
// signaling backend runs on Trenith's own infrastructure with no third-party
// host in the request path.
//
// The schema is self-provisioning: handleWatchApi runs ensureSchema() on the
// first request, so a freshly created D1 database needs no manual migration.
const worker = {
  async fetch(request: Request, env: WatchApiEnv, ctx: WatchExecutionCtx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/watch" || pathname.startsWith("/api/watch/")) {
      return handleWatchApi(request, env, ctx);
    }
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  },
};

export default worker;
