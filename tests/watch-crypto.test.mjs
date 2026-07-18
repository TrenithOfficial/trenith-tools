import assert from "node:assert/strict";
import test from "node:test";
import { decryptWatchMessage, encryptWatchMessage, importWatchRoomKey } from "../lib/watch-crypto.ts";

test("room messages round-trip with an authenticated event-type envelope", async () => {
  const key = await importWatchRoomKey("a-private-room-secret-with-enough-entropy");
  const message = { type: "chat", id: "message-1", text: "hello ❤️", sentAt: 12345 };
  const encrypted = await encryptWatchMessage(key, message);
  assert.match(encrypted, /^chat:[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decryptWatchMessage(key, encrypted), message);
});

test("changing the clear event category or using another room key fails authentication", async () => {
  const key = await importWatchRoomKey("room-one-secret");
  const otherKey = await importWatchRoomKey("room-two-secret");
  const encrypted = await encryptWatchMessage(key, { type: "playback", action: "pause", currentTime: 20, playbackRate: 1, sentAt: 1, contentKey: "title" });
  await assert.rejects(() => decryptWatchMessage(key, encrypted.replace(/^playback:/, "chat:")));
  await assert.rejects(() => decryptWatchMessage(otherKey, encrypted));
});
