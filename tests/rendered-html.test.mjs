import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(html, /Every file tool/);
  assert.match(html, /Processed on your device/);
  assert.doesNotMatch(html, /Choose Pro|Choose Studio|monthly credits/i);
});

for (const [path, expected] of [
  ["/tools", /complete tool directory/i],
  ["/tools/audio-joiner", /Choose a complete folder/i],
  ["/connections", /Connections Vault/i],
  ["/studio", /AI Studio/i],
  ["/about", /Trenith Technologies Pvt Ltd/i],
  ["/privacy", /Device-processed files/i],
  ["/terms", /Use the tools responsibly/i],
]) {
  test(`renders ${path}`, async () => {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), environment, context);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, expected);
  });
}

test("publishes crawl and answer-engine discovery files", async () => {
  const robots = await worker.fetch(new Request("http://localhost/robots.txt"), environment, context);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/trenith-tools\.vercel\.app\/sitemap\.xml/);
  const sitemap = await worker.fetch(new Request("http://localhost/sitemap.xml"), environment, context);
  assert.equal(sitemap.status, 200);
  assert.match(await sitemap.text(), /\/tools\/audio-joiner/);
  const llms = await readFile(new URL("../public/llms.txt", import.meta.url), "utf8");
  assert.match(llms, /Capability labels/);
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
