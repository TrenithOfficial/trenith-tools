import { test } from "node:test";
import assert from "node:assert/strict";
import { FORWARDED_CLIENT_HEADERS } from "../lib/watch-proxy-headers.ts";

// The worker enforces the access gate, but it only sees the headers the Vercel
// proxy forwards. Room creation broke in production once because the proxy
// dropped `x-watch-access`; the worker's own tests call it directly and cannot
// catch that. Pin the forwarded-header contract here.
test("proxy forwards the Watch Together access-gate headers", () => {
  assert.ok(FORWARDED_CLIENT_HEADERS.includes("x-watch-access"), "must forward the room-creation access key");
  assert.ok(FORWARDED_CLIENT_HEADERS.includes("x-watch-admin"), "must forward the approval secret");
  // The bearer token and body content type are needed for every room operation.
  assert.ok(FORWARDED_CLIENT_HEADERS.includes("authorization"));
  assert.ok(FORWARDED_CLIENT_HEADERS.includes("content-type"));
});
