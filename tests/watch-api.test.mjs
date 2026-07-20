import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("watch-api-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

class D1Statement {
  constructor(database, query, values = []) { this.database = database; this.query = query; this.values = values; }
  bind(...values) { return new D1Statement(this.database, this.query, values); }
  statement() { return this.database.prepare(this.query); }
  async first() { return this.statement().get(...this.values) ?? null; }
  async all() { return { results: this.statement().all(...this.values), success: true }; }
  async run() { this.statement().run(...this.values); return { success: true }; }
}

class TestD1 {
  constructor() { this.sqlite = new DatabaseSync(":memory:"); }
  prepare(query) { return new D1Statement(this.sqlite, query); }
  async batch(statements) { const results = []; for (const statement of statements) results.push(await statement.run()); return results; }
}

const environment = {
  DB: new TestD1(),
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

async function request(path, { method = "GET", token, body, accessKey } = {}) {
  const headers = { origin: "https://tools.trenith.com" };
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (accessKey) headers["x-watch-access"] = accessKey;
  return worker.fetch(new Request(`https://tools.trenith.com/api/watch/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), environment, context);
}

// Room creation now requires an approved access key. Trenith-domain emails are
// auto-approved, so provision one key up front for the room-flow tests.
const approved = await (await request("access", { method: "POST", body: { email: "host@trenith.com", name: "Host" } })).json();
const accessKey = approved.accessKey;

test("watch room API enforces invitation proof, tokens, targeting and host termination", async () => {
  const health = await request("health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).protocolVersion, 1);

  const inviteProof = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456";
  const createdResponse = await request("rooms", { method: "POST", accessKey, body: { inviteProof, displayName: " Host ", provider: "youtube", controlMode: "host" } });
  assert.equal(createdResponse.status, 201);
  const host = await createdResponse.json();
  assert.match(host.roomId, /^[A-Za-z0-9_-]{20,32}$/);
  assert.equal(host.participants[0].displayName, "Host");
  assert.notEqual(host.participantToken, inviteProof);

  const badJoin = await request(`rooms/${host.roomId}`, { method: "POST", body: { inviteProof: `${inviteProof}x`, displayName: "Intruder" } });
  assert.equal(badJoin.status, 403);

  const guestResponse = await request(`rooms/${host.roomId}`, { method: "POST", body: { inviteProof, displayName: "Guest" } });
  assert.equal(guestResponse.status, 201);
  const guest = await guestResponse.json();
  assert.equal(guest.role, "guest");

  const unauthorized = await request(`rooms/${host.roomId}/events?after=0`);
  assert.equal(unauthorized.status, 401);

  const eventPayload = "chat:encrypted.iv-and-ciphertext";
  const posted = await request(`rooms/${host.roomId}/events`, { method: "POST", token: host.participantToken, body: { payload: eventPayload, targetId: guest.participantId } });
  assert.equal(posted.status, 202);

  const events = await request(`rooms/${host.roomId}/events?after=0`, { token: guest.participantToken });
  assert.equal(events.status, 200);
  const eventData = await events.json();
  assert.equal(eventData.events.length, 1);
  assert.equal(eventData.events[0].payload, eventPayload);
  assert.equal(eventData.events[0].targetId, guest.participantId);
  assert.equal(eventData.participants.length, 2);

  const guestPlayback = await request(`rooms/${host.roomId}/events`, { method: "POST", token: guest.participantToken, body: { payload: "playback:opaque.ciphertext" } });
  assert.equal(guestPlayback.status, 403);

  const guestEnd = await request(`rooms/${host.roomId}`, { method: "DELETE", token: guest.participantToken });
  assert.equal(guestEnd.status, 403);
  const hostEnd = await request(`rooms/${host.roomId}`, { method: "DELETE", token: host.participantToken });
  assert.equal(hostEnd.status, 200);
  const afterEnd = await request(`rooms/${host.roomId}/events?after=0`, { token: guest.participantToken });
  assert.equal(afterEnd.status, 401);
});

test("access gating: trenith emails auto-approve, others pend, creation needs a key, joining does not", async () => {
  // Trenith-domain email is approved instantly and returns a usable key.
  const auto = await request("access", { method: "POST", body: { email: "team@trenith.com", name: "Team" } });
  assert.equal(auto.status, 201);
  const autoBody = await auto.json();
  assert.equal(autoBody.status, "approved");
  assert.match(autoBody.accessKey, /^[A-Za-z0-9_-]{24,40}$/);

  // Outside email is held for review, no key handed out.
  const pending = await request("access", { method: "POST", body: { email: "someone@example.com", name: "Someone" } });
  assert.equal(pending.status, 202);
  const pendingBody = await pending.json();
  assert.equal(pendingBody.status, "pending");
  assert.equal(pendingBody.accessKey, undefined);

  // Invalid email is rejected.
  assert.equal((await request("access", { method: "POST", body: { email: "not-an-email", name: "X" } })).status, 400);

  // Creating a room with no key / a bogus key is refused.
  const proof = "proofPROOFproofPROOFproof1234567890AB";
  assert.equal((await request("rooms", { method: "POST", body: { inviteProof: proof, displayName: "NoKey", provider: "youtube" } })).status, 403);
  assert.equal((await request("rooms", { method: "POST", accessKey: "totally-invalid-key", body: { inviteProof: proof, displayName: "BadKey", provider: "youtube" } })).status, 403);

  // With a valid key, creation works — and a guest can then join with only the
  // invitation proof (no access key), so shared links reach anyone.
  const room = await (await request("rooms", { method: "POST", accessKey: autoBody.accessKey, body: { inviteProof: proof, displayName: "Owner", provider: "youtube" } })).json();
  const guest = await request(`rooms/${room.roomId}`, { method: "POST", body: { inviteProof: proof, displayName: "Friend" } });
  assert.equal(guest.status, 201);
  assert.equal((await guest.json()).role, "guest");
});

test("watch API rejects unsupported providers and oversized encrypted events", async () => {
  const inviteProof = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh123456";
  const invalid = await request("rooms", { method: "POST", accessKey, body: { inviteProof, displayName: "Host", provider: "pirate-stream" } });
  assert.equal(invalid.status, 400);
  const created = await (await request("rooms", { method: "POST", accessKey, body: { inviteProof, displayName: "Host", provider: "netflix" } })).json();
  const oversized = await request(`rooms/${created.roomId}/events`, { method: "POST", token: created.participantToken, body: { payload: `chat:${"x".repeat(65 * 1024)}` } });
  assert.equal(oversized.status, 413);
});
