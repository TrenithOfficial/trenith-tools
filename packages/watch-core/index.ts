export const WATCH_PROTOCOL_VERSION = 2;
export const WATCH_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
export const WATCH_EVENT_TTL_MS = 10 * 60 * 1000;
export const WATCH_SYNC_PARTICIPANT_LIMIT = 25;
export const WATCH_MEDIA_PARTICIPANT_LIMIT = 6;
export const WATCH_MAX_EVENT_BYTES = 64 * 1024;
// The host re-broadcasts its player position this often while playing so late
// joiners and buffering guests converge without anyone touching the controls.
export const WATCH_HEARTBEAT_MS = 5000;
// Every connected participant reports its own position this often; the roster
// shows who is ahead or behind and the host can resync everyone in one click.
export const WATCH_STATUS_MS = 6000;
// Remote positions closer than this are left alone; seeking for tiny drifts
// causes visible stutter without improving the shared experience.
export const WATCH_DRIFT_TOLERANCE_MS = 750;

export type WatchControlMode = "host" | "everyone";
export type WatchRole = "host" | "guest";
export type WatchProviderId =
  | "youtube"
  | "netflix"
  | "prime-video"
  | "jiohotstar"
  | "disney-plus"
  | "max"
  | "hulu"
  | "peacock"
  | "paramount-plus"
  | "apple-tv"
  | "crunchyroll"
  | "sonyliv"
  | "zee5"
  | "tubi"
  | "pluto-tv"
  | "generic";

export type WatchProvider = {
  id: WatchProviderId;
  name: string;
  homeUrl: string;
  hosts: string[];
  region: "global" | "india" | "us" | "regional";
  support: "launch" | "next" | "beta";
};

// Where people actually install the companion. Chrome and Edge both install
// from the Chrome Web Store listing; Firefox has no signed build yet.
export const WATCH_EXTENSION_STORE_URL = "https://chromewebstore.google.com/detail/trenith-watch-together/kfeooodicmideabhlmimaijjfkjhfojg";

export const WATCH_PROVIDERS: WatchProvider[] = [
  { id: "youtube", name: "YouTube", homeUrl: "https://www.youtube.com/", hosts: ["youtube.com", "youtu.be"], region: "global", support: "launch" },
  { id: "netflix", name: "Netflix", homeUrl: "https://www.netflix.com/browse", hosts: ["netflix.com"], region: "global", support: "launch" },
  { id: "prime-video", name: "Prime Video", homeUrl: "https://www.primevideo.com/", hosts: ["primevideo.com", "amazon.com"], region: "global", support: "launch" },
  { id: "jiohotstar", name: "JioHotstar", homeUrl: "https://www.hotstar.com/in", hosts: ["hotstar.com"], region: "india", support: "launch" },
  { id: "disney-plus", name: "Disney+", homeUrl: "https://www.disneyplus.com/", hosts: ["disneyplus.com"], region: "global", support: "next" },
  { id: "max", name: "Max", homeUrl: "https://www.max.com/", hosts: ["max.com", "hbomax.com"], region: "global", support: "next" },
  { id: "hulu", name: "Hulu", homeUrl: "https://www.hulu.com/", hosts: ["hulu.com"], region: "us", support: "next" },
  { id: "peacock", name: "Peacock", homeUrl: "https://www.peacocktv.com/", hosts: ["peacocktv.com"], region: "us", support: "next" },
  { id: "paramount-plus", name: "Paramount+", homeUrl: "https://www.paramountplus.com/", hosts: ["paramountplus.com"], region: "regional", support: "next" },
  { id: "apple-tv", name: "Apple TV+", homeUrl: "https://tv.apple.com/", hosts: ["tv.apple.com"], region: "global", support: "next" },
  { id: "crunchyroll", name: "Crunchyroll", homeUrl: "https://www.crunchyroll.com/", hosts: ["crunchyroll.com"], region: "global", support: "next" },
  { id: "sonyliv", name: "SonyLIV", homeUrl: "https://www.sonyliv.com/", hosts: ["sonyliv.com"], region: "india", support: "next" },
  { id: "zee5", name: "ZEE5", homeUrl: "https://www.zee5.com/", hosts: ["zee5.com"], region: "india", support: "next" },
  { id: "tubi", name: "Tubi", homeUrl: "https://tubitv.com/", hosts: ["tubitv.com"], region: "regional", support: "next" },
  { id: "pluto-tv", name: "Pluto TV", homeUrl: "https://pluto.tv/", hosts: ["pluto.tv"], region: "regional", support: "next" },
  { id: "generic", name: "Other HTML5 player", homeUrl: "https://tools.trenith.com/watch-together/supported", hosts: [], region: "global", support: "beta" },
];

export type WatchParticipant = {
  id: string;
  displayName: string;
  role: WatchRole;
  lastSeenAt: number;
};

export type WatchRoomSession = {
  roomId: string;
  participantId: string;
  participantToken: string;
  role: WatchRole;
  provider: WatchProviderId;
  controlMode: WatchControlMode;
  expiresAt: number;
  participants: WatchParticipant[];
};

export type WatchEncryptedEvent = {
  seq: number;
  senderId: string;
  targetId: string | null;
  payload: string;
  createdAt: number;
};

export type WatchPlaybackAction = "play" | "pause" | "seek" | "snapshot";

