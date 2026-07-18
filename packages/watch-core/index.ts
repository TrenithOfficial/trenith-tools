export const WATCH_PROTOCOL_VERSION = 1;
export const WATCH_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
export const WATCH_EVENT_TTL_MS = 10 * 60 * 1000;
export const WATCH_SYNC_PARTICIPANT_LIMIT = 25;
export const WATCH_MEDIA_PARTICIPANT_LIMIT = 6;
export const WATCH_MAX_EVENT_BYTES = 64 * 1024;

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

export type WatchRoomMessage =
  | { type: "presence"; participant: WatchParticipant }
  | { type: "peer-offer"; targetId: string; description: RTCSessionDescriptionInit }
  | { type: "peer-answer"; targetId: string; description: RTCSessionDescriptionInit }
  | { type: "peer-ice"; targetId: string; candidate: RTCIceCandidateInit }
  | { type: "chat"; id: string; text: string; sentAt: number }
  | { type: "reaction"; emoji: string; sentAt: number }
  | { type: "playback"; action: "play" | "pause" | "seek" | "snapshot"; currentTime: number; playbackRate: number; sentAt: number; contentKey: string }
  | { type: "content-change"; contentKey: string; deepLink: string; title: string; sentAt: number }
  | { type: "media-state"; microphone: boolean; camera: boolean }
  | { type: "host-transfer"; participantId: string }
  | { type: "room-ended"; sentAt: number };

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
