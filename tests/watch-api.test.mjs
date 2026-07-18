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

async function request(path, { method = "GET", token, body } = {}) {
  const headers = { origin: "https://tools.trenith.com" };
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return worker.fetch(new Request(`https://tools.trenith.com/api/watch/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), environment, context);
}

test("watch room API enforces invitation proof, tokens, targeting and host termination", async () => {
  const health = await request("health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).protocolVersion, 1);

  const inviteProof = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456";
  const createdResponse = await request("rooms", { method: "POST", body: { inviteProof, displayName: " Host ", provider: "youtube", controlMode: "host" } });
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

test("watch API rejects unsupported providers and oversized encrypted events", async () => {
  const inviteProof = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh123456";
  const invalid = await request("rooms", { method: "POST", body: { inviteProof, displayName: "Host", provider: "pirate-stream" } });
  assert.equal(invalid.status, 400);
  const created = await (await request("rooms", { method: "POST", body: { inviteProof, displayName: "Host", provider: "netflix" } })).json();
  const oversized = await request(`rooms/${created.roomId}/events`, { method: "POST", token: created.participantToken, body: { payload: `chat:${"x".repeat(65 * 1024)}` } });
  assert.equal(oversized.status, 413);
});
