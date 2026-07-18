"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearRoomSession, endRoom, getIceServers, getRoomEvents, joinRoom, leaveRoom, loadRoomSession, saveRoomSession, sendRoomEvent } from "../lib/watch-client";
import { decryptWatchMessage, encryptWatchMessage, importWatchRoomKey } from "../lib/watch-crypto";
import { WATCH_MEDIA_PARTICIPANT_LIMIT, WATCH_PROVIDERS, type WatchParticipant, type WatchRoomMessage, type WatchRoomSession } from "../packages/watch-core";
import { WatchVideo } from "./watch-video";

type ChatItem = { id: string; senderId: string; text: string; sentAt: number };
type RoomCredentials = { session: WatchRoomSession; secret: string; proof: string };
type PeerRecord = { connection: RTCPeerConnection; makingOffer: boolean; ignoreOffer: boolean; pendingCandidates: RTCIceCandidateInit[] };
type BridgeMessage = { source?: string; type?: string; payload?: Record<string, unknown> };

const emojiChoices = ["❤️", "😂", "😮", "👏", "🔥"];

function getFragment() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  return { secret: params.get("key") || "", proof: params.get("proof") || "", provider: params.get("provider") || "generic" };
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function WatchRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  const [fragment, setFragment] = useState({ secret: "", proof: "", provider: "generic" });
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState<WatchParticipant[]>([]);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState("");
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "recovering" | "ended">("connecting");
  const [extensionState, setExtensionState] = useState<"checking" | "ready" | "missing" | "player">("checking");
  const [playback, setPlayback] = useState({ title: "Waiting for a streaming tab", currentTime: 0, duration: 0, paused: true, provider: fragment.provider });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [relayAvailable, setRelayAvailable] = useState(false);
  const [reaction, setReaction] = useState<{ emoji: string; id: string } | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const participantsRef = useRef<WatchParticipant[]>([]);
  const peersRef = useRef(new Map<string, PeerRecord>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: ["stun:stun.cloudflare.com:3478"] }]);
  const lastSeqRef = useRef(0);
  const stoppedRef = useRef(false);
  const sendingRef = useRef(false);

  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  useEffect(() => {
    const found = getFragment();
    const saved = loadRoomSession(roomId);
    const frame = requestAnimationFrame(() => {
      setFragment(found);
      if (saved?.secret === found.secret || (saved && !found.secret)) {
        setCredentials(saved);
        setParticipants(saved.session.participants);
      }
      window.postMessage({ source: "TRENITH_WATCH_WEB", command: "ping" }, location.origin);
    });
    const timeout = window.setTimeout(() => setExtensionState((state) => state === "checking" ? "missing" : state), 1200);
    return () => { cancelAnimationFrame(frame); clearTimeout(timeout); };
  }, [roomId]);

  const provider = useMemo(() => WATCH_PROVIDERS.find((item) => item.id === (credentials?.session.provider || fragment.provider)) || WATCH_PROVIDERS.at(-1)!, [credentials, fragment.provider]);
  const self = participants.find((item) => item.id === credentials?.session.participantId);
  const canControl = credentials?.session.controlMode === "everyone" || credentials?.session.role === "host";

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!fragment.secret || !fragment.proof) return setError("This invitation link is incomplete. Ask the host to copy it again.");
    setJoining(true);
    setError("");
    try {
      const session = await joinRoom(roomId, { displayName: name, inviteProof: fragment.proof });
      const next = { session, secret: fragment.secret, proof: fragment.proof };
      saveRoomSession(session, fragment.secret, fragment.proof);
      setCredentials(next);
      setParticipants(session.participants);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be joined.");
      setJoining(false);
    }
  }

  const broadcast = useCallback(async (roomMessage: WatchRoomMessage, targetId?: string) => {
    if (!credentials) return;
    const key = keyRef.current || await importWatchRoomKey(credentials.secret);
    keyRef.current = key;
    const payload = await encryptWatchMessage(key, roomMessage);
    await sendRoomEvent(roomId, credentials.session.participantToken, payload, targetId);
  }, [credentials, roomId]);

  const negotiate = useCallback(async (peerId: string, record: PeerRecord) => {
    if (record.makingOffer || record.connection.signalingState !== "stable") return;
    try {
      record.makingOffer = true;
      await record.connection.setLocalDescription();
      if (record.connection.localDescription) await broadcast({ type: "peer-offer", targetId: peerId, description: record.connection.localDescription }, peerId);
    } finally {
      record.makingOffer = false;
    }
  }, [broadcast]);

  const ensurePeer = useCallback((peerId: string) => {
    const existing = peersRef.current.get(peerId);
    if (existing) return existing;
    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current, iceCandidatePoolSize: 4 });
    const record: PeerRecord = { connection, makingOffer: false, ignoreOffer: false, pendingCandidates: [] };
    peersRef.current.set(peerId, record);
    for (const track of localStreamRef.current?.getTracks() || []) connection.addTrack(track, localStreamRef.current!);
    connection.onicecandidate = (event) => {
      if (event.candidate) void broadcast({ type: "peer-ice", targetId: peerId, candidate: event.candidate.toJSON() }, peerId);
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
    };
    connection.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(connection.connectionState)) {
        connection.close();
        peersRef.current.delete(peerId);
        setRemoteStreams((current) => { const copy = { ...current }; delete copy[peerId]; return copy; });
      }
    };
    connection.onnegotiationneeded = () => void negotiate(peerId, record);
    return record;
  }, [broadcast, negotiate]);

  const handleSignal = useCallback(async (senderId: string, roomMessage: WatchRoomMessage) => {
    if (!credentials || senderId === credentials.session.participantId) return;
    if (roomMessage.type === "peer-offer") {
      const record = ensurePeer(senderId);
      const collision = record.makingOffer || record.connection.signalingState !== "stable";
      const polite = credentials.session.participantId > senderId;
      record.ignoreOffer = !polite && collision;
      if (record.ignoreOffer) return;
      if (collision) await record.connection.setLocalDescription({ type: "rollback" });
      await record.connection.setRemoteDescription(roomMessage.description);
      for (const candidate of record.pendingCandidates.splice(0)) await record.connection.addIceCandidate(candidate);
      await record.connection.setLocalDescription(await record.connection.createAnswer());
      await broadcast({ type: "peer-answer", targetId: senderId, description: record.connection.localDescription! }, senderId);
    } else if (roomMessage.type === "peer-answer") {
      const record = ensurePeer(senderId);
      if (record.connection.signalingState === "have-local-offer") {
        await record.connection.setRemoteDescription(roomMessage.description);
        for (const candidate of record.pendingCandidates.splice(0)) await record.connection.addIceCandidate(candidate);
      }
    } else if (roomMessage.type === "peer-ice") {
      const record = ensurePeer(senderId);
      if (!record.connection.remoteDescription) record.pendingCandidates.push(roomMessage.candidate);
      else try { await record.connection.addIceCandidate(roomMessage.candidate); } catch (caught) { if (!record.ignoreOffer) throw caught; }
    } else if (roomMessage.type === "chat") {
      setChat((items) => items.some((item) => item.id === roomMessage.id) ? items : [...items.slice(-199), { ...roomMessage, senderId }]);
    } else if (roomMessage.type === "reaction") {
      setReaction({ emoji: roomMessage.emoji, id: `${senderId}-${roomMessage.sentAt}` });
      window.setTimeout(() => setReaction(null), 1800);
    } else if (roomMessage.type === "playback") {
      window.postMessage({ source: "TRENITH_WATCH_WEB", command: "apply-playback", payload: roomMessage }, location.origin);
      setPlayback((current) => ({ ...current, currentTime: roomMessage.currentTime, paused: roomMessage.action === "pause" ? true : roomMessage.action === "play" ? false : current.paused }));
    } else if (roomMessage.type === "content-change") {
      setPlayback((current) => ({ ...current, title: roomMessage.title || "Streaming title" }));
    } else if (roomMessage.type === "room-ended") {
      setConnectionState("ended");
    }
  }, [broadcast, credentials, ensurePeer]);

  useEffect(() => {
    if (!credentials) return;
    stoppedRef.current = false;
    let controller: AbortController | null = null;
    let timer = 0;
    let failures = 0;
    void importWatchRoomKey(credentials.secret).then((key) => { keyRef.current = key; });
    void getIceServers(roomId, credentials.session.participantToken).then((result) => {
      iceServersRef.current = result.iceServers;
      setRelayAvailable(result.relay);
    }).catch(() => undefined);

    const poll = async () => {
      if (stoppedRef.current) return;
      controller = new AbortController();
      try {
        const result = await getRoomEvents(roomId, credentials.session.participantToken, lastSeqRef.current, controller.signal);
        failures = 0;
        setConnectionState("connected");
        setParticipants(result.participants);
        const activeIds = new Set(result.participants.map((item) => item.id));
        for (const [peerId, record] of peersRef.current) if (!activeIds.has(peerId)) { record.connection.close(); peersRef.current.delete(peerId); }
        for (const event of result.events) {
          lastSeqRef.current = Math.max(lastSeqRef.current, event.seq);
          if (event.senderId === credentials.session.participantId) continue;
          try {
            const key = keyRef.current || await importWatchRoomKey(credentials.secret);
            keyRef.current = key;
            await handleSignal(event.senderId, await decryptWatchMessage(key, event.payload));
          } catch { /* A malformed or differently keyed event is ignored. */ }
        }
      } catch (caught) {
        if ((caught as Error).name === "AbortError") return;
        failures += 1;
        setConnectionState(failures > 2 ? "recovering" : "connecting");
        if (/ended|expired|authorization/i.test((caught as Error).message)) setConnectionState("ended");
      }
      timer = window.setTimeout(poll, Math.min(4000, 700 + failures * 650));
    };
    void poll();
    return () => { stoppedRef.current = true; controller?.abort(); clearTimeout(timer); };
  }, [credentials, handleSignal, roomId]);

  useEffect(() => {
    if (!credentials || participants.length > WATCH_MEDIA_PARTICIPANT_LIMIT) return;
    for (const participant of participants) {
      if (participant.id !== credentials.session.participantId && credentials.session.participantId < participant.id) ensurePeer(participant.id);
    }
  }, [credentials, ensurePeer, participants]);

  useEffect(() => {
    function receive(event: MessageEvent<BridgeMessage>) {
      if (event.source !== window || event.data?.source !== "TRENITH_WATCH_EXTENSION") return;
      if (event.data.type === "extension-ready") setExtensionState("ready");
      if (event.data.type === "player-status") {
        setExtensionState("player");
        const payload = event.data.payload || {};
        setPlayback({ title: String(payload.title || "Streaming title"), currentTime: Number(payload.currentTime || 0), duration: Number(payload.duration || 0), paused: Boolean(payload.paused), provider: String(payload.provider || provider.id) });
      }
      if (event.data.type === "playback-event" && canControl && !sendingRef.current) {
        const payload = event.data.payload || {};
        const action = String(payload.action || "snapshot") as "play" | "pause" | "seek" | "snapshot";
        sendingRef.current = true;
        void broadcast({ type: "playback", action, currentTime: Number(payload.currentTime || 0), playbackRate: Number(payload.playbackRate || 1), sentAt: Date.now(), contentKey: String(payload.contentKey || "unknown") }).finally(() => { sendingRef.current = false; });
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [broadcast, canControl, credentials, provider.id]);

  useEffect(() => () => {
    for (const record of peersRef.current.values()) record.connection.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (credentials) void leaveRoom(roomId, credentials.session.participantToken).catch(() => undefined);
  }, [credentials, roomId]);

  async function addMedia(kind: "audio" | "video") {
    if (participants.length > WATCH_MEDIA_PARTICIPANT_LIMIT) return setMediaError(`Voice and video are limited to ${WATCH_MEDIA_PARTICIPANT_LIMIT} people per room.`);
    setMediaError("");
    try {
      const existing = localStreamRef.current;
      const currentTrack = existing?.getTracks().find((track) => track.kind === kind);
      if (currentTrack) {
        currentTrack.enabled = !currentTrack.enabled;
        if (kind === "audio") setMicOn(currentTrack.enabled); else setCameraOn(currentTrack.enabled);
        void broadcast({ type: "media-state", microphone: kind === "audio" ? currentTrack.enabled : micOn, camera: kind === "video" ? currentTrack.enabled : cameraOn });
        return;
      }
      const media = await navigator.mediaDevices.getUserMedia({ audio: kind === "audio", video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
      const stream = existing || new MediaStream();
      for (const track of media.getTracks()) {
        stream.addTrack(track);
        for (const record of peersRef.current.values()) record.connection.addTrack(track, stream);
      }
      setLocalStream(stream);
      if (kind === "audio") setMicOn(true); else setCameraOn(true);
      void broadcast({ type: "media-state", microphone: kind === "audio" ? true : micOn, camera: kind === "video" ? true : cameraOn });
    } catch (caught) {
      setMediaError(caught instanceof DOMException && caught.name === "NotAllowedError" ? "Camera or microphone permission was denied. You can change it in the browser site controls." : "This device could not start the requested camera or microphone.");
    }
  }

  async function submitChat(event: FormEvent) {
    event.preventDefault();
    const text = message.trim().slice(0, 1000);
    if (!text || !credentials) return;
    const item = { id: crypto.randomUUID(), text, sentAt: Date.now() };
    setChat((items) => [...items.slice(-199), { ...item, senderId: credentials.session.participantId }]);
    setMessage("");
    await broadcast({ type: "chat", ...item });
  }

  async function react(emoji: string) {
    setReaction({ emoji, id: crypto.randomUUID() });
    window.setTimeout(() => setReaction(null), 1800);
    await broadcast({ type: "reaction", emoji, sentAt: Date.now() });
  }

  async function copyInvite() {
    const inviteLink = `${location.origin}/watch-together/room/${roomId}#${new URLSearchParams({ key: credentials?.secret || fragment.secret, proof: credentials?.proof || fragment.proof, provider: provider.id }).toString()}`;
    await navigator.clipboard.writeText(inviteLink);
    setError("Invitation copied. The secret stays in the URL fragment and is not sent in HTTP requests.");
  }

  async function exit(end: boolean) {
    if (!credentials) return;
    if (end) { await broadcast({ type: "room-ended", sentAt: Date.now() }); await endRoom(roomId, credentials.session.participantToken); }
    else await leaveRoom(roomId, credentials.session.participantToken);
    clearRoomSession(roomId);
    router.push("/watch-together");
  }

  if (!credentials) return <section className="watch-join-page page-frame">
    <div className="watch-join-copy"><span className="section-kicker">PRIVATE INVITATION</span><h1>Join the room.<br /><em>Bring your own stream.</em></h1><p>Trenith synchronizes playback controls—not the copyrighted video. Sign in to {provider.name} in your own tab, then connect it with the free browser extension.</p><ul><li>Encrypted chat and reactions</li><li>Optional live camera and microphone</li><li>No Trenith account required</li></ul></div>
    <form className="watch-create-card" onSubmit={join}><div className="watch-form-title"><span>ROOM {roomId.slice(0, 6).toUpperCase()}</span><strong>How should friends see you?</strong><small>This name is visible only inside the temporary room.</small></div><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={32} autoFocus autoComplete="nickname" placeholder="Your name" /></label>{error && <p className="watch-form-error" role="alert">{error}</p>}<button className="watch-create-button" disabled={joining}>{joining ? "Joining securely…" : "Join watch room →"}</button><Link className="watch-text-link" href="/watch-together">Create a different room</Link></form>
  </section>;

  const progress = playback.duration > 0 ? Math.min(100, playback.currentTime / playback.duration * 100) : 0;
  return <div className="watch-room-shell">
    <header className="watch-room-topbar"><div><span className={`watch-live-dot ${connectionState}`} /> <strong>{connectionState === "connected" ? "Room live" : connectionState}</strong><span>{provider.name}</span><code>{roomId.slice(0, 6).toUpperCase()}</code></div><div><button onClick={copyInvite}>Copy invite</button><Link href="/watch-together/supported">Setup help</Link><button className="watch-leave" onClick={() => void exit(credentials.session.role === "host")}>{credentials.session.role === "host" ? "End room" : "Leave"}</button></div></header>
    {connectionState === "ended" && <div className="watch-ended"><strong>This watch room has ended.</strong><Link href="/watch-together">Create another room</Link></div>}
    <main className="watch-room-grid">
      <section className="watch-stage">
        <div className="watch-now-playing"><div><span>NOW SYNCING</span><h1>{playback.title}</h1><p>{provider.name} · Each viewer watches from their own authorized account</p></div><div className={`extension-pill ${extensionState}`}>{extensionState === "player" ? "✓ OTT tab connected" : extensionState === "ready" ? "Extension ready" : extensionState === "missing" ? "Extension not detected" : "Checking extension"}</div></div>
        <div className="watch-player-card">
          <div className="watch-player-art"><div className="watch-signal-rings"><i /><i /><i /><span>{playback.paused ? "Ⅱ" : "▶"}</span></div><p>The movie stays in your {provider.name} tab.<br />This room carries only timing and social signals.</p></div>
          <div className="watch-timeline"><span>{new Date(playback.currentTime * 1000).toISOString().slice(11, 19)}</span><div><i style={{ width: `${progress}%` }} /></div><span>{playback.duration ? new Date(playback.duration * 1000).toISOString().slice(11, 19) : "--:--:--"}</span></div>
          <div className="watch-player-actions"><button onClick={() => window.postMessage({ source: "TRENITH_WATCH_WEB", command: "connect-player", payload: { provider: provider.id } }, location.origin)}>Connect streaming tab</button><a href={provider.homeUrl} target="_blank" rel="noreferrer">Open {provider.name} ↗</a></div>
        </div>
        <div className="watch-video-section"><div className="watch-section-head"><div><span>LIVE LOUNGE</span><h2>Camera and voice</h2></div><small>{participants.length <= WATCH_MEDIA_PARTICIPANT_LIMIT ? `Peer-to-peer · ${relayAvailable ? "TURN recovery ready" : "direct connection"}` : `Media paused above ${WATCH_MEDIA_PARTICIPANT_LIMIT} people`}</small></div>
          <div className="watch-video-grid">
            <div className="watch-video-tile local">{localStream && cameraOn ? <WatchVideo stream={localStream} muted label="Your camera" /> : <div className="watch-avatar">{initials(self?.displayName || "You")}</div>}<footer><span>{self?.displayName || "You"} (you)</span><small>{micOn ? "Mic on" : "Muted"}</small></footer></div>
            {Object.entries(remoteStreams).map(([participantId, stream]) => { const participant = participants.find((item) => item.id === participantId); return <div className="watch-video-tile" key={participantId}><WatchVideo stream={stream} label={`${participant?.displayName || "Guest"} camera`} /><footer><span>{participant?.displayName || "Guest"}</span><small>Connected</small></footer></div>; })}
            {participants.filter((item) => item.id !== credentials.session.participantId && !remoteStreams[item.id]).slice(0, 5).map((participant) => <div className="watch-video-tile" key={participant.id}><div className="watch-avatar">{initials(participant.displayName)}</div><footer><span>{participant.displayName}</span><small>Camera off</small></footer></div>)}
          </div>
          <div className="watch-media-controls"><button className={micOn ? "active" : ""} onClick={() => void addMedia("audio")}><span>{micOn ? "●" : "○"}</span>{micOn ? "Mute" : "Microphone"}</button><button className={cameraOn ? "active" : ""} onClick={() => void addMedia("video")}><span>▣</span>{cameraOn ? "Stop camera" : "Camera"}</button><button onClick={() => void react("❤️")}><span>♡</span>React</button></div>{mediaError && <p className="watch-form-error">{mediaError}</p>}
        </div>
      </section>
      <aside className="watch-social-panel"><div className="watch-social-tabs"><strong>Room</strong><span>{participants.length}/{25}</span></div><div className="watch-participant-list">{participants.map((participant) => <div key={participant.id}><span className="watch-small-avatar">{initials(participant.displayName)}</span><p><strong>{participant.displayName}{participant.id === credentials.session.participantId ? " · you" : ""}</strong><small>{participant.role === "host" ? "Host" : "Watching"}</small></p><i className="online" /></div>)}</div><div className="watch-chat" aria-live="polite">{chat.length === 0 && <div className="watch-chat-empty"><span>✦</span><strong>Say hello</strong><p>Messages are encrypted with the invitation key and expire from room storage.</p></div>}{chat.map((item) => { const sender = participants.find((participant) => participant.id === item.senderId); return <article key={item.id}><strong>{sender?.displayName || "Guest"}</strong><p>{item.text}</p><time>{new Date(item.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>; })}</div><div className="watch-reactions">{emojiChoices.map((emoji) => <button key={emoji} onClick={() => void react(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>)}</div><form className="watch-chat-form" onSubmit={submitChat}><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} placeholder="Message the room" rows={2} /><button disabled={!message.trim()} aria-label="Send message">↑</button></form></aside>
    </main>
    {reaction && <div key={reaction.id} className="watch-floating-reaction">{reaction.emoji}</div>}
    {error && <div className="watch-toast" role="status">{error}<button onClick={() => setError("")}>×</button></div>}
  </div>;
}
