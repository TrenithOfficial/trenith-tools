"use client";

import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useRef, useState } from "react";
import { useDialogFocus } from "../lib/use-dialog-focus";

const categories = [
  ["problem", "Problem"],
  ["idea", "New idea"],
  ["improvement", "Improvement"],
  ["other", "Other"],
] as const;

const CONTACT = "info@trenith.com";
const MIN_LENGTH = 10;

function EnvelopeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M4 7l8 6 8-6" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("problem");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"form" | "delivered" | "email">("form");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const label = categories.find(([id]) => id === category)?.[1] || category;
  const feedbackBody = `${message}\n\nCategory: ${label}\nPage: ${pathname}${email ? `\nReply to: ${email}` : ""}`;
  const mailtoHref = `mailto:${CONTACT}?subject=${encodeURIComponent(`Trenith Tools feedback · ${label} · ${pathname}`)}&body=${encodeURIComponent(feedbackBody)}`;

  function reset() {
    setState("form"); setError(""); setMessage(""); setEmail(""); setCopied(false);
  }

  const panelRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => { setOpen(false); reset(); }, []);
  useDialogFocus(open, panelRef, closePanel);

  async function copyFeedback() {
    try {
      await navigator.clipboard.writeText(`${feedbackBody}\n\nSend to: ${CONTACT}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Validate here rather than disabling the button, so a tap always gives a
    // visible response instead of silently doing nothing.
    if (message.trim().length < MIN_LENGTH) {
      setError(`Please add a little more detail — at least ${MIN_LENGTH} characters.`);
      messageRef.current?.focus();
      return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, message, email, website, page: pathname }),
      });
      const data = await response.json() as { ok?: boolean; unconfigured?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "The feedback could not be sent.");
      // No managed channel on this deployment: show a clear, always-visible way
      // to send it (copy or open an email) rather than silently opening a mail
      // client that may not exist.
      setState(data.unconfigured ? "email" : "delivered");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feedback could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="feedback-widget">
    {open && <button type="button" className="feedback-scrim" aria-label="Close feedback" onClick={closePanel} />}
    {open && <div className="feedback-panel workspace-panel" role="dialog" aria-modal="true" aria-label="Send feedback" ref={panelRef} tabIndex={-1}>
      <div className="feedback-head"><strong>Help improve Trenith Tools</strong><button type="button" onClick={closePanel} aria-label="Close feedback"><CloseIcon /></button></div>

      {state === "delivered" && <div className="feedback-done"><span>✓</span><p>Thank you. Your note reached the team and directly shapes what gets fixed and built next.</p><button type="button" className="secondary-button" onClick={reset}>Send another</button></div>}

      {state === "email" && <div className="feedback-done"><span>✓</span><strong className="feedback-done-title">Thank you — your note is captured</strong><p>One tap sends it straight to the Trenith team who build this site. Your email app opens with everything pre-filled.</p><div className="feedback-send-actions"><a className="primary-action" href={mailtoHref}>Open email to send<span>→</span></a><button type="button" className="secondary-button" onClick={copyFeedback}>{copied ? "Copied ✓" : "Copy instead"}</button></div><p className="feedback-address">Prefer to write us directly? <a href={mailtoHref}>{CONTACT}</a></p><button type="button" className="text-button" onClick={reset}>Send another</button></div>}

      {state === "form" && <form onSubmit={submit}>
        <p>Found a problem, hit trouble, or have an idea? It lands with the people who build this site.</p>
        <div className="feedback-categories">{categories.map(([id, categoryLabel]) => <button type="button" key={id} className={category === id ? "active" : ""} onClick={() => setCategory(id)}>{categoryLabel}</button>)}</div>
        <label>What happened, or what should exist?<textarea ref={messageRef} value={message} onChange={(event) => { setMessage(event.target.value); if (error) setError(""); }} rows={4} maxLength={4000} placeholder="The more specific, the faster it gets fixed…" /></label>
        <label>Reply email (optional)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} placeholder="you@example.com" autoComplete="email" /></label>
        <input className="feedback-website" type="text" value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" placeholder="Leave this empty" />
        {error && <div className="workspace-error" role="alert">{error}</div>}
        <button type="submit" className="primary-action" disabled={busy}>{busy ? "Sending…" : "Send feedback"}<span>→</span></button>
        <small>Includes the current page path so the report has context. No file contents or keys are ever attached.</small>
      </form>}
    </div>}
    <button type="button" className="feedback-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close feedback" : "Send feedback or report a problem"}>
      <i className="feedback-icon">{open ? <CloseIcon /> : <EnvelopeIcon />}</i><span>{open ? "Close" : "Feedback"}</span>
    </button>
  </div>;
}
