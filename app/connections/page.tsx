import type { Metadata } from "next";
import { ConnectionVault } from "../../components/connection-vault";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = {
  title: "BYOK Connections Vault",
  description: "Connect your own OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter or compatible API key to Trenith Tools.",
  alternates: alternateUrls("/connections"),
  robots: { index: true, follow: true },
};

export default function ConnectionsPage() {
  return <>
    <section className="directory-hero page-frame compact-hero"><span className="section-kicker">BRING YOUR OWN KEY</span><h1>Connections Vault.<br /><em>Your keys, your control.</em></h1><p>Use provider accounts you already own. Trenith keeps connections session-only by default and offers optional passphrase encryption for device storage.</p><div className="security-points"><span><i>01</i>No keys in source code</span><span><i>02</i>No keys in URLs</span><span><i>03</i>No provider credit resale</span></div></section>
    <section className="vault-section page-frame"><ConnectionVault /></section>
    <section className="security-explainer page-frame"><article><span>SESSION</span><h2>Default: temporary storage</h2><p>Your raw key is saved in session storage on this browser and cleared when the browsing session ends. Provider calls occur only when you press a run or test button.</p></article><article><span>ENCRYPTED</span><h2>Optional: device vault</h2><p>A passphrase derives an AES-GCM key. Only encrypted connection data is written to local storage, and the passphrase is never stored.</p></article><article><span>NETWORK</span><h2>Allowlisted provider proxy</h2><p>Official OpenAI, Anthropic, Gemini, ElevenLabs and OpenRouter calls use fixed Trenith routes. Custom endpoints run directly from your browser and must support CORS.</p></article></section>
  </>;
}
