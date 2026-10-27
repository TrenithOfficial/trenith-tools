"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearRoomSession, endRoom, getIceServers, getRoomEvents, joinRoom, leaveRoom, loadRoomSession, removeParticipant, saveRoomSession, sendRoomEvent, setRoomLock, transferHost } from "../lib/watch-client";
import { decryptWatchMessage, encryptWatchMessage, importWatchRoomKey } from "../lib/watch-crypto";
import {
  WATCH_HEARTBEAT_MS, WATCH_MEDIA_PARTICIPANT_LIMIT, WATCH_PROVIDERS, WATCH_STATUS_MS, WATCH_SYNC_PARTICIPANT_LIMIT,
  describeDrift, estimateClockOffset, projectPlaybackPosition, smoothClockOffset,
  type PlaybackSnapshot, type WatchParticipant, type WatchPlaybackAction, type WatchRoomMessage, type WatchRoomSession,
} from "../packages/watch-core";
import { WatchVideo } from "./watch-video";

type ChatItem = { id: string; senderId: string; text: string; sentAt: number; system?: boolean };
type RoomCredentials = { session: WatchRoomSession; secret: string; proof: string };
type PeerRecord = { connection: RTCPeerConnection; makingOffer: boolean; ignoreOffer: boolean; pendingCandidates: RTCIceCandidateInit[] };
type BridgeMessage = { source?: string; type?: string; payload?: Record<string, unknown> };
type PlayerState = { title: string; currentTime: number; duration: number; paused: boolean; playbackRate: number; provider: string; contentKey: string; adapter: string; connected: boolean };
type PeerStatus = PlaybackSnapshot & { contentKey: string; connected: boolean; receivedAt: number };

const emojiChoices = ["❤️", "😂", "😮", "👏", "🔥"];

function getFragment() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  return { secret: params.get("key") || "", proof: params.get("proof") || "", provider: params.get("provider") || "generic" };
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--:--";
  return new Date(seconds * 1000).toISOString().slice(11, 19);
}

