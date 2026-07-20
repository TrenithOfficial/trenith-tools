"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createWatchSecret } from "../lib/watch-crypto";
import { createRoom, getWatchAccessKey, requestWatchAccess, saveRoomSession, setWatchAccessKey } from "../lib/watch-client";
import { WATCH_PROVIDERS, type WatchControlMode, type WatchProviderId } from "../packages/watch-core";

type Gate = "checking" | "request" | "granted";

export function WatchCreateRoom() {
  const [gate, setGate] = useState<Gate>("checking");

  // Read the stored access key after mount so server and client render the same
  // "checking" state first and never mismatch on hydration. The read is deferred
  // a frame (matching the theme read in the site shell) to keep it out of the
  // effect body.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGate(getWatchAccessKey() ? "granted" : "request"));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (gate === "checking") return <div className="watch-create-card watch-access-checking" aria-busy="true"><p>Checking your access…</p></div>;
  if (gate === "request") return <RequestAccess onGranted={() => setGate("granted")} />;
  return <CreateRoom onRevoked={() => setGate("request")} />;
}

function RequestAccess({ onGranted }: { onGranted: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string>("");
  const [haveKey, setHaveKey] = useState(false);
  const [key, setKey] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await requestWatchAccess({ name, email, reason });
      if (result.status === "approved" && result.accessKey) {
        setWatchAccessKey(result.accessKey);
        onGranted();
      } else {
        setPending(result.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  function useExistingKey(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) { setError("Paste your access key."); return; }
    setWatchAccessKey(key.trim());
    onGranted();
  }

  if (pending) return <div className="watch-create-card watch-access-done">
    <div className="watch-form-title"><span>REQUEST RECEIVED</span><strong>You&apos;re on the list</strong></div>
    <p className="watch-access-note">{pending}</p>
    <p className="watch-access-note">Joining a room someone already shared with you works right away — you only need approved access to <em>create</em> your own rooms.</p>
  </div>;

  return <form className="watch-create-card" onSubmit={haveKey ? useExistingKey : submit}>
    <div className="watch-form-title"><span>REQUEST ACCESS</span><strong>Get Watch Together access</strong><small>Free private beta. Request access to create rooms — approved members can invite anyone.</small></div>
    {!haveKey ? <>
      <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoComplete="name" placeholder="e.g. Sai" /></label>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} required autoComplete="email" placeholder="you@example.com" /></label>
      <label>What will you use it for? <small>(optional)</small><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="A short note helps us approve faster." /></label>
      {error && <p className="watch-form-error" role="alert">{error}</p>}
      <button className="watch-create-button" disabled={busy}>{busy ? "Sending request…" : "Request free access →"}</button>
      <p className="watch-access-note">We review requests and, if approved, email your access credentials within 24 hours. Trenith team emails are approved instantly.</p>
      <button type="button" className="watch-text-link" onClick={() => { setHaveKey(true); setError(""); }}>I already have an access key</button>
    </> : <>
      <label>Access key<input value={key} onChange={(event) => setKey(event.target.value)} maxLength={80} autoFocus placeholder="Paste the key from your approval email" /></label>
      {error && <p className="watch-form-error" role="alert">{error}</p>}
      <button className="watch-create-button">Unlock room creation →</button>
      <button type="button" className="watch-text-link" onClick={() => { setHaveKey(false); setError(""); }}>Request access instead</button>
    </>}
    <p className="watch-legal-note">By continuing, you confirm you are 18+ and agree to the <a href="/terms">Watch Together terms</a>. Every viewer needs lawful access to the selected service.</p>
  </form>;
}

function CreateRoom({ onRevoked }: { onRevoked: () => void }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState<WatchProviderId>("youtube");
  const [controlMode, setControlMode] = useState<WatchControlMode>("host");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const secret = createWatchSecret(32);
      const proof = createWatchSecret(32);
      const session = await createRoom({ displayName, provider, controlMode, inviteProof: proof });
      saveRoomSession(session, secret, proof);
      const fragment = new URLSearchParams({ key: secret, proof, provider }).toString();
      router.push(`/watch-together/room/${session.roomId}#${fragment}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The room could not be created.";
      // If the stored key is no longer valid, drop it and send the user back to
      // the request flow rather than leaving them stuck.
      if (/access key is not valid|approved access/i.test(message)) {
        setWatchAccessKey("");
        onRevoked();
        return;
      }
      setError(message);
      setBusy(false);
    }
  }

  return <form className="watch-create-card" onSubmit={submit}>
    <div className="watch-form-title"><span>LIVE ROOM</span><strong>Create a private watch room</strong><small>No account. Room expires automatically after six hours.</small></div>
    <label>Your display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={32} placeholder="e.g. Sai" required autoComplete="nickname" /></label>
    <label>Streaming service<select value={provider} onChange={(event) => setProvider(event.target.value as WatchProviderId)}>{WATCH_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name}{item.support !== "launch" ? " · beta" : ""}</option>)}</select></label>
    <fieldset><legend>Who can control playback?</legend><label className="watch-radio"><input type="radio" name="control" checked={controlMode === "host"} onChange={() => setControlMode("host")} /><span><strong>Host only</strong><small>Best for larger rooms</small></span></label><label className="watch-radio"><input type="radio" name="control" checked={controlMode === "everyone"} onChange={() => setControlMode("everyone")} /><span><strong>Everyone</strong><small>Friends can play, pause and seek</small></span></label></fieldset>
    {error && <p className="watch-form-error" role="alert">{error}</p>}
    <button className="watch-create-button" disabled={busy}>{busy ? "Creating encrypted room…" : "Create free room →"}</button>
    <p className="watch-legal-note">You have approved access. Anyone you share the room link with can join — they don&apos;t need their own access. Every viewer needs lawful access to the selected service.</p>
  </form>;
}
