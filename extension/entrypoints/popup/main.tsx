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
    try { setStatus(await browser.runtime.sendMessage({ type: "CONNECT_CURRENT_TAB" } satisfies ExtensionMessage) as ConnectionStatus); }
    catch (error) { setStatus({ installed: true, connected: false, error: error instanceof Error ? error.message : "Connection failed." }); }
    setBusy(false);
  }
  return <main><header><div className="mark">T</div><div><strong>Trenith</strong><span>WATCH TOGETHER</span></div><i className={status.connected ? "online" : ""} /></header><section className="status-card"><span>{status.connected ? "CONNECTED PLAYER" : "COMPANION READY"}</span><h1>{status.connected ? status.title || "OTT tab connected" : "Connect the tab you want to watch."}</h1><p>{status.connected ? "Keep this tab open. Playback changes will be synchronized through your Trenith room." : "Open a supported OTT website, start the title, then grant access only to that site."}</p>{status.provider && <code>{status.provider}</code>}</section>{status.error && <p className="error">{status.error}</p>}<button className="connect" onClick={connect} disabled={busy}>{busy ? "Requesting site access…" : status.connected ? "Connect a different tab" : "Connect current OTT tab →"}</button><button className="room" onClick={() => browser.tabs.create({ url: "https://tools.trenith.com/watch-together" })}>Open Trenith watch room ↗</button><footer><span>Own account · no screen capture</span><a href="https://tools.trenith.com/watch-together/supported" target="_blank">Compatibility</a></footer></main>;
}

createRoot(document.getElementById("root")!).render(<Popup />);
