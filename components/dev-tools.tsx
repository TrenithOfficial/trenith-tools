"use client";

import { useMemo, useState } from "react";
import { downloadBlob } from "../lib/client-tools";

// Developer/text utilities that run entirely on-device. Every result is
// deterministic (Web Crypto, TextEncoder, JSON) so these tools cannot silently
// half-work: the browser either produces the exact output or throws a clear
// error the UI shows.

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return { copied, copy };
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { copied, copy } = useCopy();
  return <button type="button" className="secondary-button" onClick={() => copy(text)} disabled={!text}>{copied ? "Copied ✓" : label}</button>;
}

// Unbiased selection from a character pool using rejection sampling over
// crypto.getRandomValues, so no character is ever slightly more likely.
function randomIndex(limit: number) {
  const max = Math.floor(0xffffffff / limit) * limit;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= max);
  return value % limit;
}

const CLASSES = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};

function PasswordGenerator() {
  const [length, setLength] = useState(20);
  const [sets, setSets] = useState({ lower: true, upper: true, digits: true, symbols: true });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const activePools = Object.entries(sets).filter(([, on]) => on).map(([key]) => CLASSES[key as keyof typeof CLASSES]);
  const poolSize = activePools.join("").length;
  const entropyBits = poolSize ? Math.round(length * Math.log2(poolSize)) : 0;
  const strength = entropyBits >= 128 ? "Very strong" : entropyBits >= 90 ? "Strong" : entropyBits >= 60 ? "Reasonable" : "Weak";

  function generate() {
    if (!activePools.length) { setError("Select at least one character type."); setPassword(""); return; }
    setError("");
    // Guarantee at least one character from every selected set, then fill the
    // rest from the combined pool and shuffle so the guaranteed characters are
    // not stuck at the front.
    const combined = activePools.join("");
    const chars = activePools.map((pool) => pool[randomIndex(pool.length)]);
    while (chars.length < length) chars.push(combined[randomIndex(combined.length)]);
    for (let i = chars.length - 1; i > 0; i -= 1) { const j = randomIndex(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    setPassword(chars.slice(0, length).join(""));
  }

  return <div className="calculator-workspace dev-workspace">
    <span className="panel-label">PASSWORD</span>
    <div className="dev-output-block"><code className="dev-output mono">{password || "Press generate for a crypto-strong password"}</code></div>
    <div className="dev-actions"><button type="button" className="workspace-run" onClick={generate}>Generate password <span>→</span></button><CopyButton text={password} /></div>
    <label className="large-input">Length · {length}<input type="range" min="6" max="64" value={length} onChange={(event) => setLength(Number(event.target.value))} /></label>
    <div className="dev-check-grid">{(["lower", "upper", "digits", "symbols"] as const).map((key) => <label key={key} className="check-label"><input type="checkbox" checked={sets[key]} onChange={(event) => setSets({ ...sets, [key]: event.target.checked })} /><span>{key === "lower" ? "Lowercase" : key === "upper" ? "Uppercase" : key === "digits" ? "Numbers" : "Symbols"}</span></label>)}</div>
    <div className="dev-meta"><span>Strength: <strong>{strength}</strong></span><span>≈ {entropyBits} bits of entropy</span></div>
    {error && <div className="workspace-error" role="alert">{error}</div>}
    <small>Generated with your browser&apos;s cryptographic random source. Nothing is sent to Trenith or stored.</small>
  </div>;
}

const HASH_ALGOS = ["SHA-256", "SHA-384", "SHA-512", "SHA-1"] as const;

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function HashGenerator() {
  const [text, setText] = useState("");
  const [algo, setAlgo] = useState<(typeof HASH_ALGOS)[number]>("SHA-256");
  const [file, setFile] = useState<File | null>(null);
  const [digest, setDigest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError(""); setDigest("");
    try {
      const data = file ? await file.arrayBuffer() : new TextEncoder().encode(text);
      if (!file && !text) throw new Error("Enter text or choose a file to hash.");
      const result = await crypto.subtle.digest(algo, data);
      setDigest(toHex(result));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Hashing failed.");
    } finally { setBusy(false); }
  }

  return <div className="calculator-workspace dev-workspace">
    <span className="panel-label">CHECKSUM / HASH</span>
    <label className="studio-field">Text to hash<textarea value={text} onChange={(event) => { setText(event.target.value); setFile(null); }} rows={5} placeholder="Paste text, or choose a file below" /></label>
    <label className="studio-field">Or hash a file<input type="file" onChange={(event) => { setFile(event.target.files?.[0] || null); }} />{file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</small>}</label>
    <label className="studio-field">Algorithm<select value={algo} onChange={(event) => setAlgo(event.target.value as typeof algo)}>{HASH_ALGOS.map((item) => <option key={item} value={item}>{item}{item === "SHA-1" ? " · legacy" : ""}</option>)}</select></label>
    <div className="dev-actions"><button type="button" className="workspace-run" onClick={run} disabled={busy}>{busy ? "Hashing…" : "Compute hash"} <span>→</span></button><CopyButton text={digest} /></div>
    {digest && <div className="dev-output-block"><code className="dev-output mono">{digest}</code></div>}
    {error && <div className="workspace-error" role="alert">{error}</div>}
    <small>{algo} runs in your browser through the Web Crypto API. Files are read locally and never uploaded.</small>
  </div>;
}

function UuidGenerator() {
  const [count, setCount] = useState(5);
  const [uppercase, setUppercase] = useState(false);
  const [ids, setIds] = useState<string[]>([]);

  function generate() {
    const list = Array.from({ length: Math.min(500, Math.max(1, count)) }, () => crypto.randomUUID());
    setIds(uppercase ? list.map((id) => id.toUpperCase()) : list);
  }
  const joined = ids.join("\n");

  return <div className="calculator-workspace dev-workspace">
    <span className="panel-label">UUID v4</span>
    <div className="dev-controls-row">
      <label className="large-input">How many · {count}<input type="range" min="1" max="100" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label>
      <label className="check-label"><input type="checkbox" checked={uppercase} onChange={(event) => setUppercase(event.target.checked)} /><span>Uppercase</span></label>
    </div>
    <div className="dev-actions"><button type="button" className="workspace-run" onClick={generate}>Generate {count} UUID{count === 1 ? "" : "s"} <span>→</span></button><CopyButton text={joined} label="Copy all" />{ids.length > 0 && <button type="button" className="secondary-button" onClick={() => downloadBlob(new Blob([joined], { type: "text/plain" }), "uuids.txt")}>Download .txt ↓</button>}</div>
    {ids.length > 0 && <div className="dev-output-block"><code className="dev-output mono">{joined}</code></div>}
    <small>Version-4 UUIDs from crypto.randomUUID — 122 random bits each, generated on your device.</small>
  </div>;
}

function Base64Tool() {
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [input, setInput] = useState("");

  const output = useMemo(() => {
    if (!input) return "";
    try {
      if (mode === "encode") {
        // btoa only handles Latin-1, so encode UTF-8 bytes to a binary string first.
        const bytes = new TextEncoder().encode(input);
        let binary = "";
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary);
      }
      const binary = atob(input.trim());
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return " ERROR";
    }
  }, [input, mode]);

  const shown = output === " ERROR" ? "" : output;
  const decodeFailed = output === " ERROR";

  return <div className="calculator-workspace dev-workspace">
    <span className="panel-label">BASE64</span>
    <div className="dev-mode-toggle">{(["encode", "decode"] as const).map((item) => <button type="button" key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "encode" ? "Text → Base64" : "Base64 → Text"}</button>)}</div>
    <label className="studio-field">{mode === "encode" ? "Text to encode" : "Base64 to decode"}<textarea value={input} onChange={(event) => setInput(event.target.value)} rows={5} placeholder={mode === "encode" ? "Type or paste text" : "Paste Base64"} /></label>
    <div className="dev-actions"><CopyButton text={shown} label="Copy result" /></div>
    {decodeFailed ? <div className="workspace-error" role="alert">That is not valid Base64. Check for stray characters or whitespace.</div> : shown && <div className="dev-output-block"><code className="dev-output mono">{shown}</code></div>}
    <small>UTF-8 safe and fully on-device — emoji and non-Latin text round-trip correctly.</small>
  </div>;
}

export function DevUtility({ slug }: { slug: string }) {
  if (slug === "password-generator") return <PasswordGenerator />;
  if (slug === "hash-generator") return <HashGenerator />;
  if (slug === "uuid-generator") return <UuidGenerator />;
  return <Base64Tool />;
}
