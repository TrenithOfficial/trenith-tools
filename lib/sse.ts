// Server-sent-event parsing for the BYOK provider proxy. Kept as small pure
// functions so the delta extraction is unit-testable without a network call,
// and so the edge route can forward provider streams within the 25s
// initial-response window instead of buffering a whole generation and timing
// out. Each provider frames its stream differently; the extractors below pull
// the plain text delta out of one `data:` payload.

export type SseExtractor = (json: unknown) => string;

type OpenAiChunk = { choices?: Array<{ delta?: { content?: string } }> };
type AnthropicChunk = { type?: string; delta?: { type?: string; text?: string } };
type GeminiChunk = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

export const openaiDelta: SseExtractor = (json) => (json as OpenAiChunk)?.choices?.[0]?.delta?.content ?? "";

export const anthropicDelta: SseExtractor = (json) => {
  const chunk = json as AnthropicChunk;
  return chunk?.type === "content_block_delta" && chunk?.delta?.type === "text_delta" ? chunk.delta.text ?? "" : "";
};

export const geminiDelta: SseExtractor = (json) => {
  const parts = (json as GeminiChunk)?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.map((part) => part?.text ?? "").join("") : "";
};

// Extract the text delta from a single SSE line (e.g. `data: {"...":"..."}`).
// Returns "" for comments, the `[DONE]` sentinel, blank lines and unparsable
// payloads so a malformed frame can never break the stream.
export function extractSseLine(rawLine: string, extract: SseExtractor): string {
  const line = rawLine.trim();
  if (!line.startsWith("data:")) return "";
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    return extract(JSON.parse(payload)) || "";
  } catch {
    return "";
  }
}

// Pure helper the tests exercise: feed the raw SSE text (possibly split across
// arbitrary chunk boundaries) and get back the concatenated model text.
export function collectSseText(chunks: string[], extract: SseExtractor): string {
  let buffer = "";
  let output = "";
  const drain = (flush: boolean) => {
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      output += extractSseLine(buffer.slice(0, index), extract);
      buffer = buffer.slice(index + 1);
    }
    if (flush && buffer.trim()) {
      output += extractSseLine(buffer, extract);
      buffer = "";
    }
  };
  for (const chunk of chunks) {
    buffer += chunk;
    drain(false);
  }
  drain(true);
  return output;
}

// Transform an upstream provider SSE body into a plain UTF-8 text stream of
// deltas. Returning this immediately lets the edge function flush its initial
// response fast while the model keeps generating.
export function sseToTextStream(upstream: ReadableStream<Uint8Array>, extract: SseExtractor): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const push = (rawLine: string) => {
        const text = extractSseLine(rawLine, extract);
        if (text) controller.enqueue(encoder.encode(text));
      };
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) push(buffer);
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        push(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}
