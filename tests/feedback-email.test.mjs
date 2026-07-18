import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderFeedbackEmail, renderFeedbackText } from "../lib/feedback-email.ts";

test("escapeHtml neutralizes HTML-significant characters", () => {
  assert.equal(escapeHtml(`<script>&"'`), "&lt;script&gt;&amp;&quot;&#39;");
  assert.equal(escapeHtml("plain text"), "plain text");
});

test("renderFeedbackEmail escapes user content so it cannot inject markup", () => {
  const html = renderFeedbackEmail({
    category: "problem",
    message: "<img src=x onerror=alert(1)> hello",
    page: "/tools/audio-converter",
    email: "user@example.com",
    receivedAt: "2026-07-18T00:00:00.000Z",
  });
  assert.ok(!html.includes("<img src=x"), "raw injected tag must be escaped");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"), "escaped content present");
  assert.ok(html.includes("TRENITH"));
  assert.ok(html.includes("trenith-mark.png"));
  assert.ok(html.includes("Problem"));
  assert.ok(html.includes("/tools/audio-converter"));
  assert.ok(html.includes("user@example.com"));
  assert.ok(html.trimStart().startsWith("<!doctype html>"));
});

test("renderFeedbackText produces a readable plain-text fallback", () => {
  const text = renderFeedbackText({
    category: "idea",
    message: "Add a QR generator",
    page: "/tools",
    email: "not provided",
    receivedAt: "2026-07-18T00:00:00.000Z",
  });
  assert.ok(text.includes("Add a QR generator"));
  assert.ok(text.includes("Category: New idea"));
  assert.ok(text.includes("Page: /tools"));
});
