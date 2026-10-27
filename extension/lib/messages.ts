export type ExtensionMessage =
  | { type: "GET_STATUS" }
  | { type: "CONNECT_CURRENT_TAB" }
  | { type: "OPEN_POPUP" }
  | { type: "PLAYER_READY"; payload: PlayerStatus }
  | { type: "PLAYER_STATUS"; payload: PlayerStatus }
  | { type: "PLAYBACK_EVENT"; payload: PlaybackPayload }
  | { type: "APPLY_PLAYBACK"; payload: PlaybackPayload }
  | { type: "REQUEST_STATUS" };

export type PlaybackPayload = {
  action: "play" | "pause" | "seek" | "snapshot";
  currentTime: number;
  duration?: number;
  playbackRate: number;
  contentKey: string;
  title?: string;
  provider?: string;
  // Desired paused state. A snapshot carries the controller's state so a guest
  // whose player stalled (or who pressed pause locally) is pulled back in line.
  paused?: boolean;
};

export type PlayerStatus = PlaybackPayload & {
  connected: boolean;
  tabId?: number;
  adPlaying?: boolean;
  error?: string;
  // "page" when a provider-specific adapter running in the page world drives
  // the player (Netflix); "html5" for the generic media-element path.
  adapter?: "html5" | "page";
};

// Canonical identity for the title being watched — mirrors
// normalizeContentKey in packages/watch-core so the room and the companion
// always agree. Query-string sites keep the video id; path sites keep the path;
// tracking parameters never count.
export function contentKeyForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id = parsed.searchParams.get("v") || (parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : parsed.pathname.startsWith("/embed/") ? parsed.pathname.split("/")[2] : "");
      return id ? `youtube:${id}` : `youtube:${parsed.pathname}`;
    }
    if (host === "youtu.be") return `youtube:${parsed.pathname.replace(/^\//, "")}`;
    return `${host}${parsed.pathname.replace(/\/+$/, "").slice(0, 300)}`;
  } catch {
    return url.slice(0, 300);
  }
}

// Providers whose player is driven through an adapter injected into the page
// world (their HTML5 element rejects direct seeks or fights them).
export const pageAdapterHosts = ["netflix.com"];

export function needsPageAdapter(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return pageAdapterHosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export type ConnectionStatus = {
  installed: true;
  connected: boolean;
  provider?: string;
  title?: string;
  tabId?: number;
  error?: string;
};

export const toolsMatches = [
  "https://tools.trenith.com/*",
  "https://tools.trenith.in/*",
  "https://trenith-tools.vercel.app/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
];

export function providerForHost(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  if (host.endsWith("netflix.com")) return "netflix";
  if (host.endsWith("primevideo.com") || host.endsWith("amazon.com")) return "prime-video";
  if (host.endsWith("hotstar.com")) return "jiohotstar";
  if (host.endsWith("disneyplus.com")) return "disney-plus";
  if (host.endsWith("max.com") || host.endsWith("hbomax.com")) return "max";
  if (host.endsWith("hulu.com")) return "hulu";
  if (host.endsWith("peacocktv.com")) return "peacock";
  if (host.endsWith("paramountplus.com")) return "paramount-plus";
  if (host === "tv.apple.com") return "apple-tv";
  if (host.endsWith("crunchyroll.com")) return "crunchyroll";
  if (host.endsWith("sonyliv.com")) return "sonyliv";
  if (host.endsWith("zee5.com")) return "zee5";
  if (host.endsWith("tubitv.com")) return "tubi";
  if (host.endsWith("pluto.tv")) return "pluto-tv";
  return "generic";
}
