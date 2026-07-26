import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { ExtensionMessage } from "../lib/messages";

export default defineContentScript({
  matches: [
    "https://tools.trenith.com/*",
    "https://tools.trenith.in/*",
    "https://trenith-tools.vercel.app/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
  ],
  runAt: "document_start",
  noScriptStartedPostMessage: true,
  main() {
    const emit = (type: string, payload?: unknown) => window.postMessage({ source: "TRENITH_WATCH_EXTENSION", type, payload }, location.origin);
    emit("extension-ready");

    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== "TRENITH_WATCH_WEB") return;
      const command = String(event.data.command || "");
      if (command === "ping") {
        emit("extension-ready");
        void browser.runtime.sendMessage({ type: "GET_STATUS" } satisfies ExtensionMessage).then((status) => {
          if (status?.connected) emit("player-status", status);
        });
      } else if (command === "connect-player") {
        // Relay the outcome. When the popup cannot be opened programmatically
        // the room needs to tell the user to click the toolbar icon; silently
        // dropping this made the button look dead.
        void browser.runtime.sendMessage({ type: "OPEN_POPUP" } satisfies ExtensionMessage)
          .then((result) => emit("connect-help", result))
          .catch(() => emit("connect-help", { opened: false, error: "Open your streaming tab, then click the Trenith icon in the browser toolbar to connect it." }));
      } else if (command === "apply-playback") {
        void browser.runtime.sendMessage({ type: "APPLY_PLAYBACK", payload: event.data.payload } satisfies ExtensionMessage)
          .then((result) => emit("playback-result", result))
          .catch(() => emit("playback-result", { applied: false, error: "The companion could not reach the connected streaming tab." }));
      }
    });

    browser.runtime.onMessage.addListener((raw: unknown) => {
      const message = raw as { type?: string; payload?: unknown };
      if (message.type === "PLAYER_STATUS") emit("player-status", message.payload);
      if (message.type === "PLAYBACK_EVENT") emit("playback-event", message.payload);
      if (message.type === "PLAYER_DISCONNECTED") emit("player-disconnected");
      return undefined;
    });
  },
});
