import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import type { ConnectionStatus, ExtensionMessage } from "../../lib/messages";
import "./style.css";

function Popup() {
  const [status, setStatus] = useState<ConnectionStatus>({ installed: true, connected: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { void browser.runtime.sendMessage({ type: "GET_STATUS" } satisfies ExtensionMessage).then(setStatus); }, []);
  async function connect() {
    setBusy(true);
    try {
      // Request host access here, inside the popup's click gesture — Firefox
      // rejects permissions.request() made from the background service worker.
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
        setStatus({ installed: true, connected: false, error: "Open the OTT playback tab, then try again." });
        setBusy(false);
        return;
      }
      const granted = await browser.permissions.request({ origins: [`${new URL(tab.url).origin}/*`] });
      if (!granted) {
        setStatus({ installed: true, connected: false, error: "Site access was not granted. Trenith cannot control this player without it." });
        setBusy(false);
        return;
      }
      setStatus(await browser.runtime.sendMessage({ type: "CONNECT_CURRENT_TAB" } satisfies ExtensionMessage) as ConnectionStatus);
    } catch (error) {
      setStatus({ installed: true, connected: false, error: error instanceof Error ? error.message : "Connection failed." });
    }
    setBusy(false);
  }
  return <main><header><div className="mark">T</div><div><strong>Trenith</strong><span>WATCH TOGETHER</span></div><i className={status.connected ? "online" : ""} /></header><section className="status-card"><span>{status.connected ? "CONNECTED PLAYER" : "COMPANION READY"}</span><h1>{status.connected ? status.title || "OTT tab connected" : "Connect the tab you want to watch."}</h1><p>{status.connected ? "Keep this tab open. Playback changes will be synchronized through your Trenith room." : "Open a supported OTT website, start the title, then grant access only to that site."}</p>{status.provider && <code>{status.provider}</code>}</section>{status.error && <p className="error">{status.error}</p>}<button className="connect" onClick={connect} disabled={busy}>{busy ? "Requesting site access…" : status.connected ? "Connect a different tab" : "Connect current OTT tab →"}</button><button className="room" onClick={() => browser.tabs.create({ url: "https://tools.trenith.com/watch-together" })}>Open Trenith watch room ↗</button><footer><span>Own account · no screen capture</span><a href="https://tools.trenith.com/watch-together/supported" target="_blank">Compatibility</a></footer></main>;
}

createRoot(document.getElementById("root")!).render(<Popup />);
