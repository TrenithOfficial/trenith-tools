"use client";

export type ProviderId = "openai" | "anthropic" | "gemini" | "elevenlabs" | "openrouter" | "compatible";

export type ByokConnection = {
  id: string;
  provider: ProviderId;
  label: string;
  apiKey: string;
  model: string;
  voiceId?: string;
  endpoint?: string;
};

export const providerDefinitions: Record<ProviderId, { name: string; description: string; defaultModel: string; keyLabel: string }> = {
  openai: { name: "OpenAI", description: "Text generation through the official OpenAI API.", defaultModel: "gpt-4.1-mini", keyLabel: "OpenAI API key" },
  anthropic: { name: "Anthropic", description: "Claude text generation through the official Anthropic API.", defaultModel: "claude-sonnet-4-5", keyLabel: "Anthropic API key" },
  gemini: { name: "Google Gemini", description: "Gemini content generation through Google AI Studio.", defaultModel: "gemini-2.5-flash", keyLabel: "Gemini API key" },
  elevenlabs: { name: "ElevenLabs", description: "Speech generation using your voice ID and ElevenLabs account.", defaultModel: "eleven_multilingual_v2", keyLabel: "ElevenLabs API key" },
  openrouter: { name: "OpenRouter", description: "Access OpenAI-compatible models with your OpenRouter key.", defaultModel: "openai/gpt-4.1-mini", keyLabel: "OpenRouter API key" },
  compatible: { name: "Compatible endpoint", description: "Use an OpenAI-compatible HTTPS endpoint that permits browser CORS.", defaultModel: "model-name", keyLabel: "Endpoint API key" },
};

const SESSION_KEY = "trenith-byok-session";
const ENCRYPTED_KEY = "trenith-byok-encrypted";

export function readSessionConnections(): ByokConnection[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]") as ByokConnection[]; } catch { return []; }
}

export function writeSessionConnections(connections: ByokConnection[]) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(connections));
  window.dispatchEvent(new CustomEvent("trenith-connections-change"));
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 180_000 }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function saveEncryptedConnections(connections: ByokConnection[], passphrase: string) {
  if (passphrase.length < 10) throw new Error("Use a passphrase with at least 10 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(connections)));
  localStorage.setItem(ENCRYPTED_KEY, JSON.stringify({ salt: toBase64(salt), iv: toBase64(iv), cipher: toBase64(new Uint8Array(cipher)), version: 1 }));
}

export async function unlockEncryptedConnections(passphrase: string) {
  const stored = localStorage.getItem(ENCRYPTED_KEY);
  if (!stored) throw new Error("No encrypted device vault was found.");
  try {
    const payload = JSON.parse(stored) as { salt: string; iv: string; cipher: string };
    const salt = fromBase64(payload.salt);
    const iv = fromBase64(payload.iv);
    const key = await deriveKey(passphrase, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, fromBase64(payload.cipher));
    const connections = JSON.parse(new TextDecoder().decode(plain)) as ByokConnection[];
    writeSessionConnections(connections);
    return connections;
  } catch {
    throw new Error("The passphrase is incorrect or the encrypted vault is damaged.");
  }
}

export function clearEncryptedConnections() {
  localStorage.removeItem(ENCRYPTED_KEY);
}

export function hasEncryptedVault() {
  return Boolean(localStorage.getItem(ENCRYPTED_KEY));
}

