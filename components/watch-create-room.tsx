"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createWatchSecret } from "../lib/watch-crypto";
import { createRoom, saveRoomSession } from "../lib/watch-client";
import { WATCH_PROVIDERS, type WatchControlMode, type WatchProviderId } from "../packages/watch-core";

export function WatchCreateRoom() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState<WatchProviderId>("youtube");
  const [controlMode, setControlMode] = useState<WatchControlMode>("host");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const secret = createWatchSecret(32);
      const proof = createWatchSecret(32);
      const session = await createRoom({ displayName, provider, controlMode, inviteProof: proof });
      saveRoomSession(session, secret, proof);
      const fragment = new URLSearchParams({ key: secret, proof, provider }).toString();
      router.push(`/watch-together/room/${session.roomId}#${fragment}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be created.");
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
    <p className="watch-legal-note">By continuing, you confirm you are 18+ and agree to the <a href="/terms">Watch Together terms</a>. Every viewer needs lawful access to the selected service.</p>
  </form>;
}
