import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

test("renders the Trenith product shell and preview metadata", async () => {
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), environment, context);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /Trenith/);
  assert.match(html, /Audio Joiner/);
  assert.match(html, /PDF workspace|PDF/);
});

test("blocks private-network URL scanning", async () => {
  const response = await worker.fetch(new Request("http://localhost/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1/private.mp3" }),
  }), environment, context);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Private|local/i);
});

test("blocks private-network download proxying", async () => {
  const response = await worker.fetch(new Request("http://localhost/api/download?url=http%3A%2F%2F10.0.0.1%2Fprivate.mp3"), environment, context);
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Unsupported/i);
});
