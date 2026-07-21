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

const ADMIN_SECRET = "test-admin-secret-value";
const environment = {
  DB: new TestD1(),
  WATCH_ADMIN_SECRET: ADMIN_SECRET,
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

async function request(path, { method = "GET", token, body, accessKey, admin } = {}) {
  const headers = { origin: "https://tools.trenith.com" };
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  if (accessKey) headers["x-watch-access"] = accessKey;
  if (admin) headers["x-watch-admin"] = admin;
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


async function makeToken(secret, id, ttlMs) {
  const payload = `${id}.${Date.now() + ttlMs}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  const b64 = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64(new TextEncoder().encode(payload))}.${b64(sig)}`;
}

test("access review: admin list, admin reject, and signed-token approve", async () => {
  const pend = await (await request("access", { method: "POST", body: { email: "guest@example.org", name: "Guest", reason: "movie night" } })).json();
  assert.equal(pend.status, "pending");
  const listRes = await request("access/list?status=pending", { admin: ADMIN_SECRET });
  assert.equal(listRes.status, 200);
  const row = (await listRes.json()).requests.find((r) => r.email === "guest@example.org");
  assert.ok(row && row.status === "pending", "pending request is listed");
  assert.equal((await request("access/list")).status, 401);
  const token = await makeToken(ADMIN_SECRET, row.id, 60000);
  const preview = await (await request("access/action", { method: "POST", body: { token } })).json();
  assert.equal(preview.request.email, "guest@example.org");
  assert.equal(preview.request.status, "pending");
  const approved = await (await request("access/action", { method: "POST", body: { token, decision: "approve" } })).json();
  assert.equal(approved.status, "approved");
  const after = (await (await request("access/list?status=all", { admin: ADMIN_SECRET })).json()).requests.find((r) => r.email === "guest@example.org");
  assert.equal(after.status, "approved");
  assert.equal((await request("access/action", { method: "POST", body: { token: "bogus.token" } })).status, 401);
  await request("access", { method: "POST", body: { email: "guest2@example.org", name: "Guest Two" } });
  const rej = await request("access/reject", { method: "POST", admin: ADMIN_SECRET, body: { email: "guest2@example.org" } });
  assert.equal(rej.status, 200);
  assert.equal((await rej.json()).status, "rejected");
});


test("access reissue: mints a fresh key for an approved email, 404 otherwise", async () => {
  // Seed an approved grant directly — the /access endpoint is rate-limited and
  // the other concurrent tests exhaust it against this shared in-memory DB.
  environment.DB.sqlite
    .prepare("INSERT INTO watch_access (id, email, display_name, reason, domain, key_hash, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?)")
    .run("reissue-seed-1", "reissue@trenith.com", "Re Issue", null, "trenith.com", "oldhash", Date.now(), Date.now());
  const ok = await request("access/reissue", { method: "POST", admin: ADMIN_SECRET, body: { email: "reissue@trenith.com" } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).status, "reissued");
  const miss = await request("access/reissue", { method: "POST", admin: ADMIN_SECRET, body: { email: "nobody-here@example.com" } });
  assert.equal(miss.status, 404);
  assert.equal((await request("access/reissue", { method: "POST", body: { email: "reissue@trenith.com" } })).status, 401);
});
