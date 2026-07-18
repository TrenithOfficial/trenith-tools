import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientKey } from "../../../lib/rate-limit";

export const runtime = "edge";

const CATEGORIES = new Set(["problem", "idea", "improvement", "other"]);
const MAX_MESSAGE = 4000;
const MAX_EMAIL = 200;
const MAX_PAGE = 300;

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    if (!allowRequest(`feedback:${clientKey(request.headers)}`, 5, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many submissions from this connection. Please try again later." }, { status: 429 });
    }
    const body = await request.json() as { category?: string; message?: string; email?: string; page?: string; website?: string };
    if (clean(body.website, 50)) return NextResponse.json({ ok: true }); // honeypot: pretend success
    const category = CATEGORIES.has(String(body.category)) ? String(body.category) : "other";
    const message = clean(body.message, MAX_MESSAGE);
    const email = clean(body.email, MAX_EMAIL);
    const page = clean(body.page, MAX_PAGE);
    if (message.length < 10) return NextResponse.json({ error: "Describe the issue or idea in at least 10 characters." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter a valid reply email or leave it empty." }, { status: 400 });

    const submission = {
      source: "tools.trenith.com feedback widget",
      category,
      message,
      email: email || "not provided",
      page,
      userAgent: clean(request.headers.get("user-agent"), 300),
      receivedAt: new Date().toISOString(),
    };

    const webhook = process.env.FEEDBACK_WEBHOOK_URL;
    const emailTo = process.env.FEEDBACK_EMAIL_TO || "info@trenith.com";

    // A configured channel that fails (bad key, unverified sender, downtime)
    // must never hard-error the visitor: it degrades to the mail-client
    // fallback so feedback always has a way through.
    if (webhook && /^https:\/\//.test(webhook)) {
      try {
        const delivered = await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: `Trenith Tools feedback (${category}) on ${page}:\n${message}\nReply: ${submission.email}`, ...submission }),
        });
        if (delivered.ok) return NextResponse.json({ ok: true });
      } catch { /* fall through to the mail fallback */ }
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const delivered = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "content-type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: process.env.FEEDBACK_EMAIL_FROM || "Trenith Tools <onboarding@resend.dev>",
            to: [emailTo],
            subject: `Tools feedback · ${category} · ${page}`,
            text: `${message}\n\nPage: ${page}\nReply to: ${submission.email}\nUser agent: ${submission.userAgent}\nReceived: ${submission.receivedAt}`,
          }),
        });
        if (delivered.ok) return NextResponse.json({ ok: true });
      } catch { /* fall through to the mail fallback */ }
    }

    // No channel configured, or the configured one failed: let the widget open
    // the visitor's mail client so the message still reaches the team.
    return NextResponse.json({ ok: false, unconfigured: true, contact: emailTo });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : "The feedback could not be sent." }, { status: 400 });
  }
}
