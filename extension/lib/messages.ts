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
  paused?: boolean;
};

export type PlayerStatus = PlaybackPayload & {
  connected: boolean;
  tabId?: number;
  adPlaying?: boolean;
  error?: string;
};

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
  "https://audio-downloader.vortexc.chatgpt.site/*",
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
