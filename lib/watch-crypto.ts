"use client";

import type { WatchRoomMessage } from "../packages/watch-core/index.ts";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createWatchSecret(bytes = 24): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function importWatchRoomKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`trenith-watch-v1:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptWatchMessage(key: CryptoKey, message: WatchRoomMessage): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(message));
  const kind = message.type;
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(kind) }, key, plaintext);
  return `${kind}:${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptWatchMessage(key: CryptoKey, payload: string): Promise<WatchRoomMessage> {
  const separator = payload.indexOf(":");
  const kind = payload.slice(0, separator);
  const [ivValue, ciphertextValue] = payload.slice(separator + 1).split(".");
  if (!ivValue || !ciphertextValue) throw new Error("Invalid encrypted room message.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(ivValue) as BufferSource, additionalData: new TextEncoder().encode(kind) }, key, fromBase64Url(ciphertextValue) as BufferSource);
  const message = JSON.parse(new TextDecoder().decode(plaintext)) as WatchRoomMessage;
  if (message.type !== kind) throw new Error("The encrypted room event type does not match its authenticated envelope.");
  return message;
}
