import {
  WATCH_EVENT_TTL_MS,
  WATCH_MAX_EVENT_BYTES,
  WATCH_PROTOCOL_VERSION,
  WATCH_ROOM_TTL_MS,
  WATCH_SYNC_PARTICIPANT_LIMIT,
  isWatchParticipantId,
  isWatchProviderId,
  isWatchRoomId,
  normalizeDisplayName,
  utf8ByteLength,
  type WatchControlMode,
} from "../packages/watch-core";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success: boolean };
type D1Prepared = {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};

export type WatchD1 = {
  prepare(query: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<D1Result[]>;
};

export type WatchApiEnv = {
  DB?: WatchD1;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
};

type ParticipantRow = {
  id: string;
  room_id: string;
  token_hash: string;
  display_name: string;
  role: "host" | "guest";
  last_seen_at: number;
  active: number;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS watch_rooms (
    id TEXT PRIMARY KEY NOT NULL,
    invite_proof_hash TEXT NOT NULL,
    host_participant_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    control_mode TEXT DEFAULT 'host' NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ended_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS watch_participants (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT DEFAULT 'guest' NOT NULL,
    joined_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    active INTEGER DEFAULT 1 NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS watch_participants_room_idx ON watch_participants (room_id)`,
  `CREATE INDEX IF NOT EXISTS watch_participants_seen_idx ON watch_participants (last_seen_at)`,
  `CREATE INDEX IF NOT EXISTS watch_rooms_expires_idx ON watch_rooms (expires_at)`,
  `CREATE TABLE IF NOT EXISTS watch_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    target_id TEXT,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS watch_events_room_seq_idx ON watch_events (room_id, seq)`,
  `CREATE INDEX IF NOT EXISTS watch_events_expires_idx ON watch_events (expires_at)`,
  `CREATE TABLE IF NOT EXISTS watch_rate_limits (
    key TEXT PRIMARY KEY NOT NULL,
    count INTEGER DEFAULT 1 NOT NULL,
    reset_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS watch_rate_limits_reset_idx ON watch_rate_limits (reset_at)`,
];

let schemaReady: Promise<void> | null = null;
let lastCleanupAt = 0;

function corsOrigin(request: Request): string {
  const origin = request.headers.get("origin") || "";
  if (
    origin === "https://tools.trenith.com" ||
    origin === "https://tools.trenith.in" ||
    origin === "https://trenith-tools.vercel.app" ||
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://") ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) return origin;
  return "https://tools.trenith.com";
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": corsOrigin(request),
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(request), ...extra },
  });
}

async function ensureSchema(db: WatchD1): Promise<void> {
  schemaReady ??= db.batch(schemaStatements.map((statement) => db.prepare(statement))).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

function randomId(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("A JSON request body is required.");
  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON object is required.");
  return body as Record<string, unknown>;
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function authenticate(request: Request, db: WatchD1, roomId: string): Promise<ParticipantRow | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return db.prepare(`SELECT p.id, p.room_id, p.token_hash, p.display_name, p.role, p.last_seen_at, p.active
    FROM watch_participants p JOIN watch_rooms r ON r.id = p.room_id
    WHERE p.room_id = ? AND p.token_hash = ? AND p.active = 1 AND r.ended_at IS NULL AND r.expires_at > ? LIMIT 1`)
    .bind(roomId, tokenHash, Date.now()).first<ParticipantRow>();
}

async function activeParticipants(db: WatchD1, roomId: string, now: number) {
  const result = await db.prepare(`SELECT id, display_name, role, last_seen_at
    FROM watch_participants WHERE room_id = ? AND active = 1 AND last_seen_at >= ? ORDER BY joined_at ASC`)
    .bind(roomId, now - 45_000).all<{ id: string; display_name: string; role: "host" | "guest"; last_seen_at: number }>();
  return (result.results || []).map((participant) => ({
    id: participant.id,
    displayName: participant.display_name,
    role: participant.role,
    lastSeenAt: participant.last_seen_at,
  }));
}

async function cleanExpired(db: WatchD1, now: number): Promise<void> {
  // Physically purge rooms (and their participants' display names) once they are
  // well past expiry, so retention matches the privacy notice's "removed" claim
  // and D1 does not grow unbounded. A grace window keeps just-expired rooms
  // briefly for late reconnects. The UPDATEs are scoped to only rows that
  // actually change, so a growing backlog is not re-written every 60s.
  const purgeBefore = now - 60 * 60 * 1000;
  await db.batch([
    db.prepare("DELETE FROM watch_events WHERE expires_at < ?").bind(now),
    db.prepare("DELETE FROM watch_rate_limits WHERE reset_at < ?").bind(now),
    db.prepare("UPDATE watch_participants SET active = 0 WHERE active = 1 AND last_seen_at < ?").bind(now - 90_000),
    db.prepare("UPDATE watch_rooms SET ended_at = COALESCE(ended_at, ?) WHERE ended_at IS NULL AND expires_at < ?").bind(now, now),
    db.prepare("DELETE FROM watch_participants WHERE room_id IN (SELECT id FROM watch_rooms WHERE expires_at < ?)").bind(purgeBefore),
    db.prepare("DELETE FROM watch_rooms WHERE expires_at < ?").bind(purgeBefore),
  ]);
}

async function rateLimit(request: Request, db: WatchD1, scope: string, limit: number, windowMs: number): Promise<Response | null> {
  const address = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || `unknown:${request.headers.get("user-agent") || "client"}`;
  const key = await sha256(`${scope}:${address}`);
  const now = Date.now();
  const resetAt = now + windowMs;
  const row = await db.prepare(`INSERT INTO watch_rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN watch_rate_limits.reset_at <= ? THEN 1 ELSE watch_rate_limits.count + 1 END,
      reset_at = CASE WHEN watch_rate_limits.reset_at <= ? THEN ? ELSE watch_rate_limits.reset_at END
    RETURNING count, reset_at`).bind(key, resetAt, now, now, resetAt).first<{ count: number; reset_at: number }>();
  if (!row || row.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((row.reset_at - now) / 1000));
  return json(request, { error: "Too many Watch Together requests. Please wait and try again." }, 429, { "retry-after": String(retryAfter) });
}

async function createRoom(request: Request, db: WatchD1): Promise<Response> {
  const body = await readBody(request);
  const provider = String(body.provider || "generic");
  const proof = String(body.inviteProof || "");
  const controlMode: WatchControlMode = body.controlMode === "everyone" ? "everyone" : "host";
  if (!isWatchProviderId(provider)) return json(request, { error: "Choose a supported provider." }, 400);
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(proof)) return json(request, { error: "The invitation proof is invalid." }, 400);

  const now = Date.now();
  const roomId = randomId(18);
  const participantId = randomId(12);
  const participantToken = randomId(32);
  const expiresAt = now + WATCH_ROOM_TTL_MS;
  await db.batch([
    db.prepare(`INSERT INTO watch_rooms
      (id, invite_proof_hash, host_participant_id, provider, control_mode, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(roomId, await sha256(proof), participantId, provider, controlMode, now, expiresAt),
    db.prepare(`INSERT INTO watch_participants
      (id, room_id, token_hash, display_name, role, joined_at, last_seen_at, active)
      VALUES (?, ?, ?, ?, 'host', ?, ?, 1)`)
      .bind(participantId, roomId, await sha256(participantToken), normalizeDisplayName(body.displayName), now, now),
  ]);

  return json(request, {
    protocolVersion: WATCH_PROTOCOL_VERSION,
    roomId,
    participantId,
    participantToken,
    role: "host",
    provider,
    controlMode,
    expiresAt,
    participants: [{ id: participantId, displayName: normalizeDisplayName(body.displayName), role: "host", lastSeenAt: now }],
  }, 201);
}

async function joinRoom(request: Request, db: WatchD1, roomId: string): Promise<Response> {
  const body = await readBody(request);
  const proof = String(body.inviteProof || "");
  const now = Date.now();
  const room = await db.prepare(`SELECT id, invite_proof_hash, provider, control_mode, expires_at, ended_at
    FROM watch_rooms WHERE id = ? LIMIT 1`).bind(roomId).first<{
      id: string; invite_proof_hash: string; provider: string; control_mode: WatchControlMode; expires_at: number; ended_at: number | null;
    }>();
  if (!room || room.ended_at || room.expires_at <= now) return json(request, { error: "This room has ended or expired." }, 410);
  if (await sha256(proof) !== room.invite_proof_hash) return json(request, { error: "This invitation link is incomplete or invalid." }, 403);

  const participants = await activeParticipants(db, roomId, now);
  if (participants.length >= WATCH_SYNC_PARTICIPANT_LIMIT) return json(request, { error: "This room is full." }, 409);

  const participantId = randomId(12);
  const participantToken = randomId(32);
  const displayName = normalizeDisplayName(body.displayName);
  await db.prepare(`INSERT INTO watch_participants
    (id, room_id, token_hash, display_name, role, joined_at, last_seen_at, active)
    VALUES (?, ?, ?, ?, 'guest', ?, ?, 1)`)
    .bind(participantId, roomId, await sha256(participantToken), displayName, now, now).run();

  return json(request, {
    protocolVersion: WATCH_PROTOCOL_VERSION,
    roomId,
    participantId,
    participantToken,
    role: "guest",
    provider: room.provider,
    controlMode: room.control_mode,
    expiresAt: room.expires_at,
    participants: [...participants, { id: participantId, displayName, role: "guest", lastSeenAt: now }],
  }, 201);
}

async function postEvent(request: Request, db: WatchD1, roomId: string): Promise<Response> {
  const participant = await authenticate(request, db, roomId);
  if (!participant) return json(request, { error: "Room authorization failed." }, 401);
  const body = await readBody(request);
  const payload = String(body.payload || "");
  const targetId = body.targetId == null ? null : String(body.targetId);
  if (!payload || utf8ByteLength(payload) > WATCH_MAX_EVENT_BYTES) return json(request, { error: "The encrypted event is empty or too large." }, 413);
  if (targetId && !isWatchParticipantId(targetId)) return json(request, { error: "The target participant is invalid." }, 400);
  const kind = payload.slice(0, payload.indexOf(":"));
  const allowedKinds = new Set(["presence", "peer-offer", "peer-answer", "peer-ice", "chat", "reaction", "playback", "content-change", "media-state", "host-transfer", "room-ended"]);
  if (!allowedKinds.has(kind)) return json(request, { error: "The encrypted event type is invalid." }, 400);
  if (["host-transfer", "room-ended"].includes(kind) && participant.role !== "host") return json(request, { error: "Only the host can send this room event." }, 403);
  if (["playback", "content-change"].includes(kind) && participant.role !== "host") {
    const room = await db.prepare("SELECT control_mode FROM watch_rooms WHERE id = ? LIMIT 1").bind(roomId).first<{ control_mode: WatchControlMode }>();
    if (room?.control_mode !== "everyone") return json(request, { error: "Only the host can control playback in this room." }, 403);
  }
  const now = Date.now();
  const result = await db.prepare(`INSERT INTO watch_events
    (room_id, sender_id, target_id, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(roomId, participant.id, targetId, payload, now, now + WATCH_EVENT_TTL_MS).run();
  await db.prepare("UPDATE watch_participants SET last_seen_at = ? WHERE id = ?").bind(now, participant.id).run();
  return json(request, { accepted: result.success }, 202);
}

async function getEvents(request: Request, db: WatchD1, roomId: string): Promise<Response> {
  const participant = await authenticate(request, db, roomId);
  if (!participant) return json(request, { error: "Room authorization failed." }, 401);
  const url = new URL(request.url);
  const after = Math.max(0, Number.parseInt(url.searchParams.get("after") || "0", 10) || 0);
  const now = Date.now();
  if (now - participant.last_seen_at > 10_000) await db.prepare("UPDATE watch_participants SET last_seen_at = ? WHERE id = ?").bind(now, participant.id).run();
  const rows = await db.prepare(`SELECT seq, sender_id, target_id, payload, created_at
    FROM watch_events
    WHERE room_id = ? AND seq > ? AND (target_id IS NULL OR target_id = ?)
    ORDER BY seq ASC LIMIT 200`).bind(roomId, after, participant.id).all<{
      seq: number; sender_id: string; target_id: string | null; payload: string; created_at: number;
    }>();
  return json(request, {
    events: (rows.results || []).map((event) => ({ seq: event.seq, senderId: event.sender_id, targetId: event.target_id, payload: event.payload, createdAt: event.created_at })),
    participants: await activeParticipants(db, roomId, now),
    serverTime: now,
  });
}

async function leaveRoom(request: Request, db: WatchD1, roomId: string): Promise<Response> {
  const participant = await authenticate(request, db, roomId);
  if (!participant) return json(request, { error: "Room authorization failed." }, 401);
  await db.prepare("UPDATE watch_participants SET active = 0, last_seen_at = ? WHERE id = ?").bind(Date.now(), participant.id).run();
  return json(request, { left: true });
}

async function endRoom(request: Request, db: WatchD1, roomId: string): Promise<Response> {
  const participant = await authenticate(request, db, roomId);
  if (!participant || participant.role !== "host") return json(request, { error: "Only the host can end this room." }, 403);
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE watch_rooms SET ended_at = ? WHERE id = ?").bind(now, roomId),
    db.prepare("UPDATE watch_participants SET active = 0 WHERE room_id = ?").bind(roomId),
  ]);
  return json(request, { ended: true });
}

async function iceServers(request: Request, db: WatchD1, env: WatchApiEnv, roomId: string): Promise<Response> {
  const participant = await authenticate(request, db, roomId);
  if (!participant) return json(request, { error: "Room authorization failed." }, 401);
  if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
    try {
      const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: Math.ceil(WATCH_ROOM_TTL_MS / 1000) }),
      });
      if (response.ok) {
        const data = await response.json() as { iceServers?: RTCIceServer[] };
        if (data.iceServers?.length) return json(request, { iceServers: data.iceServers, relay: true });
      }
    } catch { /* STUN remains available when TURN credential generation is temporarily unavailable. */ }
  }
  return json(request, { iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }], relay: false });
}

export async function handleWatchApi(request: Request, env: WatchApiEnv): Promise<Response> {
  // A 204 response must have no body; Response.json() always writes one and
  // throws. Return a bodyless preflight with the CORS headers directly.
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders(request), "access-control-max-age": "86400" } });
  if (!env.DB) return json(request, { error: "Watch Together room storage is not configured." }, 503);
  try {
    await ensureSchema(env.DB);
    const now = Date.now();
    if (now - lastCleanupAt > 60_000) {
      await cleanExpired(env.DB, now);
      lastCleanupAt = now;
    }
    const path = new URL(request.url).pathname.replace(/^\/api\/watch\/?/, "");
    if (path === "health" && request.method === "GET") return json(request, { status: "ok", protocolVersion: WATCH_PROTOCOL_VERSION, serverTime: now });
    // Every handler below is awaited. Returning a bare promise from inside this
    // try block would let a rejection settle after the block exits, escaping the
    // catch entirely and surfacing an uncaught worker exception (HTTP 500 with a
    // platform error page) instead of a clean JSON error.
    if (path === "rooms" && request.method === "POST") return await rateLimit(request, env.DB, "create", 20, 60 * 60 * 1000) || await createRoom(request, env.DB);

    const match = path.match(/^rooms\/([^/]+)(?:\/(events|leave|ice))?$/);
    if (!match || !isWatchRoomId(match[1])) return json(request, { error: "Watch Together route not found." }, 404);
    const [, roomId, action] = match;
    if (!action && request.method === "POST") return await rateLimit(request, env.DB, `join:${roomId}`, 60, 10 * 60 * 1000) || await joinRoom(request, env.DB, roomId);
    if (!action && request.method === "DELETE") return await endRoom(request, env.DB, roomId);
    if (action === "events" && request.method === "POST") return await rateLimit(request, env.DB, `event-write:${roomId}:${bearerToken(request)}`, 180, 60 * 1000) || await postEvent(request, env.DB, roomId);
    if (action === "events" && request.method === "GET") return await getEvents(request, env.DB, roomId);
    if (action === "leave" && request.method === "POST") return await leaveRoom(request, env.DB, roomId);
    if (action === "ice" && request.method === "GET") return await rateLimit(request, env.DB, `ice:${roomId}`, 30, 10 * 60 * 1000) || await iceServers(request, env.DB, env, roomId);
    return json(request, { error: "Method not allowed." }, 405, { allow: "GET, POST, DELETE, OPTIONS" });
  } catch (error) {
    // Only surface the body-parsing messages we deliberately raise in readBody;
    // every other thrown error (D1/internal) returns a generic message so
    // storage internals are never leaked to the client.
    const message = error instanceof Error ? error.message : "";
    const safeMessage = /^A JSON /.test(message) ? message : "The room service could not complete the request.";
    return json(request, { error: safeMessage }, 400);
  }
}
