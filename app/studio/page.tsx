import type { Metadata } from "next";
import { Suspense } from "react";
import { AiStudio } from "../../components/ai-studio";

export const metadata: Metadata = {
  title: "Free BYOK AI Studio",
  description: "Run AI workflows using your own OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter or compatible provider API key.",
  alternates: { canonical: "/studio" },
};

export default function StudioPage() {
  return <>
    <section className="directory-hero page-frame compact-hero"><span className="section-kicker">PROVIDER-POWERED WORKSPACE</span><h1>AI Studio.<br /><em>Your models, one interface.</em></h1><p>Choose a saved connection and send a real request. Trenith adds no generation subscription and does not pretend unsupported models are available.</p><div className="security-points"><span><i>01</i>Session-first keys</span><span><i>02</i>Real provider responses</span><span><i>03</i>Downloadable output</span></div></section>
    <section className="studio-section page-frame"><Suspense fallback={<div className="directory-loading">Loading AI Studio…</div>}><AiStudio /></Suspense></section>
  </>;
}
