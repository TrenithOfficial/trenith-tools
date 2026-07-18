import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { providerForHost, type ExtensionMessage, type PlaybackPayload, type PlayerStatus } from "../lib/messages";

declare global { interface Window { __TRENITH_WATCH_PLAYER__?: boolean } }

function allMediaElements(root: Document | ShadowRoot = document): HTMLMediaElement[] {
  const found = Array.from(root.querySelectorAll<HTMLMediaElement>("video,audio"));
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) if (element.shadowRoot) found.push(...allMediaElements(element.shadowRoot));
  return found;
}

function visibleArea(media: HTMLMediaElement) {
  const rect = media.getBoundingClientRect();
  const style = getComputedStyle(media);
  return style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0 ? 0 : Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) * Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
}

function currentMedia() {
  return allMediaElements().sort((left, right) => visibleArea(right) - visibleArea(left))[0] || null;
}

function adPlaying() {
  return Boolean(document.querySelector('[class*="ad-showing"],[class*="AdPlaying"],[data-testid*="ad-"],[aria-label*="Advertisement" i],.ytp-ad-player-overlay,.atvwebplayersdk-adtimeindicator-text'));
}

function contentKey() {
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  return (canonical || `${location.origin}${location.pathname}`).replace(/[?#].*$/, "").slice(0, 500);
}

function snapshot(media = currentMedia()): PlayerStatus {
  return {
    connected: Boolean(media),
    action: "snapshot",
    currentTime: Number.isFinite(media?.currentTime) ? media!.currentTime : 0,
    duration: Number.isFinite(media?.duration) ? media!.duration : 0,
    playbackRate: media?.playbackRate || 1,
    paused: media?.paused ?? true,
    contentKey: contentKey(),
    title: (document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || document.title).slice(0, 200),
    provider: providerForHost(location.hostname),
    adPlaying: adPlaying(),
    error: media ? undefined : "No visible HTML5 video or audio player was found on this page.",
  };
}

export default defineUnlistedScript(() => {
  if (window.__TRENITH_WATCH_PLAYER__) {
    void browser.runtime.sendMessage({ type: "PLAYER_STATUS", payload: snapshot() } satisfies ExtensionMessage);
    return;
  }
  window.__TRENITH_WATCH_PLAYER__ = true;
  let attached: HTMLMediaElement | null = null;
  let applyingUntil = 0;
  let lastEventAt = 0;

  const sendStatus = (type: "PLAYER_READY" | "PLAYER_STATUS" = "PLAYER_STATUS") => {
    void browser.runtime.sendMessage({ type, payload: snapshot() } satisfies ExtensionMessage);
  };
  const sendPlayback = (action: PlaybackPayload["action"]) => {
    if (performance.now() < applyingUntil || adPlaying()) return;
    const now = performance.now();
    if (action === "seek" && now - lastEventAt < 250) return;
    lastEventAt = now;
    const media = currentMedia();
    if (!media) return;
    void browser.runtime.sendMessage({ type: "PLAYBACK_EVENT", payload: { ...snapshot(media), action } } satisfies ExtensionMessage);
  };
  const attach = () => {
    const media = currentMedia();
    if (!media || media === attached) return;
    attached = media;
    media.addEventListener("play", () => sendPlayback("play"), { passive: true });
    media.addEventListener("pause", () => sendPlayback("pause"), { passive: true });
    media.addEventListener("seeked", () => sendPlayback("seek"), { passive: true });
    media.addEventListener("ratechange", () => sendPlayback("snapshot"), { passive: true });
    media.addEventListener("loadedmetadata", () => sendStatus(), { passive: true });
    sendStatus("PLAYER_READY");
  };

  const observer = new MutationObserver(attach);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  attach();
  const timer = window.setInterval(() => { attach(); sendStatus(); }, 3000);

  browser.runtime.onMessage.addListener((raw: unknown) => {
    const message = raw as ExtensionMessage;
    if (message.type === "REQUEST_STATUS") { sendStatus(); return Promise.resolve(snapshot()); }
    if (message.type !== "APPLY_PLAYBACK") return undefined;
    const media = currentMedia();
    if (!media) return Promise.resolve({ applied: false, error: "No compatible media element is visible." });
    if (adPlaying()) return Promise.resolve({ applied: false, error: "Playback sync is paused while this participant is in an advertisement." });
    const payload = message.payload;
    if (payload.contentKey && payload.contentKey !== "unknown" && contentKey() !== payload.contentKey) return Promise.resolve({ applied: false, error: "Participants appear to have different titles open." });
    applyingUntil = performance.now() + 1400;
    if (Number.isFinite(payload.playbackRate) && payload.playbackRate >= .25 && payload.playbackRate <= 4) media.playbackRate = payload.playbackRate;
    if ((payload.action === "seek" || payload.action === "snapshot") && Number.isFinite(payload.currentTime) && Math.abs(media.currentTime - payload.currentTime) > .75) media.currentTime = Math.max(0, Math.min(payload.currentTime, Number.isFinite(media.duration) ? media.duration : payload.currentTime));
    if (payload.action === "play") return media.play().then(() => ({ applied: true })).catch(() => ({ applied: false, error: "The browser blocked autoplay. Click play once in the OTT tab." }));
    if (payload.action === "pause") media.pause();
    return Promise.resolve({ applied: true });
  });

  window.addEventListener("pagehide", () => { observer.disconnect(); clearInterval(timer); }, { once: true });
});
