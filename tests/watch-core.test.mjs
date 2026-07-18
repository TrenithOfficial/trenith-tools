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
