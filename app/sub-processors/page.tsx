import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Subprocessors", description: "Infrastructure, analytics and communications providers that may process data for Trenith Tools.", alternates: alternateUrls("/sub-processors") };

const processors = [
  ["Vercel, Inc.", "Website hosting, CDN, serverless routes, consent-gated analytics and performance insights", "United States / global infrastructure"],
  ["Google Cloud", "Compute, storage, database and secrets where a Trenith backend feature requires them", "Global infrastructure"],
  ["Google Analytics / Google Ads", "Consent-gated analytics and campaign conversion measurement", "Global infrastructure"],
  ["Google Workspace / Gmail", "Privacy, legal, grievance and support communications", "Global infrastructure"],
  ["Cloudflare", "Turnstile and protective network services where enabled", "Global infrastructure"],
];

export default function SubprocessorsPage() { return <LegalPage title="A limited provider chain." summary="Current as of 17 July 2026">
  <p className="legal-lead">A provider is used only when its function is enabled. Device-processed source files are not intentionally sent to these providers. The live Trenith master list is also available at <a href="https://www.trenith.com/sub-processors">trenith.com/sub-processors</a>.</p>
  <div className="legal-table-wrap"><table><thead><tr><th>Provider</th><th>Purpose</th><th>Location</th></tr></thead><tbody>{processors.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>
  <h2>User-selected BYOK providers</h2><p>OpenAI, Anthropic, Google Gemini, ElevenLabs, OpenRouter and custom compatible endpoints receive data only when you connect them and run a workflow. They process under your account and their terms and may be independent recipients rather than Trenith subprocessors.</p>
  <h2>Changes</h2><p>Material additions are posted here. Contract customers needing notice or a data processing agreement should contact <a href="mailto:legal@trenith.in">legal@trenith.in</a>.</p>
</LegalPage>; }
