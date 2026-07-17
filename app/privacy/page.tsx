import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy", description: "How Trenith Tools handles device-processed files, public URLs and BYOK provider credentials.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return <LegalPage title="Privacy, in plain language." updated="17 July 2026">
    <h2>Device-processed files</h2><p>When a tool is labeled “Processed on your device,” the selected source files are read and transformed by browser APIs on your computer or phone. Trenith does not receive or store those files. Browser memory, codec support and available device storage determine practical limits.</p>
    <h2>Public URL scanner</h2><p>The audio downloader sends the URL you enter to a Trenith server route so the public page can be inspected for direct audio resources it openly exposes. The scanner does not bypass authentication, DRM or private access controls. The URL is used to complete the request and is not intentionally retained by the application.</p>
    <h2>Bring Your Own Key connections</h2><p>Saved connections use browser session storage by default. If you choose the optional device vault, connection data is encrypted with AES-256-GCM using a key derived from your passphrase before it is placed in local storage. Trenith does not store or recover that passphrase.</p>
    <h2>Provider requests</h2><p>Official provider requests are sent through fixed, allowlisted routes for OpenAI, Anthropic, Gemini, ElevenLabs and OpenRouter. Custom compatible endpoints are called directly by your browser. Prompts, API keys and outputs are governed by the privacy terms of the provider you choose.</p>
    <h2>Analytics and logs</h2><p>The application does not deliberately place file contents or API keys in page URLs, metadata or source code. Infrastructure providers may keep limited operational logs such as IP address, request time, route and error status under their own retention and security policies.</p>
    <h2>Your controls</h2><p>You can remove session connections from <Link href="/connections">Connections</Link>, close the browser session, or delete the encrypted device vault. Contact <a href="mailto:contact@trenith.com">contact@trenith.com</a> with privacy questions.</p>
  </LegalPage>;
}

function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return <><section className="legal-hero page-frame"><span className="section-kicker">TRUST CENTER</span><h1>{title}</h1><p>Last updated {updated}</p></section><article className="legal-document page-frame">{children}</article></>;
}
