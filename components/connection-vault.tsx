"use client";

import { useMemo, useState } from "react";
import {
  ByokConnection,
  clearEncryptedConnections,
  providerDefinitions,
  ProviderId,
  saveEncryptedConnections,
  unlockEncryptedConnections,
  useHasEncryptedVault,
  useSessionConnections,
  writeSessionConnections,
} from "../lib/byok";

const providerOrder: ProviderId[] = ["openai", "anthropic", "gemini", "elevenlabs", "openrouter", "compatible"];

export function ConnectionVault() {
  const connections = useSessionConnections();
  const encryptedAvailable = useHasEncryptedVault();
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [label, setLabel] = useState("My OpenAI connection");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(providerDefinitions.openai.defaultModel);
  const [voiceId, setVoiceId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const definition = providerDefinitions[provider];
  const sessionSummary = useMemo(() => `${connections.length} active connection${connections.length === 1 ? "" : "s"} in this browser session`, [connections.length]);

  const selectProvider = (next: ProviderId) => {
    setProvider(next);
    setModel(providerDefinitions[next].defaultModel);
    setLabel(`My ${providerDefinitions[next].name} connection`);
    setStatus(""); setError("");
  };

  function saveSession() {
    setError(""); setStatus("");
    if (!apiKey.trim()) { setError("Enter the API key supplied by your provider."); return; }
    if (!model.trim()) { setError("Enter the model identifier used by your provider."); return; }
    if (provider === "compatible" && !/^https:\/\//i.test(endpoint)) { setError("A compatible endpoint must use a complete HTTPS URL."); return; }
    const connection: ByokConnection = { id: crypto.randomUUID(), provider, label: label.trim() || definition.name, apiKey: apiKey.trim(), model: model.trim(), voiceId: voiceId.trim() || undefined, endpoint: endpoint.trim() || undefined };
    writeSessionConnections([...connections, connection]); setApiKey(""); setStatus("Connection saved for this browser session.");
  }

  async function testConnection() {
    setTesting(true); setStatus(""); setError("");
    try {
      if (provider === "compatible") {
        if (!/^https:\/\//i.test(endpoint)) throw new Error("Enter an HTTPS OpenAI-compatible endpoint.");
        const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 3 }) });
        if (!response.ok) throw new Error(`The endpoint returned HTTP ${response.status}. Check CORS, model and authorization settings.`);
        setStatus("Compatible endpoint responded successfully.");
      } else {
        const response = await fetch("/api/byok", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test", provider, apiKey, model, voiceId }) });
        const data = await response.json() as { message?: string; error?: string };
        if (!response.ok) throw new Error(data.error || "The provider rejected this connection.");
        setStatus(data.message || "Connection verified.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The connection could not be verified."); }
    finally { setTesting(false); }
  }

  function removeConnection(id: string) {
    writeSessionConnections(connections.filter((connection) => connection.id !== id));
    setStatus("Connection removed from this session.");
  }

  async function encryptVault() {
    setError(""); setStatus("");
    try { if (!connections.length) throw new Error("Add at least one session connection before encrypting the vault."); await saveEncryptedConnections(connections, passphrase); setPassphrase(""); setStatus("Encrypted device vault saved. Your passphrase is not stored."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The encrypted vault could not be saved."); }
  }

  async function unlockVault() {
    setError(""); setStatus("");
    try { await unlockEncryptedConnections(passphrase); setPassphrase(""); setStatus("Encrypted connections unlocked for this session."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The encrypted vault could not be unlocked."); }
  }

  return <div className="vault-layout">
    <section className="connection-form workspace-panel">
      <span className="panel-label">NEW CONNECTION</span><h2>Connect a provider</h2><p>Keys are placed in session storage only when you save. They are cleared when the browser session ends.</p>
      <div className="provider-selector">{providerOrder.map((id) => <button key={id} className={provider === id ? "active" : ""} onClick={() => selectProvider(id)}><i>{providerDefinitions[id].name.slice(0, 1)}</i><span>{providerDefinitions[id].name}</span></button>)}</div>
      <div className="form-grid"><label>Connection name<input value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Model identifier<input value={model} onChange={(event) => setModel(event.target.value)} /></label><label className="full-field">{definition.keyLabel}<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck="false" placeholder="Key is never committed or included in page analytics" /></label>{provider === "elevenlabs" && <label className="full-field">Voice ID<input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} placeholder="ElevenLabs voice identifier" /></label>}{provider === "compatible" && <label className="full-field">Chat completions endpoint<input type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://provider.example/v1/chat/completions" /></label>}</div>
      <div className="form-actions"><button className="secondary-button" onClick={testConnection} disabled={testing || !apiKey}>{testing ? "Testing…" : provider === "compatible" ? "Send small test request" : "Verify provider key"}</button><button className="primary-action" onClick={saveSession}>Save for this session <span>→</span></button></div>
      <div className="connection-notice"><span>◇</span><p>{definition.description} {provider === "compatible" && "The endpoint must allow cross-origin browser requests; Trenith does not proxy arbitrary URLs."}</p></div>
    </section>

    <aside className="vault-sidebar">
      <section className="workspace-panel session-panel"><span className="panel-label">ACTIVE SESSION</span><h2>{sessionSummary}</h2>{connections.length ? <div className="saved-connections">{connections.map((connection) => <article key={connection.id}><i>{providerDefinitions[connection.provider].name.slice(0, 1)}</i><div><strong>{connection.label}</strong><span>{providerDefinitions[connection.provider].name} · {connection.model}</span><small>Key ending ••••{connection.apiKey.slice(-4)}</small></div><button onClick={() => removeConnection(connection.id)} aria-label={`Remove ${connection.label}`}>×</button></article>)}</div> : <div className="vault-empty"><span>⌁</span><p>No active session connections yet.</p></div>}</section>
      <section className="workspace-panel encrypted-panel"><span className="panel-label">OPTIONAL DEVICE VAULT</span><h2>{encryptedAvailable ? "Encrypted vault detected" : "Encrypt connections on this device"}</h2><p>AES-256-GCM encryption with a passphrase-derived key. Trenith cannot recover a forgotten passphrase.</p><label>Vault passphrase<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="new-password" /></label><div>{encryptedAvailable && <button className="secondary-button" onClick={unlockVault}>Unlock into session</button>}<button className="secondary-button" onClick={encryptVault}>Save encrypted vault</button></div>{encryptedAvailable && <button className="danger-link" onClick={() => { clearEncryptedConnections(); setStatus("Encrypted device vault deleted."); }}>Delete encrypted vault</button>}</section>
      {(status || error) && <div className={error ? "vault-message error" : "vault-message"} aria-live="polite">{error || status}</div>}
    </aside>
  </div>;
}

