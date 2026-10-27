import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

// Runs in the page's own JavaScript world on netflix.com (injected with
// world: "MAIN" after the user grants site access). Netflix's player ignores
// direct writes to the <video> element's currentTime, so playback commands go
// through the player API the page itself uses. The isolated-world player
// script talks to this adapter with window.postMessage; nothing here touches
// credentials, DRM or the media bytes.

type NetflixPlayer = {
  seek(ms: number): void;
  play(): void;
  pause(): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  isPlaying?(): boolean;
  getPlaybackRate?(): number;
};

type NetflixWindow = Window & {
  netflix?: { appContext?: { state?: { playerApp?: { getAPI?: () => { videoPlayer?: { getAllPlayerSessionIds(): string[]; getVideoPlayerBySessionId(id: string): NetflixPlayer | undefined } } } } } };
  __TRENITH_NETFLIX_ADAPTER__?: boolean;
};

function currentPlayer(): NetflixPlayer | null {
  try {
    const videoPlayer = (window as NetflixWindow).netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
    if (!videoPlayer) return null;
    const ids = videoPlayer.getAllPlayerSessionIds();
    const id = ids.find((entry) => entry.startsWith("watch-")) || ids[0];
    return id ? videoPlayer.getVideoPlayerBySessionId(id) || null : null;
  } catch {
    return null;
  }
}

export default defineUnlistedScript(() => {
  const target = window as NetflixWindow;
  if (target.__TRENITH_NETFLIX_ADAPTER__) return;
  target.__TRENITH_NETFLIX_ADAPTER__ = true;
  const reply = (type: string, payload: unknown) => window.postMessage({ source: "TRENITH_WATCH_PAGE", type, payload }, location.origin);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "TRENITH_WATCH_ADAPTER") return;
    const command = String(event.data.command || "");
    const requestId = String(event.data.requestId || "");
    const player = currentPlayer();
    if (command === "probe") { reply("adapter-state", { requestId, available: Boolean(player) }); return; }
    if (!player) { reply("adapter-result", { requestId, applied: false, error: "The Netflix player is not active on this page yet. Start the title, then try again." }); return; }
    try {
      const payload = (event.data.payload || {}) as { currentTime?: number; action?: string; paused?: boolean; playbackRate?: number };
      if (command === "seek" && Number.isFinite(payload.currentTime)) player.seek(Math.max(0, Number(payload.currentTime)) * 1000);
      if (command === "play") player.play();
      if (command === "pause") player.pause();
      reply("adapter-result", { requestId, applied: true, currentTime: player.getCurrentTime() / 1000, paused: player.isPaused() });
    } catch (error) {
      reply("adapter-result", { requestId, applied: false, error: error instanceof Error ? error.message : "The Netflix player rejected the command." });
    }
  });
  reply("adapter-ready", { provider: "netflix" });
});
