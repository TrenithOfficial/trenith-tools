"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "../lib/use-dialog-focus";

type Consent = {
  version: 1;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  updatedAt: string;
  gpc: boolean;
};

type ConsentWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
  google_tag_manager?: unknown;
};

const STORAGE_KEY = "trenith-tools-consent-v1";
const OPEN_EVENT = "trenith:open-privacy-settings";

function hasGpc() {
  return typeof navigator !== "undefined" && Boolean((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl);
}

function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as Consent : null;
  } catch {
    return null;
  }
}

function persistConsent(consent: Consent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
}

function applyGoogleConsent(consent: Consent) {
  const target = window as ConsentWindow;
  target.dataLayer = target.dataLayer || [];
  target.gtag = target.gtag || function gtag(...args: unknown[]) { target.dataLayer?.push(args); };
  target.gtag("consent", "update", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
    functionality_storage: consent.preferences ? "granted" : "denied",
    personalization_storage: consent.preferences ? "granted" : "denied",
    security_storage: "granted",
  });
}

function loadGoogleTag(consent: Consent) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  // Fetch the Google tag only once the visitor has granted the matching consent —
  // analytics for GA, marketing for Ads. "Reject non-essential" loads no script.
  const tagId = (measurementId && consent.analytics) ? measurementId
    : (adsId && consent.marketing) ? adsId
    : "";
  if (!tagId || document.querySelector("script[data-trenith-google-tag]")) return;
  const target = window as ConsentWindow;
  target.dataLayer = target.dataLayer || [];
  target.gtag = target.gtag || function gtag(...args: unknown[]) { target.dataLayer?.push(args); };
  target.gtag("js", new Date());
  if (measurementId && consent.analytics) {
    target.gtag("config", measurementId, {
      anonymize_ip: true,
      allow_google_signals: consent.marketing,
      allow_ad_personalization_signals: consent.marketing,
      linker: { domains: ["trenith.com", "www.trenith.com", "tools.trenith.com", "tools.trenith.in"] },
    });
  }
  if (adsId && consent.marketing) target.gtag("config", adsId);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  script.dataset.trenithGoogleTag = "true";
  document.head.appendChild(script);
}

export function openPrivacySettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function ConsentManager() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [preferences, setPreferences] = useState(false);

  useEffect(() => {
    const stored = readConsent();
    const gpc = hasGpc();
    const resolved = stored ? { ...stored, marketing: gpc ? false : stored.marketing, gpc } : null;
    if (resolved) {
      applyGoogleConsent(resolved);
      loadGoogleTag(resolved);
    } else {
      const denied: Consent = { version: 1, analytics: false, marketing: false, preferences: false, updatedAt: new Date().toISOString(), gpc };
      applyGoogleConsent(denied);
    }
    const frame = requestAnimationFrame(() => {
      if (resolved) {
        setConsent(resolved);
        setAnalytics(resolved.analytics);
        setMarketing(resolved.marketing);
        setPreferences(resolved.preferences);
      } else setOpen(true);
      setReady(true);
    });
    const show = () => { setCustomize(true); setOpen(true); };
    window.addEventListener(OPEN_EVENT, show);
    return () => { cancelAnimationFrame(frame); window.removeEventListener(OPEN_EVENT, show); };
  }, []);

  function save(next: Pick<Consent, "analytics" | "marketing" | "preferences">) {
    const value: Consent = { version: 1, ...next, marketing: hasGpc() ? false : next.marketing, updatedAt: new Date().toISOString(), gpc: hasGpc() };
    persistConsent(value);
    setConsent(value);
    setAnalytics(value.analytics);
    setMarketing(value.marketing);
    setPreferences(value.preferences);
    applyGoogleConsent(value);
    loadGoogleTag(value);
    setOpen(false);
    setCustomize(false);
  }

  // Escape declines the optional categories rather than dismissing silently, so
  // closing the banner can never be mistaken for consent.
  useDialogFocus(ready && open, panelRef, () => save({ analytics: false, marketing: false, preferences: false }));

  return <>
    {ready && consent?.analytics && <><Analytics /><SpeedInsights /></>}
    {ready && open && <div className="consent-backdrop" role="presentation">
      <section className="consent-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title" ref={panelRef} tabIndex={-1}>
        <div className="consent-signal"><span>PRIVACY CONTROL</span><i /></div>
        <h2 id="consent-title">Useful analytics. Your choice.</h2>
        <p>Necessary storage keeps this site working. With permission, analytics helps Trenith improve free tools and understand which workflows lead people to our services. We do not sell personal data, file contents, API keys, prompts or outputs.</p>
        {customize && <div className="consent-options">
          <div><span><strong>Necessary</strong><small>Security, consent choices and essential operation.</small></span><b>Always on</b></div>
          <label><span><strong>Analytics</strong><small>Consent-gated performance and aggregate product usage.</small></span><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /></label>
          <label><span><strong>Preferences</strong><small>Remember optional interface choices on this device.</small></span><input type="checkbox" checked={preferences} onChange={(event) => setPreferences(event.target.checked)} /></label>
          <label><span><strong>Marketing measurement</strong><small>Measure Trenith service campaigns; disabled when Global Privacy Control is on.</small></span><input type="checkbox" checked={marketing} disabled={hasGpc()} onChange={(event) => setMarketing(event.target.checked)} /></label>
          {hasGpc() && <p className="gpc-note">Global Privacy Control detected. Marketing measurement remains off.</p>}
        </div>}
        <div className="consent-actions">
          <button className="secondary-button" onClick={() => save({ analytics: false, marketing: false, preferences: false })}>Reject non-essential</button>
          {customize ? <button className="primary-action" onClick={() => save({ analytics, marketing, preferences })}>Save choices</button> : <button className="secondary-button" onClick={() => setCustomize(true)}>Customize</button>}
          <button className="primary-action" onClick={() => save({ analytics: true, marketing: !hasGpc(), preferences: true })}>Accept all</button>
        </div>
        <p className="consent-links"><a href="/privacy">Privacy</a><a href="/cookies">Cookie policy</a><a href="/privacy-choices">Privacy choices</a></p>
      </section>
    </div>}
  </>;
}
