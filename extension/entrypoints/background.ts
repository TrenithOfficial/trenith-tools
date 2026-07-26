import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { ConnectionStatus, ExtensionMessage, PlayerStatus } from "../lib/messages";

let playerTabId: number | undefined;
let lastStatus: PlayerStatus | undefined;

async function sendToRoom(message: unknown) {
  // Filtering with tabs.query({url}) requires the "tabs" permission or host
  // permissions for the page; this extension deliberately requests neither, so
  // the room tab could never match and every player update was dropped before
  // it left the worker. Query unfiltered instead and let delivery do the
  // filtering: only this extension's own declared content script listens, and
  // tabs without it reject with "Could not establish connection", which
  // allSettled absorbs. No extra permission, so no new install warning.
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs.filter((tab) => tab.id != null).map((tab) => browser.tabs.sendMessage(tab.id!, message)));
}

async function connectionStatus(): Promise<ConnectionStatus> {
  if (playerTabId == null) return { installed: true, connected: false };
  try {
    const tab = await browser.tabs.get(playerTabId);
    if (!tab.id) throw new Error("No connected player tab.");
    return { installed: true, connected: true, provider: lastStatus?.provider, title: lastStatus?.title || tab.title, tabId: tab.id };
  } catch {
    playerTabId = undefined;
    lastStatus = undefined;
    return { installed: true, connected: false };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.set({ trenithWatchVersion: "1.0.2" });
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    if (tabId === playerTabId) {
      playerTabId = undefined;
      lastStatus = undefined;
      void sendToRoom({ type: "PLAYER_DISCONNECTED" });
    }
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender) => {
    const message = raw as ExtensionMessage;
    if (message.type === "GET_STATUS") return connectionStatus();
    // Chrome only opens the popup for a gesture made in the extension's own UI,
    // so a click on the room page usually cannot open it. Report that honestly
    // instead of claiming success and leaving the page with nothing to show.
    if (message.type === "OPEN_POPUP") return browser.action.openPopup()
      .then(() => ({ opened: true }))
      .catch(() => ({ opened: false, error: "Open your streaming tab, then click the Trenith icon in the browser toolbar to connect it." }));
    if (message.type === "CONNECT_CURRENT_TAB") return (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) return { installed: true, connected: false, error: "Open the OTT playback tab, then try again." } satisfies ConnectionStatus;
      const url = new URL(tab.url);
      if (!/^https?:$/.test(url.protocol)) return { installed: true, connected: false, error: "This browser page cannot be connected." } satisfies ConnectionStatus;
      if (/trenith\.(com|in)$/.test(url.hostname) || url.hostname === "trenith-tools.vercel.app" || url.hostname === "localhost" || url.hostname === "127.0.0.1") return { installed: true, connected: false, error: "Switch to the OTT playback tab before connecting." } satisfies ConnectionStatus;
      const originPattern = `${url.origin}/*`;
      // Firefox only allows permissions.request() from a user gesture in the
      // popup, so the popup requests it before sending this message; here we only
      // verify the grant is present and never trigger a request from the worker.
      const granted = await browser.permissions.contains({ origins: [originPattern] });
      if (!granted) return { installed: true, connected: false, error: "Site access was not granted. Trenith cannot control this player without it." } satisfies ConnectionStatus;
      try {
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ["player-injected.js"] });
        playerTabId = tab.id;
        await browser.storage.session?.set({ playerTabId }).catch(() => undefined);
        await browser.tabs.sendMessage(tab.id, { type: "REQUEST_STATUS" } satisfies ExtensionMessage);
        return { installed: true, connected: true, tabId: tab.id, title: tab.title } satisfies ConnectionStatus;
      } catch (error) {
        return { installed: true, connected: false, error: error instanceof Error ? error.message : "The player bridge could not be loaded." } satisfies ConnectionStatus;
      }
    })();
    if (message.type === "PLAYER_READY" || message.type === "PLAYER_STATUS") {
      if (sender.tab?.id != null) playerTabId = sender.tab.id;
      lastStatus = { ...message.payload, tabId: playerTabId };
      void sendToRoom({ type: "PLAYER_STATUS", payload: lastStatus });
      return Promise.resolve({ accepted: true });
    }
    if (message.type === "PLAYBACK_EVENT") {
      if (sender.tab?.id != null) playerTabId = sender.tab.id;
      lastStatus = { ...message.payload, connected: true, tabId: playerTabId };
      void sendToRoom({ type: "PLAYBACK_EVENT", payload: message.payload });
      return Promise.resolve({ accepted: true });
    }
    if (message.type === "APPLY_PLAYBACK") return (async () => {
      if (playerTabId == null) return { applied: false, error: "No OTT tab is connected." };
      try { return await browser.tabs.sendMessage(playerTabId, message); }
      catch { playerTabId = undefined; return { applied: false, error: "The connected OTT tab is no longer available." }; }
    })();
    return undefined;
  });

  void browser.storage.session?.get("playerTabId").then((stored) => {
    if (typeof stored.playerTabId === "number") playerTabId = stored.playerTabId;
  }).catch(() => undefined);
});