export function WatchRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  const [fragment, setFragment] = useState({ secret: "", proof: "", provider: "generic" });
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [participants, setParticipants] = useState<WatchParticipant[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [controlMode, setControlMode] = useState<"host" | "everyone">("host");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState("");
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "recovering" | "ended" | "removed">("connecting");
  const [extensionState, setExtensionState] = useState<"checking" | "ready" | "missing" | "player">("checking");
  const [player, setPlayer] = useState<PlayerState>({ title: "Waiting for a streaming tab", currentTime: 0, duration: 0, paused: true, playbackRate: 1, provider: "generic", contentKey: "", adapter: "html5", connected: false });
  const [peerStatus, setPeerStatus] = useState<Record<string, PeerStatus>>({});
  const [peerMedia, setPeerMedia] = useState<Record<string, { microphone: boolean; camera: boolean }>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = useState(false);
  const [mediaPending, setMediaPending] = useState<"audio" | "video" | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [relayAvailable, setRelayAvailable] = useState(false);
  const [reactions, setReactions] = useState<Array<{ emoji: string; id: string; left: number }>>([]);
  // Local and server-aligned wall clock, refreshed once a second so the drift
  // roster re-renders with current projections without touching refs or
  // Date.now() during render. Zero until the first tick.
  const [wallClock, setWallClock] = useState({ local: 0, server: 0 });
  const keyRef = useRef<CryptoKey | null>(null);
  const participantsRef = useRef<WatchParticipant[]>([]);
  const peersRef = useRef(new Map<string, PeerRecord>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: ["stun:stun.cloudflare.com:3478"] }]);
  const lastSeqRef = useRef(0);
  const stoppedRef = useRef(false);
  const sendingRef = useRef(false);
  const offsetRef = useRef<number | null>(null);
  const playerRef = useRef(player);
  const lastHeartbeatRef = useRef(0);
  const lastStatusRef = useRef(0);
  const hostIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { participantsRef.current = participants; }, [participants]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { hostIdRef.current = hostId; }, [hostId]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: "end" }); }, [chat]);
  // Re-render the drift table every second so projected positions stay current.
  useEffect(() => {
    const update = () => setWallClock({ local: Date.now(), server: Date.now() + (offsetRef.current ?? 0) });
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const found = getFragment();
    const saved = loadRoomSession(roomId);
    const frame = requestAnimationFrame(() => {
      setFragment(found);
      if (saved?.secret === found.secret || (saved && !found.secret)) {
        setCredentials(saved);
        setParticipants(saved.session.participants);
        setControlMode(saved.session.controlMode);
      }
      window.postMessage({ source: "TRENITH_WATCH_WEB", command: "ping" }, location.origin);
    });
    const timeout = window.setTimeout(() => setExtensionState((state) => state === "checking" ? "missing" : state), 1200);
    return () => { cancelAnimationFrame(frame); clearTimeout(timeout); };
  }, [roomId]);

  const provider = useMemo(() => WATCH_PROVIDERS.find((item) => item.id === (credentials?.session.provider || fragment.provider)) || WATCH_PROVIDERS.at(-1)!, [credentials, fragment.provider]);
  const selfId = credentials?.session.participantId;
  const self = participants.find((item) => item.id === selfId);
  // The roster, not the remembered session, decides who is host: the room can
  // hand over while this tab is open.
  const isHost = Boolean(selfId && (hostId ? hostId === selfId : self?.role === "host"));
  const canControl = controlMode === "everyone" || isHost;
  const serverNow = () => Date.now() + (offsetRef.current ?? 0);

  const systemMessage = useCallback((text: string) => {
    setChat((items) => [...items.slice(-199), { id: crypto.randomUUID(), senderId: "system", text, sentAt: Date.now(), system: true }]);
  }, []);

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
      setControlMode(session.controlMode);
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

  // Apply a remote playback message to the local player, projecting the
  // sender's position forward by the message age so network latency and
  // polling delay are compensated rather than baked into the drift.
  const applyRemotePlayback = useCallback((roomMessage: Extract<WatchRoomMessage, { type: "playback" }>) => {
    const paused = roomMessage.paused ?? roomMessage.action === "pause";
    const projected = projectPlaybackPosition({ currentTime: roomMessage.currentTime, playbackRate: roomMessage.playbackRate, paused, sentAt: roomMessage.sentAt }, serverNow());
    window.postMessage({ source: "TRENITH_WATCH_WEB", command: "apply-playback", payload: { ...roomMessage, currentTime: projected, paused } }, location.origin);
    setPlayer((current) => ({ ...current, currentTime: projected, paused: roomMessage.action === "pause" ? true : roomMessage.action === "play" ? false : paused }));
  }, []);

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
      const id = `${senderId}-${roomMessage.sentAt}`;
      setReactions((current) => [...current.slice(-5), { emoji: roomMessage.emoji, id, left: 20 + Math.random() * 60 }]);
      window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== id)), 1800);
    } else if (roomMessage.type === "playback") {
      // Only the room's controller may steer; in "everyone" mode any member may.
      const senderIsHost = senderId === hostIdRef.current;
      if (controlMode === "everyone" || senderIsHost) applyRemotePlayback(roomMessage);
    } else if (roomMessage.type === "sync-status") {
      const status: PeerStatus = { currentTime: roomMessage.currentTime, playbackRate: roomMessage.playbackRate, paused: roomMessage.paused, sentAt: roomMessage.sentAt, contentKey: roomMessage.contentKey, connected: roomMessage.connected, receivedAt: Date.now() };
      setPeerStatus((current) => ({ ...current, [senderId]: status }));
    } else if (roomMessage.type === "media-state") {
      setPeerMedia((current) => ({ ...current, [senderId]: { microphone: roomMessage.microphone, camera: roomMessage.camera } }));
    } else if (roomMessage.type === "content-change") {
      setPlayer((current) => ({ ...current, title: roomMessage.title || "Streaming title" }));
    } else if (roomMessage.type === "room-locked") {
      setLocked(roomMessage.locked);
      systemMessage(roomMessage.locked ? "The host locked the room. No one else can join." : "The host unlocked the room.");
    } else if (roomMessage.type === "kick") {
      if (roomMessage.participantId === credentials.session.participantId) { setConnectionState("removed"); stoppedRef.current = true; }
    } else if (roomMessage.type === "room-ended") {
      setConnectionState("ended");
    }
  }, [applyRemotePlayback, broadcast, controlMode, credentials, ensurePeer, systemMessage]);

  useEffect(() => {
    if (!credentials) return;
    stoppedRef.current = false;
    let controller: AbortController | null = null;
    let timer = 0;
    let failures = 0;
    let knownIds = new Set(participantsRef.current.map((item) => item.id));
    let knownHost: string | null = null;
    void importWatchRoomKey(credentials.secret).then((key) => { keyRef.current = key; });
    void getIceServers(roomId, credentials.session.participantToken).then((result) => {
      iceServersRef.current = result.iceServers;
      setRelayAvailable(result.relay);
    }).catch(() => undefined);

    const poll = async () => {
      if (stoppedRef.current) return;
      controller = new AbortController();
      const sentAt = Date.now();
      try {
        const result = await getRoomEvents(roomId, credentials.session.participantToken, lastSeqRef.current, controller.signal);
        offsetRef.current = smoothClockOffset(offsetRef.current, estimateClockOffset(sentAt, result.serverTime, Date.now()));
        failures = 0;
        setConnectionState("connected");
        setParticipants(result.participants);
        setLocked(result.locked);
        setControlMode(result.controlMode);
        setHostId(result.hostId);
        hostIdRef.current = result.hostId;
        // Roster diffs become system lines so arrivals, departures and
        // handovers are visible without anyone typing.
        const nextIds = new Set(result.participants.map((item) => item.id));
        for (const participant of result.participants) if (!knownIds.has(participant.id) && participant.id !== credentials.session.participantId && knownIds.size) systemMessage(`${participant.displayName} joined`);
        for (const participant of participantsRef.current) if (!nextIds.has(participant.id) && participant.id !== credentials.session.participantId) systemMessage(`${participant.displayName} left`);
        if (knownHost && result.hostId && result.hostId !== knownHost) {
          const promoted = result.participants.find((item) => item.id === result.hostId);
          systemMessage(result.hostId === credentials.session.participantId ? "You are now the host" : `${promoted?.displayName || "A participant"} is now the host`);
        }
        knownHost = result.hostId;
        knownIds = nextIds;
        participantsRef.current = result.participants;
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
        if (/ended|expired/i.test((caught as Error).message)) setConnectionState("ended");
        if (/authorization/i.test((caught as Error).message)) setConnectionState((state) => state === "removed" ? state : "ended");
      }
      if (stoppedRef.current) return;
      // Poll faster while the player is running so remote play/pause/seek land
      // within a fraction of a second; idle rooms back off to save battery.
      const idle = playerRef.current.paused && !document.hasFocus();
      const base = playerRef.current.connected && !playerRef.current.paused ? 450 : idle ? 2500 : 900;
      timer = window.setTimeout(poll, Math.min(5000, base + failures * 650));
    };
    void poll();
    return () => { stoppedRef.current = true; controller?.abort(); clearTimeout(timer); };
  }, [credentials, handleSignal, roomId, systemMessage]);

  useEffect(() => {
    if (!credentials || participants.length > WATCH_MEDIA_PARTICIPANT_LIMIT) return;
    for (const participant of participants) {
      if (participant.id !== credentials.session.participantId) ensurePeer(participant.id);
    }
  }, [credentials, ensurePeer, participants]);

  useEffect(() => {
    function receive(event: MessageEvent<BridgeMessage>) {
      if (event.source !== window || event.data?.source !== "TRENITH_WATCH_EXTENSION") return;
      if (event.data.type === "extension-ready") setExtensionState((state) => state === "player" ? state : "ready");
      if (event.data.type === "connect-help") {
        const payload = (event.data.payload || {}) as { opened?: boolean; error?: string };
        if (!payload.opened) setError(payload.error || "Open your streaming tab, then click the Trenith extension icon to connect it.");
      }
      if (event.data.type === "playback-result") {
        const payload = (event.data.payload || {}) as { applied?: boolean; error?: string };
        if (payload.applied === false && payload.error) setError(payload.error);
      }
      if (event.data.type === "player-disconnected") { setExtensionState("ready"); setPlayer((current) => ({ ...current, connected: false })); }
      if (event.data.type === "player-status") {
        setExtensionState("player");
        const payload = event.data.payload || {};
        const next: PlayerState = { title: String(payload.title || "Streaming title"), currentTime: Number(payload.currentTime || 0), duration: Number(payload.duration || 0), paused: Boolean(payload.paused), playbackRate: Number(payload.playbackRate || 1), provider: String(payload.provider || provider.id), contentKey: String(payload.contentKey || ""), adapter: String(payload.adapter || "html5"), connected: payload.connected !== false };
        setPlayer(next);
        const now = Date.now();
        // Everyone reports position for the roster; the controller additionally
        // re-broadcasts its position while playing so guests converge.
        if (credentials && next.connected && now - lastStatusRef.current > WATCH_STATUS_MS - 300) {
          lastStatusRef.current = now;
          void broadcast({ type: "sync-status", currentTime: next.currentTime, paused: next.paused, playbackRate: next.playbackRate, contentKey: next.contentKey, connected: true, sentAt: serverNow() });
        }
        const controller = hostIdRef.current ? hostIdRef.current === credentials?.session.participantId : false;
        if (credentials && controller && next.connected && !next.paused && now - lastHeartbeatRef.current > WATCH_HEARTBEAT_MS - 300 && !sendingRef.current) {
          lastHeartbeatRef.current = now;
          void broadcast({ type: "playback", action: "snapshot", currentTime: next.currentTime, playbackRate: next.playbackRate, paused: false, sentAt: serverNow(), contentKey: next.contentKey });
        }
      }
      if (event.data.type === "playback-event" && canControl && !sendingRef.current) {
        const payload = event.data.payload || {};
        const action = String(payload.action || "snapshot") as WatchPlaybackAction;
        sendingRef.current = true;
        void broadcast({ type: "playback", action, currentTime: Number(payload.currentTime || 0), playbackRate: Number(payload.playbackRate || 1), paused: action === "pause" ? true : action === "play" ? false : Boolean(payload.paused), sentAt: serverNow(), contentKey: String(payload.contentKey || "unknown") }).finally(() => { sendingRef.current = false; });
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
      setMediaPending(kind);
      const media = await navigator.mediaDevices.getUserMedia({ audio: kind === "audio" ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false, video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false });
      const stream = existing || new MediaStream();
      for (const track of media.getTracks()) stream.addTrack(track);
      localStreamRef.current = stream;
      for (const participant of participantsRef.current) {
        if (participant.id === credentials?.session.participantId) continue;
        const record = ensurePeer(participant.id);
        for (const track of media.getTracks()) {
          if (!record.connection.getSenders().some((sender) => sender.track === track)) record.connection.addTrack(track, stream);
        }
      }
      setLocalStream(stream);
      if (kind === "audio") setMicOn(true); else setCameraOn(true);
      void broadcast({ type: "media-state", microphone: kind === "audio" ? true : micOn, camera: kind === "video" ? true : cameraOn });
    } catch (caught) {
      const device = kind === "audio" ? "microphone" : "camera";
      const name = caught instanceof DOMException ? caught.name : "";
      setMediaError(
        name === "NotAllowedError" ? `Access to your ${device} was blocked. Click the camera/microphone icon in the browser address bar to allow it — on macOS also check System Settings → Privacy & Security → ${kind === "audio" ? "Microphone" : "Camera"} for your browser.`
        : name === "NotFoundError" || name === "OverconstrainedError" ? `No ${device} was found on this device.`
        : name === "NotReadableError" ? `Your ${device} is already in use by another app. Close the other app, then try again.`
        : `This device could not start the ${device}.`,
      );
    } finally {
      setMediaPending(null);
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
    const id = crypto.randomUUID();
    setReactions((current) => [...current.slice(-5), { emoji, id, left: 20 + Math.random() * 60 }]);
    window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== id)), 1800);
    await broadcast({ type: "reaction", emoji, sentAt: Date.now() });
  }

  async function copyInvite() {
    const inviteLink = `${location.origin}/watch-together/room/${roomId}#${new URLSearchParams({ key: credentials?.secret || fragment.secret, proof: credentials?.proof || fragment.proof, provider: provider.id }).toString()}`;
    await navigator.clipboard.writeText(inviteLink);
    setError("Invitation copied. The secret stays in the URL fragment and is not sent in HTTP requests.");
  }

  async function resyncEveryone() {
    const current = playerRef.current;
    if (!current.connected) return setError("Connect your streaming tab first, then everyone can be pulled to your position.");
    await broadcast({ type: "playback", action: "snapshot", currentTime: current.currentTime, playbackRate: current.playbackRate, paused: current.paused, sentAt: serverNow(), contentKey: current.contentKey });
    systemMessage("You pulled everyone to your position");
  }

  async function hostAction(action: "transfer" | "remove", participant: WatchParticipant) {
    if (!credentials) return;
    try {
      if (action === "transfer") {
        await transferHost(roomId, credentials.session.participantToken, participant.id);
        await broadcast({ type: "host-transfer", participantId: participant.id });
        setHostId(participant.id);
        systemMessage(`${participant.displayName} is now the host`);
      } else {
        await broadcast({ type: "kick", participantId: participant.id });
        await removeParticipant(roomId, credentials.session.participantToken, participant.id);
        systemMessage(`${participant.displayName} was removed`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room action failed.");
    }
  }

  async function toggleLock() {
    if (!credentials) return;
    try {
      const result = await setRoomLock(roomId, credentials.session.participantToken, !locked);
      setLocked(result.locked);
      await broadcast({ type: "room-locked", locked: result.locked });
      systemMessage(result.locked ? "You locked the room" : "You unlocked the room");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be locked.");
    }
  }

  async function exit(mode: "leave" | "end") {
    if (!credentials) return;
    if (mode === "end") { await broadcast({ type: "room-ended", sentAt: Date.now() }); await endRoom(roomId, credentials.session.participantToken); }
    else await leaveRoom(roomId, credentials.session.participantToken);
    clearRoomSession(roomId);
    router.push("/watch-together");
  }

  if (!credentials) return <section className="watch-join-page page-frame">
    <div className="watch-join-copy"><span className="section-kicker">PRIVATE INVITATION</span><h1>Join the room.<br /><em>Bring your own stream.</em></h1><p>Trenith synchronizes playback controls—not the copyrighted video. Sign in to {provider.name} in your own tab, then connect it with the free browser extension.</p><ul><li>Encrypted chat and reactions</li><li>Optional live camera and microphone</li><li>No Trenith account required</li></ul></div>
    <form className="watch-create-card" onSubmit={join}><div className="watch-form-title"><span>ROOM {roomId.slice(0, 6).toUpperCase()}</span><strong>How should friends see you?</strong><small>This name is visible only inside the temporary room.</small></div><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={32} autoFocus autoComplete="nickname" placeholder="Your name" /></label>{error && <p className="watch-form-error" role="alert">{error}</p>}<p className="watch-legal-note">By joining, you confirm you are 18+ and agree to the <a href="/terms">Watch Together terms</a>. You need your own lawful access to {provider.name}. If you turn on your camera or microphone, your network address can become visible to others in the room.</p><button className="watch-create-button" disabled={joining}>{joining ? "Joining securely…" : "Join watch room →"}</button><Link className="watch-text-link" href="/watch-together">Create a different room</Link></form>
  </section>;

  const progress = player.duration > 0 ? Math.min(100, player.currentTime / player.duration * 100) : 0;
  const nowServer = wallClock.server;
  const clockReady = wallClock.server > 0;
  const referenceStatus: PlaybackSnapshot | null = !clockReady ? null : isHost
    ? (player.connected ? { currentTime: player.currentTime, playbackRate: player.playbackRate, paused: player.paused, sentAt: nowServer } : null)
    : (hostId && peerStatus[hostId]) || null;
  const mediaTiles = participants.filter((item) => item.id !== selfId);
  const mediaAllowed = participants.length <= WATCH_MEDIA_PARTICIPANT_LIMIT;

  return <div className="watch-room-shell">
    <header className="watch-room-topbar"><div><span className={`watch-live-dot ${connectionState}`} /> <strong>{connectionState === "connected" ? "Room live" : connectionState === "removed" ? "Removed" : connectionState}</strong><span>{provider.name}</span><code>{roomId.slice(0, 6).toUpperCase()}</code>{locked && <span className="watch-lock-chip">Locked</span>}</div><div><button onClick={copyInvite} disabled={locked}>Copy invite</button>{isHost && <button onClick={() => void toggleLock()}>{locked ? "Unlock room" : "Lock room"}</button>}<Link href="/watch-together/supported">Setup help</Link><button className="watch-leave" onClick={() => void exit("leave")}>Leave</button>{isHost && <button className="watch-leave watch-end" onClick={() => void exit("end")}>End for everyone</button>}</div></header>
    {connectionState === "ended" && <div className="watch-ended"><strong>This watch room has ended.</strong><Link href="/watch-together">Create another room</Link></div>}
    {connectionState === "removed" && <div className="watch-ended"><strong>The host removed you from this room.</strong><Link href="/watch-together">Create your own room</Link></div>}
    <main className="watch-room-grid">
      <section className="watch-stage">
        <div className="watch-now-playing"><div><span>NOW SYNCING</span><h1>{player.title}</h1><p>{provider.name} · {isHost ? "You control playback" : controlMode === "everyone" ? "Everyone can control playback" : `${participants.find((item) => item.id === hostId)?.displayName || "The host"} controls playback`}{player.adapter === "page" ? " · native player adapter" : ""}</p></div><div className={`extension-pill ${extensionState}`}>{extensionState === "player" ? "✓ Streaming tab connected" : extensionState === "ready" ? "Extension ready" : extensionState === "missing" ? "Extension not detected" : "Checking extension"}</div></div>
        <div className="watch-player-card">
          <div className="watch-player-art"><div className="watch-signal-rings"><i /><i /><i /><span>{player.paused ? "Ⅱ" : "▶"}</span></div><p>The movie stays in your {provider.name} tab.<br />This room carries only timing and social signals.</p></div>
          <div className="watch-timeline"><span>{clock(player.currentTime)}</span><div><i style={{ width: `${progress}%` }} /></div><span>{player.duration ? clock(player.duration) : "--:--:--"}</span></div>
          <div className="watch-player-actions"><button onClick={() => window.postMessage({ source: "TRENITH_WATCH_WEB", command: "connect-player", payload: { provider: provider.id } }, location.origin)}>Connect streaming tab</button><a href={provider.homeUrl} target="_blank" rel="noreferrer">Open {provider.name} ↗</a>{isHost && <button onClick={() => void resyncEveryone()} disabled={!player.connected}>Resync everyone</button>}{extensionState === "missing" && <Link href="/watch-together/supported#setup">Install the companion</Link>}</div>
        </div>
        <div className="watch-video-section"><div className="watch-section-head"><div><span>LIVE LOUNGE</span><h2>Camera and voice</h2></div><small>{mediaAllowed ? `Peer-to-peer · ${relayAvailable ? "TURN recovery ready" : "direct connection"}` : `Media paused above ${WATCH_MEDIA_PARTICIPANT_LIMIT} people`}</small></div>
          <div className="watch-video-grid">
            <div className="watch-video-tile local">{localStream && cameraOn ? <WatchVideo stream={localStream} muted label="Your camera" /> : <div className="watch-avatar">{initials(self?.displayName || "You")}</div>}<footer><span>{self?.displayName || "You"} (you)</span><small>{micOn ? "Mic on" : "Muted"}</small></footer></div>
            {mediaTiles.slice(0, WATCH_MEDIA_PARTICIPANT_LIMIT - 1).map((participant) => {
              const stream = remoteStreams[participant.id];
              const media = peerMedia[participant.id];
              const showVideo = stream && (media ? media.camera : stream.getVideoTracks().some((track) => track.enabled && !track.muted));
              return <div className="watch-video-tile" key={participant.id}>{showVideo ? <WatchVideo stream={stream} label={`${participant.displayName} camera`} /> : <>{stream && <WatchVideo stream={stream} label={`${participant.displayName} audio`} hidden />}<div className="watch-avatar">{initials(participant.displayName)}</div></>}<footer><span>{participant.displayName}</span><small>{media?.microphone ? "Mic on" : stream ? "Muted" : "Camera off"}</small></footer></div>;
            })}
          </div>
          <div className="watch-media-controls"><button className={micOn ? "active" : ""} disabled={mediaPending === "audio"} onClick={() => void addMedia("audio")}><span>{micOn ? "●" : "○"}</span>{mediaPending === "audio" ? "Allow access…" : micOn ? "Mute" : "Microphone"}</button><button className={cameraOn ? "active" : ""} disabled={mediaPending === "video"} onClick={() => void addMedia("video")}><span>▣</span>{mediaPending === "video" ? "Allow access…" : cameraOn ? "Stop camera" : "Camera"}</button><button onClick={() => void react("❤️")}><span>♡</span>React</button></div>{mediaError && <p className="watch-form-error">{mediaError}</p>}
        </div>
      </section>
      <aside className="watch-social-panel">
        <div className="watch-social-tabs"><strong>Room</strong><span>{participants.length}/{WATCH_SYNC_PARTICIPANT_LIMIT}</span></div>
        <div className="watch-participant-list">{participants.map((participant) => {
          const status = participant.id === selfId ? (player.connected ? { currentTime: player.currentTime, playbackRate: player.playbackRate, paused: player.paused, sentAt: nowServer, contentKey: player.contentKey, connected: true, receivedAt: wallClock.local } : null) : peerStatus[participant.id] || null;
          const stale = !clockReady || (status && wallClock.local - status.receivedAt > WATCH_STATUS_MS * 3);
          const drift = participant.id === hostId ? null : describeDrift(stale ? null : status, referenceStatus, nowServer);
          const differentTitle = status && referenceStatus && player.contentKey && status.contentKey && participant.id !== selfId && status.contentKey !== player.contentKey;
          return <div key={participant.id} className={participant.id === hostId ? "is-host" : ""}><span className="watch-small-avatar">{initials(participant.displayName)}</span><p><strong>{participant.displayName}{participant.id === selfId ? " · you" : ""}</strong><small>{participant.id === hostId ? "Host" : "Watching"}{status && !stale ? ` · ${status.paused ? "Ⅱ" : "▶"} ${clock(projectPlaybackPosition(status, nowServer))}` : " · no player"}{differentTitle ? " · different title" : drift && drift.label !== "unknown" ? ` · ${drift.label === "in sync" ? "in sync" : drift.label === "paused" ? (status?.paused ? "paused" : "playing") : `${Math.abs(drift.seconds).toFixed(1)}s ${drift.label}`}` : ""}</small></p>{isHost && participant.id !== selfId ? <span className="watch-host-actions"><button onClick={() => void hostAction("transfer", participant)} title="Make host">★</button><button onClick={() => void hostAction("remove", participant)} title="Remove">×</button></span> : <i className={drift?.label === "in sync" || participant.id === hostId ? "online" : drift?.label === "unknown" ? "" : "drifting"} />}</div>;
        })}</div>
        <div className="watch-chat" aria-live="polite">{chat.length === 0 && <div className="watch-chat-empty"><span>✦</span><strong>Say hello</strong><p>Messages are encrypted with the invitation key and expire from room storage.</p></div>}{chat.map((item) => { if (item.system) return <article key={item.id} className="system"><p>{item.text}</p></article>; const sender = participants.find((participant) => participant.id === item.senderId); return <article key={item.id}><strong>{sender?.displayName || "Guest"}</strong><p>{item.text}</p><time>{new Date(item.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>; })}<div ref={chatEndRef} /></div>
        <div className="watch-reactions">{emojiChoices.map((emoji) => <button key={emoji} onClick={() => void react(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>)}</div>
        <form className="watch-chat-form" onSubmit={submitChat}><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitChat(event as unknown as FormEvent); } }} maxLength={1000} placeholder="Message the room" rows={2} /><button disabled={!message.trim()} aria-label="Send message">↑</button></form>
      </aside>
    </main>
    {reactions.map((item) => <div key={item.id} className="watch-floating-reaction" style={{ left: `${item.left}%` }}>{item.emoji}</div>)}
    {error && <div className="watch-toast" role="status">{error}<button onClick={() => setError("")}>×</button></div>}
  </div>;
}