export type WatchRoomMessage =
  | { type: "presence"; participant: WatchParticipant }
  | { type: "peer-offer"; targetId: string; description: RTCSessionDescriptionInit }
  | { type: "peer-answer"; targetId: string; description: RTCSessionDescriptionInit }
  | { type: "peer-ice"; targetId: string; candidate: RTCIceCandidateInit }
  | { type: "chat"; id: string; text: string; sentAt: number }
  | { type: "reaction"; emoji: string; sentAt: number }
  // `sentAt` is expressed in server time (the sender adds its measured clock
  // offset) so receivers can project where the sender's player is *now*.
  | { type: "playback"; action: WatchPlaybackAction; currentTime: number; playbackRate: number; paused?: boolean; sentAt: number; contentKey: string }
  | { type: "sync-status"; currentTime: number; paused: boolean; playbackRate: number; contentKey: string; connected: boolean; sentAt: number }
  | { type: "content-change"; contentKey: string; deepLink: string; title: string; sentAt: number }
  | { type: "media-state"; microphone: boolean; camera: boolean }
  | { type: "host-transfer"; participantId: string }
  | { type: "room-locked"; locked: boolean }
  | { type: "kick"; participantId: string }
  | { type: "room-ended"; sentAt: number };

export const WATCH_EVENT_KINDS: ReadonlySet<string> = new Set(["presence", "peer-offer", "peer-answer", "peer-ice", "chat", "reaction", "playback", "sync-status", "content-change", "media-state", "host-transfer", "room-locked", "kick", "room-ended"]);

export function normalizeDisplayName(value: unknown): string {
  const cleaned = String(value ?? "Guest")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  return cleaned || "Guest";
}

export function isWatchRoomId(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,32}$/.test(value);
}

export function isWatchParticipantId(value: string): boolean {
  return /^[A-Za-z0-9_-]{12,24}$/.test(value);
}

export function providerForUrl(value: string): WatchProvider {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return WATCH_PROVIDERS.find((provider) => provider.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) ?? WATCH_PROVIDERS.at(-1)!;
  } catch {
    return WATCH_PROVIDERS.at(-1)!;
  }
}

export function isWatchProviderId(value: string): value is WatchProviderId {
  return WATCH_PROVIDERS.some((provider) => provider.id === value);
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

// --- Clock alignment and position projection (pure, unit-tested) -------------------

// NTP-style offset estimate: the server timestamp is assumed to sit midway
// through the request. Positive means the server clock is ahead of ours.
export function estimateClockOffset(sentLocalMs: number, serverTimeMs: number, receivedLocalMs: number): number {
  return serverTimeMs - (sentLocalMs + receivedLocalMs) / 2;
}

// Exponentially smoothed offset so one slow poll does not jerk every seek.
export function smoothClockOffset(previous: number | null, sample: number): number {
  if (previous === null || !Number.isFinite(previous)) return sample;
  return previous + (sample - previous) * 0.3;
}

export type PlaybackSnapshot = { currentTime: number; playbackRate: number; paused: boolean; sentAt: number };

// Where the sender's player should be now, given the message age. Paused
// players do not advance; rates are bounded to the extension's accepted range.
export function projectPlaybackPosition(snapshot: PlaybackSnapshot, nowServerMs: number): number {
  if (snapshot.paused) return Math.max(0, snapshot.currentTime);
  const rate = Number.isFinite(snapshot.playbackRate) && snapshot.playbackRate >= 0.25 && snapshot.playbackRate <= 4 ? snapshot.playbackRate : 1;
  const ageSeconds = Math.max(0, Math.min(120, (nowServerMs - snapshot.sentAt) / 1000));
  return Math.max(0, snapshot.currentTime + ageSeconds * rate);
}

export type DriftVerdict = { seconds: number; label: "in sync" | "ahead" | "behind" | "paused" | "unknown" };

// Compare a participant's reported position against a reference (usually the
// host), both projected to the same instant.
export function describeDrift(participant: PlaybackSnapshot | null, reference: PlaybackSnapshot | null, nowServerMs: number): DriftVerdict {
  if (!participant || !reference) return { seconds: 0, label: "unknown" };
  const mine = projectPlaybackPosition(participant, nowServerMs);
  const theirs = projectPlaybackPosition(reference, nowServerMs);
  const seconds = mine - theirs;
  if (participant.paused !== reference.paused) return { seconds, label: "paused" };
  if (Math.abs(seconds) * 1000 <= WATCH_DRIFT_TOLERANCE_MS) return { seconds, label: "in sync" };
  return { seconds, label: seconds > 0 ? "ahead" : "behind" };
}

// Canonical identity for the title being watched. Query-string sites keep the
// video id, path-based sites keep the path, and tracking parameters never
// count, so two people on the same title always agree.
export function normalizeContentKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id = parsed.searchParams.get("v") || (parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : parsed.pathname.startsWith("/embed/") ? parsed.pathname.split("/")[2] : "");
      return id ? `youtube:${id}` : `youtube:${parsed.pathname}`;
    }
    if (host === "youtu.be") return `youtube:${parsed.pathname.replace(/^\//, "")}`;
    const path = parsed.pathname.replace(/\/+$/, "").slice(0, 300);
    return `${host}${path}`;
  } catch {
    return url.slice(0, 300);
  }
}
