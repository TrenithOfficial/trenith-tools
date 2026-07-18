"use client";

import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";

const categories = [
  ["problem", "Problem"],
  ["idea", "New idea"],
  ["improvement", "Improvement"],
  ["other", "Other"],
] as const;

const CONTACT = "info@trenith.com";

function EnvelopeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M4 7l8 6 8-6" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("problem");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"form" | "delivered" | "email">("form");
  const [error, setError] = useState("");

  const mailtoHref = `mailto:${CONTACT}?subject=${encodeURIComponent(`Trenith Tools feedback · ${category} · ${pathname}`)}&body=${encodeURIComponent(`${message}\n\n— Sent from ${pathname}${email ? `\nReply to: ${email}` : ""}`)}`;

  function reset() {
    setState("form"); setError(""); setMessage(""); setEmail("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, message, email, website, page: pathname }),
      });
      const data = await response.json() as { ok?: boolean; unconfigured?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "The feedback could not be sent.");
      if (data.unconfigured) {
        // No managed channel on this deployment: deliver through the visitor's
        // own mail client so the message still reaches the team.
        setState("email");
        window.location.href = mailtoHref;
        return;
      }
      setState("delivered");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feedback could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="feedback-widget">
    {open && <div className="feedback-panel workspace-panel" role="dialog" aria-label="Send feedback">
      <div className="feedback-head"><strong>Help improve Trenith Tools</strong><button type="button" onClick={() => { setOpen(false); reset(); }} aria-label="Close feedback"><CloseIcon /></button></div>

      {state === "delivered" && <div className="feedback-done"><span>✓</span><p>Thank you. Your note reached the team and directly shapes what gets fixed and built next.</p><button type="button" className="secondary-button" onClick={reset}>Send another</button></div>}

      {state === "email" && <div className="feedback-done"><span>✓</span><p>Your feedback is ready in your email app — just press send to deliver it to the Trenith team. If it did not open, use the button below.</p><a className="primary-action" href={mailtoHref}>Open email to send<span>→</span></a><button type="button" className="secondary-button" onClick={reset}>Send another</button></div>}

      {state === "form" && <form onSubmit={submit}>
        <p>Found a problem, hit trouble, or have an idea? It lands with the people who build this site.</p>
        <div className="feedback-categories">{categories.map(([id, label]) => <button type="button" key={id} className={category === id ? "active" : ""} onClick={() => setCategory(id)}>{label}</button>)}</div>
        <label>What happened, or what should exist?<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={4000} required minLength={10} placeholder="The more specific, the faster it gets fixed…" /></label>
        <label>Reply email (optional)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} placeholder="you@example.com" autoComplete="email" /></label>
        <input className="feedback-website" type="text" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" placeholder="Leave this empty" />
        {error && <div className="workspace-error" role="alert">{error}</div>}
        <button className="primary-action" disabled={busy || message.trim().length < 10}>{busy ? "Sending…" : "Send feedback"}<span>→</span></button>
        <small>Includes the current page path so the report has context. No file contents or keys are ever attached.</small>
      </form>}
    </div>}
    <button type="button" className="feedback-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close feedback" : "Send feedback or report a problem"}>
      <i className="feedback-icon">{open ? <CloseIcon /> : <EnvelopeIcon />}</i><span>{open ? "Close" : "Feedback"}</span>
    </button>
  </div>;
}
