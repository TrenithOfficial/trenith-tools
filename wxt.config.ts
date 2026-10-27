import { defineConfig } from "wxt";

// The end-to-end harness (tests/e2e/watch-together.e2e.mjs) builds a separate
// copy of the companion whose manifest pre-grants one stand-in streaming origin,
// because Chrome's optional-permission prompt cannot be accepted by automation.
// Nothing else differs, and the published build never reads these variables.
const e2eHost = process.env.WXT_E2E_HOST || "";
const outDir = process.env.WXT_OUT_DIR || ".output";

export default defineConfig({
  srcDir: "extension",
  publicDir: "extension/public",
  outDir,
  modules: ["@wxt-dev/module-react"],
  targetBrowsers: ["chrome", "firefox", "edge"],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    ...(e2eHost ? { host_permissions: [e2eHost] } : {}),
    name: "Trenith Watch Together",
    short_name: "Trenith Watch",
    version: "1.1.0",
    version_name: "1.1.0 synced beta",
    description: "Synchronize authorized OTT playback with encrypted Trenith rooms, live voice and video.",
    permissions: ["activeTab", "scripting", "storage"],
    optional_host_permissions: ["https://*/*"],
    action: { default_title: "Connect this tab to Trenith Watch Together" },
    icons: { 16: "icon-16.png", 32: "icon-32.png", 48: "icon-48.png", 128: "icon-128.png" },
    browser_specific_settings: browser === "firefox" ? { gecko: {
      id: "watch@trenith.com",
      strict_min_version: "140.0",
      data_collection_permissions: {
        required: ["browsingActivity", "websiteActivity", "websiteContent"],
      },
    } } as never : undefined,
  }),
  zip: {
    artifactTemplate: "trenith-watch-together-1.1.0-{{browser}}.zip",
    sourcesTemplate: "trenith-watch-together-1.1.0-sources.zip",
    zipSources: true,
    // The reviewer source ZIP needs what builds the companion, not the site's
    // build output or the multi-megabyte browser engines the site serves.
    excludeSources: ["dist/**", "public/ffmpeg/**", "public/pdf/**", "public/zeroperl.wasm", "tests/fixtures/**", "**/*.wasm", "**/*.tsbuildinfo"],
  },
});
