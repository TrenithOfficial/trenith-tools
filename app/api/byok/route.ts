import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientKey } from "../../../lib/rate-limit";
import { anthropicDelta, geminiDelta, openaiDelta, sseToTextStream, type SseExtractor } from "../../../lib/sse";

export const runtime = "edge";

const providers = new Set(["openai", "anthropic", "gemini", "elevenlabs", "openrouter"]);
const MAX_PROMPT = 40_000;

function cleanMessage(value: unknown) {
  return typeof value === "string" ? value.slice(0, 600) : "The provider request failed.";
}

async function providerError(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string } | string; message?: string };
    return typeof body.error === "string" ? body.error : body.error?.message || body.message || `Provider returned HTTP ${response.status}.`;
  } catch { return `Provider returned HTTP ${response.status}.`; }
}

// Text generations are streamed so the edge function can flush its initial
// response well within Vercel's 25s limit while the model keeps producing
// tokens; buffering the whole answer server-side previously timed out long
// generations. The provider request already ran and returned an OK status, so
// this only forwards the body as decoded text deltas.
function streamedText(response: Response, extract: SseExtractor) {
  if (!response.body) return NextResponse.json({ error: "The provider returned no response body." }, { status: 502, headers: { "cache-control": "no-store" } });
  return new Response(sseToTextStream(response.body, extract), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

const MAX_IMAGE_DATA_URL = 4_500_000;
const IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function POST(request: NextRequest) {
  try {
    if (!allowRequest(`byok:${clientKey(request.headers)}`, 60, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many provider requests from this connection. Please wait a few minutes." }, { status: 429 });
    }
    const body = await request.json() as { action?: string; provider?: string; apiKey?: string; model?: string; prompt?: string; voiceId?: string; imageDataUrl?: string };
    const provider = String(body.provider || "");
    const apiKey = String(body.apiKey || "").trim();
    const model = String(body.model || "").trim();
    const prompt = String(body.prompt || "").trim().slice(0, MAX_PROMPT);
    const action = body.action === "test" ? "test" : "generate";
    let image: { mime: string; base64: string } | null = null;
    if (body.imageDataUrl) {
      if (String(body.imageDataUrl).length > MAX_IMAGE_DATA_URL) throw new Error("Images for vision requests are limited to about 3 MB. Reduce the scan first.");
      const match = String(body.imageDataUrl).match(IMAGE_DATA_URL_PATTERN);
      if (!match) throw new Error("Vision requests accept JPEG, PNG or WebP images.");
      image = { mime: match[1], base64: match[2] };
    }
    if (!providers.has(provider)) throw new Error("This endpoint supports OpenAI, Anthropic, Gemini, ElevenLabs and OpenRouter connections.");
    if (!apiKey || apiKey.length < 8) throw new Error("Add a valid provider API key.");

    let response: Response;
    if (action === "test") {
      if (provider === "openai") response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
      else if (provider === "openrouter") response = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
      else if (provider === "anthropic") response = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } });
      else if (provider === "gemini") response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": apiKey } });
      else response = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey } });
      if (!response.ok) throw new Error(await providerError(response));
      return NextResponse.json({ ok: true, message: "Connection verified with the provider." });
    }

    if (!prompt) throw new Error("Enter a prompt or text to process.");
    if (!model) throw new Error("Enter a provider model name.");
    if (provider === "openai" || provider === "openrouter") {
      const endpoint = provider === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
      const content = image ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.base64}` } }] : prompt;
      response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}`, ...(provider === "openrouter" ? { "HTTP-Referer": "https://trenith.com", "X-Title": "Trenith Tools" } : {}) }, body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content }] }) });
      if (!response.ok) throw new Error(await providerError(response));
      return streamedText(response, openaiDelta);
    }
    if (provider === "anthropic") {
      const content = image ? [{ type: "text", text: prompt }, { type: "image", source: { type: "base64", media_type: image.mime, data: image.base64 } }] : prompt;
      response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, stream: true, max_tokens: 8192, messages: [{ role: "user", content }] }) });
      if (!response.ok) throw new Error(await providerError(response));
      return streamedText(response, anthropicDelta);
    }
    if (provider === "gemini") {
      const parts = image ? [{ text: prompt }, { inline_data: { mime_type: image.mime, data: image.base64 } }] : [{ text: prompt }];
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ contents: [{ parts }] }) });
      if (!response.ok) throw new Error(await providerError(response));
      return streamedText(response, geminiDelta);
    }
    const voiceId = String(body.voiceId || "").trim();
    if (!voiceId) throw new Error("Add an ElevenLabs voice ID in Connections.");
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, { method: "POST", headers: { "content-type": "application/json", "xi-api-key": apiKey, accept: "audio/mpeg" }, body: JSON.stringify({ text: prompt, model_id: model }) });
    if (!response.ok) throw new Error(await providerError(response));
    return new NextResponse(response.body, { headers: { "content-type": "audio/mpeg", "content-disposition": "attachment; filename=trenith-speech.mp3", "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: cleanMessage(error instanceof Error ? error.message : error) }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
