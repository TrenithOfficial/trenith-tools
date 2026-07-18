// Branded HTML email for feedback notifications, matching the Trenith Tools
// site (shield mark, cream surface, blue accent). Table-based with inline styles
// so it renders consistently across email clients; every user-supplied value is
// HTML-escaped to prevent injection into the message body.

export type FeedbackEmailData = {
  category: string;
  message: string;
  page: string;
  email: string;
  receivedAt: string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CATEGORY_LABELS: Record<string, string> = {
  problem: "Problem",
  idea: "New idea",
  improvement: "Improvement",
  other: "Other",
};

export function renderFeedbackEmail(data: FeedbackEmailData): string {
  const label = CATEGORY_LABELS[data.category] || "Feedback";
  const message = escapeHtml(data.message);
  const page = escapeHtml(data.page);
  const email = escapeHtml(data.email);
  const received = escapeHtml(data.receivedAt);
  const row = (name: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#8a8792;font-size:13px;width:96px;vertical-align:top;">${name}</td><td style="padding:6px 0;color:#26242e;font-size:13px;">${value}</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf8;border:1px solid #e7e2d6;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(61,50,28,.08);">
<tr><td style="padding:20px 26px;border-bottom:1px solid #eee7d8;">
<img src="https://tools.trenith.com/trenith-mark.png" width="28" height="28" alt="Trenith" style="vertical-align:middle;border:0;">
<span style="vertical-align:middle;font-weight:800;letter-spacing:.12em;font-size:14px;color:#191821;padding-left:9px;">TRENITH <span style="color:#2540b8;">TOOLS</span></span>
</td></tr>
<tr><td style="padding:26px;">
<span style="display:inline-block;background:rgba(40,85,255,.1);color:#2540b8;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;">${escapeHtml(label)}</span>
<h1 style="margin:14px 0 4px;font-size:19px;font-weight:800;color:#191821;">New feedback from Trenith Tools</h1>
<p style="margin:0 0 18px;color:#6e6b76;font-size:14px;">Shared through the on-site feedback widget.</p>
<div style="background:#faf7ef;border:1px solid #eee7d8;border-radius:12px;padding:16px 18px;color:#26242e;font-size:15px;line-height:1.62;white-space:pre-wrap;word-break:break-word;">${message}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
${row("Page", page)}
${row("Reply to", email)}
${row("Received", received)}
</table>
</td></tr>
<tr><td style="padding:15px 26px;border-top:1px solid #eee7d8;color:#8a8792;font-size:12px;line-height:1.55;">
Sent from the tools.trenith.com feedback widget. No file contents or API keys are ever attached.
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// Plain-text fallback for clients that don't render HTML.
export function renderFeedbackText(data: FeedbackEmailData): string {
  return `${data.message}\n\nCategory: ${CATEGORY_LABELS[data.category] || "Feedback"}\nPage: ${data.page}\nReply to: ${data.email}\nReceived: ${data.receivedAt}`;
}
