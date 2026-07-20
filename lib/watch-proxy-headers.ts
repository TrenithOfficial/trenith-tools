// Request headers the Watch Together proxy forwards verbatim to the signaling
// worker. The worker — not the proxy — enforces the access gate, so the gate
// headers (`x-watch-access` carries the room-creation key, `x-watch-admin` the
// approval secret) MUST stay in this list; drop one and every gated request
// reaches the worker unauthenticated and is refused. Named as a constant so a
// regression test can pin it without importing the Next route.
export const FORWARDED_CLIENT_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "x-watch-access",
  "x-watch-admin",
] as const;
