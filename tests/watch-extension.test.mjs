import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { providerForHost } from "../extension/lib/messages.ts";

async function manifest(browser) {
  return JSON.parse(await readFile(new URL(`../.output/${browser}-mv3/manifest.json`, import.meta.url), "utf8"));
}

test("extension provider adapters cover launch OTT hosts", () => {
  assert.equal(providerForHost("www.netflix.com"), "netflix");
  assert.equal(providerForHost("app.primevideo.com"), "prime-video");
  assert.equal(providerForHost("www.hotstar.com"), "jiohotstar");
  assert.equal(providerForHost("www.youtube.com"), "youtube");
  assert.equal(providerForHost("video.example"), "generic");
});

for (const browser of ["chrome", "firefox"]) test(`${browser} extension is MV3, least-privilege and fully packaged`, async () => {
  const value = await manifest(browser);
  assert.equal(value.manifest_version, 3);
  assert.deepEqual(value.permissions.sort(), ["activeTab", "scripting", "storage"]);
  assert.deepEqual(value.optional_host_permissions, ["https://*/*"]);
  assert.ok(!value.permissions.includes("tabs"));
  assert.ok(!value.permissions.includes("webRequest"));
  assert.ok(!JSON.stringify(value).includes("<all_urls>"));
  assert.ok(value.content_scripts[0].matches.includes("https://tools.trenith.com/*"));
  for (const icon of Object.values(value.icons)) await access(new URL(`../.output/${browser}-mv3/${icon}`, import.meta.url));
  await access(new URL(`../.output/${browser}-mv3/player-injected.js`, import.meta.url));
  const player = await readFile(new URL(`../.output/${browser}-mv3/player-injected.js`, import.meta.url), "utf8");
  assert.match(player, /video,audio/);
  assert.match(player, /No compatible media element|No visible HTML5 video/);
});

test("Firefox declares required data categories and a compatible minimum version", async () => {
  const value = await manifest("firefox");
  assert.equal(value.browser_specific_settings.gecko.strict_min_version, "140.0");
  assert.deepEqual(value.browser_specific_settings.gecko.data_collection_permissions.required, ["browsingActivity", "websiteActivity", "websiteContent"]);
});
