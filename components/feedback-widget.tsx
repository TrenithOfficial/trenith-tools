"use client";

import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";

const categories = [
  ["problem", "Problem"],
  ["idea", "New idea"],
  ["improvement", "Improvement"],
  ["other", "Other"],
] as const;

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("problem");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [fallbackContact, setFallbackContact] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setFallbackContact("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, message, email, website, page: pathname }),
      });
      const data = await response.json() as { ok?: boolean; unconfigured?: boolean; contact?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "The feedback could not be sent.");
      if (data.unconfigured && data.contact) { setFallbackContact(data.contact); return; }
      setDone(true);
      setMessage(""); setEmail("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feedback could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  const mailtoHref = fallbackContact
    ? `mailto:${fallbackContact}?subject=${encodeURIComponent(`Trenith Tools feedback · ${category} · ${pathname}`)}&body=${encodeURIComponent(message)}`
    : "";

  return <div className="feedback-widget">
    {open && <div className="feedback-panel workspace-panel" role="dialog" aria-label="Send feedback">
      <div className="feedback-head"><strong>Help improve Trenith Tools</strong><button type="button" onClick={() => { setOpen(false); setDone(false); setError(""); setFallbackContact(""); }} aria-label="Close feedback">×</button></div>
      {done ? <div className="feedback-done"><span>✓</span><p>Thank you. Your note reached the team and directly shapes what gets fixed and built next.</p><button type="button" className="secondary-button" onClick={() => setDone(false)}>Send another</button></div>
        : <form onSubmit={submit}>
          <p>Found a problem, hit trouble, or have an idea? It lands with the people who build this site.</p>
          <div className="feedback-categories">{categories.map(([id, label]) => <button type="button" key={id} className={category === id ? "active" : ""} onClick={() => setCategory(id)}>{label}</button>)}</div>
          <label>What happened, or what should exist?<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={4000} required minLength={10} placeholder="The more specific, the faster it gets fixed…" /></label>
          <label>Reply email (optional)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} placeholder="you@example.com" autoComplete="email" /></label>
          <input className="feedback-website" type="text" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" placeholder="Leave this empty" />
          {error && <div className="workspace-error" role="alert">{error}</div>}
          {fallbackContact && <div className="feedback-fallback">Direct delivery is not configured yet on this deployment. <a href={mailtoHref}>Email this feedback to {fallbackContact} →</a></div>}
          <button className="primary-action" disabled={busy || message.trim().length < 10}>{busy ? "Sending…" : "Send feedback"}<span>→</span></button>
          <small>Includes the current page path so the report has context. No file contents or keys are ever attached.</small>
        </form>}
    </div>}
    <button type="button" className="feedback-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close feedback" : "Send feedback or report a problem"}>
      {open ? "×" : "✉"}<span>{open ? "Close" : "Feedback"}</span>
    </button>
  </div>;
}
