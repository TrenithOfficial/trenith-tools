import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "extension",
  publicDir: "extension/public",
  modules: ["@wxt-dev/module-react"],
  targetBrowsers: ["chrome", "firefox", "edge"],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "Trenith Watch Together",
    short_name: "Trenith Watch",
    version: "1.0.0",
    version_name: "1.0.0 audited beta",
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
  zip: { artifactTemplate: "trenith-watch-together-1.0.0-{{browser}}.zip", zipSources: true },
});
