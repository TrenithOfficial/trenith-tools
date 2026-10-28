"use client";

import type { WatchEncryptedEvent, WatchProviderId, WatchRoomSession } from "../packages/watch-core";

export type RoomEventResponse = {
  events: WatchEncryptedEvent[];
  participants: WatchRoomSession["participants"];
  serverTime: number;
  // Absent from a protocol-1 room service; the room page falls back to the
  // roster roles and the session's control mode.
  hostId?: string | null;
  locked?: boolean;
  controlMode?: "host" | "everyone";
};

type IceResponse = { iceServers: RTCIceServer[]; relay: boolean };

async function watchRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/watch/${path.replace(/^\//, "")}`, {
      ...init,
      cache: "no-store",
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new WatchRequestError("You appear to be offline, or the room service could not be reached. Check your connection and try again.", 0);
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!response.ok) {
    // A proxy or worker outage returns a bare gateway status; say what it
    // means instead of "Room request failed (502)".
    const outage = response.status >= 500 && response.status !== 503 ? "The Watch Together room service is not responding right now. Try again in a minute." : response.status === 503 && !body.error ? "Watch Together is not configured on this deployment yet." : "";
    throw new WatchRequestError(body.error || outage || `Room request failed (${response.status}).`, response.status, body.code);
  }
  return body;
}

export class WatchRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "WatchRequestError";
  }
}

const ACCESS_KEY_STORAGE = "trenith-watch-access";

export function getWatchAccessKey(): string {
  try { return localStorage.getItem(ACCESS_KEY_STORAGE) || ""; } catch { return ""; }
}
export function setWatchAccessKey(key: string) {
  try { if (key) localStorage.setItem(ACCESS_KEY_STORAGE, key); else localStorage.removeItem(ACCESS_KEY_STORAGE); } catch { /* storage unavailable */ }
}

export type WatchAccessResult = { status: "approved" | "approved-existing" | "pending"; accessKey?: string; message: string };

// Request access to create rooms. Approved emails (the configured domain) get a
// key back immediately; everyone else is told they will be reviewed.
export function requestWatchAccess(input: { name: string; email: string; reason?: string }) {
  return watchRequest<WatchAccessResult>("access", { method: "POST", body: JSON.stringify({ displayName: input.name, email: input.email, reason: input.reason || "" }) });
}

export function createRoom(input: { displayName: string; provider: WatchProviderId; controlMode: "host" | "everyone"; inviteProof: string }) {
  return watchRequest<WatchRoomSession>("rooms", {
    method: "POST",
    headers: { "x-watch-access": getWatchAccessKey() },
    body: JSON.stringify(input),
  });
}

export function joinRoom(roomId: string, input: { displayName: string; inviteProof: string }) {
  return watchRequest<WatchRoomSession>(`rooms/${roomId}`, { method: "POST", body: JSON.stringify(input) });
}

export function getRoomEvents(roomId: string, token: string, after: number, signal?: AbortSignal) {
  return watchRequest<RoomEventResponse>(`rooms/${roomId}/events?after=${after}`, {
    headers: { authorization: `Bearer ${token}` }, signal,
  });
}

export function sendRoomEvent(roomId: string, token: string, payload: string, targetId?: string | null) {
  return watchRequest<{ accepted: boolean }>(`rooms/${roomId}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ payload, targetId: targetId || null }),
  });
}

export function leaveRoom(roomId: string, token: string) {
  return watchRequest<{ left: boolean; newHostId: string | null }>(`rooms/${roomId}/leave`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: "{}",
    keepalive: true,
  });
}

export function transferHost(roomId: string, token: string, participantId: string) {
  return watchRequest<{ hostId: string }>(`rooms/${roomId}/transfer`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ participantId }) });
}

export function removeParticipant(roomId: string, token: string, participantId: string) {
  return watchRequest<{ removed: boolean }>(`rooms/${roomId}/remove`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ participantId }) });
}

export function setRoomLock(roomId: string, token: string, locked: boolean) {
  return watchRequest<{ locked: boolean }>(`rooms/${roomId}/lock`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ locked }) });
}

export function endRoom(roomId: string, token: string) {
  return watchRequest<{ ended: boolean }>(`rooms/${roomId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
}

export function getIceServers(roomId: string, token: string) {
  return watchRequest<IceResponse>(`rooms/${roomId}/ice`, { headers: { authorization: `Bearer ${token}` } });
}

export function saveRoomSession(session: WatchRoomSession, secret: string, proof: string) {
  sessionStorage.setItem(`trenith-watch:${session.roomId}`, JSON.stringify({ session, secret, proof }));
}

export function loadRoomSession(roomId: string): { session: WatchRoomSession; secret: string; proof: string } | null {
  try {
    const value = sessionStorage.getItem(`trenith-watch:${roomId}`);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function clearRoomSession(roomId: string) {
  sessionStorage.removeItem(`trenith-watch:${roomId}`);
}
