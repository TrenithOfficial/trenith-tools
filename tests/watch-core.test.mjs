import assert from "node:assert/strict";
import test from "node:test";
import {
  WATCH_EVENT_TTL_MS,
  WATCH_MEDIA_PARTICIPANT_LIMIT,
  WATCH_PROVIDERS,
  WATCH_ROOM_TTL_MS,
  WATCH_SYNC_PARTICIPANT_LIMIT,
  isWatchParticipantId,
  isWatchProviderId,
  isWatchRoomId,
  normalizeDisplayName,
  providerForUrl,
  utf8ByteLength,
} from "../packages/watch-core/index.ts";

test("watch protocol exposes bounded room, event and media limits", () => {
  assert.equal(WATCH_ROOM_TTL_MS, 6 * 60 * 60 * 1000);
  assert.equal(WATCH_EVENT_TTL_MS, 10 * 60 * 1000);
  assert.equal(WATCH_SYNC_PARTICIPANT_LIMIT, 25);
  assert.equal(WATCH_MEDIA_PARTICIPANT_LIMIT, 6);
});

test("display names are normalized and control characters removed", () => {
  assert.equal(normalizeDisplayName("  Room\n  Guest\u0000  "), "Room Guest");
  assert.equal(normalizeDisplayName(""), "Guest");
  assert.equal(normalizeDisplayName("a".repeat(100)).length, 32);
});

test("provider discovery recognizes launch and regional OTT hosts", () => {
  assert.equal(providerForUrl("https://www.youtube.com/watch?v=test").id, "youtube");
  assert.equal(providerForUrl("https://app.primevideo.com/detail/test").id, "prime-video");
  assert.equal(providerForUrl("https://www.hotstar.com/in/movies/test").id, "jiohotstar");
  assert.equal(providerForUrl("https://unknown.example/video").id, "generic");
  assert.ok(WATCH_PROVIDERS.every((provider) => isWatchProviderId(provider.id)));
});

test("room identifiers and encrypted event byte sizing reject malformed values", () => {
  assert.equal(isWatchRoomId("abcdefghijklmnopqrstuvwx"), true);
  assert.equal(isWatchRoomId("short"), false);
  assert.equal(isWatchParticipantId("abcdefghijklmnop"), true);
  assert.equal(isWatchParticipantId("bad id spaces"), false);
  assert.equal(utf8ByteLength("❤️"), 6);
});

test("clock alignment and position projection compensate for message age", async () => {
  const { estimateClockOffset, smoothClockOffset, projectPlaybackPosition, describeDrift, normalizeContentKey, WATCH_EVENT_KINDS, WATCH_PROTOCOL_VERSION } = await import("../packages/watch-core/index.ts");
  assert.equal(WATCH_PROTOCOL_VERSION, 2);
  assert.ok(WATCH_EVENT_KINDS.has("sync-status") && WATCH_EVENT_KINDS.has("kick") && WATCH_EVENT_KINDS.has("room-locked"));
  // Server clock 1000 ms ahead, 200 ms round trip → offset 1000.
  assert.equal(estimateClockOffset(10_000, 11_100, 10_200), 1000);
  assert.equal(smoothClockOffset(null, 1000), 1000);
  assert.equal(smoothClockOffset(1000, 2000), 1300);
  // A playing snapshot sent 3 s ago at 1.5× is 4.5 s further on now.
  assert.equal(projectPlaybackPosition({ currentTime: 100, playbackRate: 1.5, paused: false, sentAt: 50_000 }, 53_000), 104.5);
  assert.equal(projectPlaybackPosition({ currentTime: 100, playbackRate: 1, paused: true, sentAt: 50_000 }, 53_000), 100);
  assert.equal(projectPlaybackPosition({ currentTime: 100, playbackRate: 99, paused: false, sentAt: 50_000 }, 51_000), 101, "absurd rates fall back to 1×");
  const reference = { currentTime: 100, playbackRate: 1, paused: false, sentAt: 50_000 };
  assert.equal(describeDrift({ currentTime: 100.4, playbackRate: 1, paused: false, sentAt: 50_000 }, reference, 52_000).label, "in sync");
  assert.equal(describeDrift({ currentTime: 103, playbackRate: 1, paused: false, sentAt: 50_000 }, reference, 52_000).label, "ahead");
  assert.equal(describeDrift({ currentTime: 95, playbackRate: 1, paused: false, sentAt: 52_000 }, reference, 52_000).label, "behind");
  assert.equal(describeDrift({ currentTime: 100, playbackRate: 1, paused: true, sentAt: 52_000 }, reference, 52_000).label, "paused");
  assert.equal(describeDrift(null, reference, 52_000).label, "unknown");
  assert.equal(normalizeContentKey("https://www.youtube.com/watch?v=abc123&t=42&list=PL1"), "youtube:abc123");
  assert.equal(normalizeContentKey("https://youtu.be/abc123?si=tracking"), "youtube:abc123");
  assert.equal(normalizeContentKey("https://www.netflix.com/watch/81234567?trackId=255824129"), "netflix.com/watch/81234567");
  assert.equal(normalizeContentKey("https://www.hotstar.com/in/movies/title/1260000000/watch?ref=x"), "hotstar.com/in/movies/title/1260000000/watch");
});
