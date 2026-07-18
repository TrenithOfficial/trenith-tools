import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSseText, openaiDelta, anthropicDelta, geminiDelta, extractSseLine } from "../lib/sse.ts";

test("openai deltas concatenate and ignore [DONE]", () => {
  const stream = [
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":", world"}}]}\n\n',
    "data: [DONE]\n\n",
  ];
  assert.equal(collectSseText(stream, openaiDelta), "Hello, world");
});

test("openai stream survives arbitrary chunk boundaries", () => {
  const whole =
    'data: {"choices":[{"delta":{"content":"Ab"}}]}\n\ndata: {"choices":[{"delta":{"content":"cd"}}]}\n\ndata: [DONE]\n\n';
  // Split into single-character chunks to prove partial-line buffering works.
  const chunks = [...whole];
  assert.equal(collectSseText(chunks, openaiDelta), "Abcd");
});

test("anthropic pulls only text_delta events", () => {
  const stream = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"x"}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Clau"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"de"}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];
  assert.equal(collectSseText(stream, anthropicDelta), "Claude");
});

test("gemini joins parts text", () => {
  const stream = [
    'data: {"candidates":[{"content":{"parts":[{"text":"Gem"}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"ini"}]}}]}\n\n',
  ];
  assert.equal(collectSseText(stream, geminiDelta), "Gemini");
});

test("malformed json frame is skipped, not thrown", () => {
  const stream = [
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    "data: {not-json\n\n",
    'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
  ];
  assert.equal(collectSseText(stream, openaiDelta), "ok!");
});

test("non-data lines and comments produce nothing", () => {
  assert.equal(extractSseLine(": keep-alive comment", openaiDelta), "");
  assert.equal(extractSseLine("event: ping", openaiDelta), "");
  assert.equal(extractSseLine("", openaiDelta), "");
});
