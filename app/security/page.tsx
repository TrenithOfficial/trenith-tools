import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Security", description: "Security architecture and responsible reporting for Trenith Tools.", alternates: alternateUrls("/security") };

export default function SecurityPage() { return <LegalPage title="Device-first by architecture." summary="Security overview · Updated 17 July 2026">
  <h2>Architecture</h2><p>Device-labeled operations use browser APIs and locally loaded code. Public URL and allowlisted BYOK routes run on hosted infrastructure only for the requested transaction. Trenith’s public infrastructure uses Vercel and Google Cloud services; secrets are scoped and kept outside client source.</p>
  <h2>Controls</h2><p>Controls include TLS, security headers, restricted outbound destinations, private-network blocking on public URL tools, session-first credentials, optional AES-GCM browser vault encryption, consent defaults, dependency review and least-privilege operational access.</p>
  <h2>Your role</h2><p>Use a supported updated browser, protect provider keys, use restricted keys and spending limits, verify custom endpoints, keep original files and remove shared-device vaults. No encryption can protect a key after it is sent to the provider you instruct us to call.</p>
  <h2>Certifications</h2><p>Do not infer a certification from this page. Trenith does not claim Trenith Tools is currently certified to ISO 27001, SOC 2, PCI DSS or a sector-specific healthcare standard.</p>
  <h2>Report a vulnerability</h2><p>Send a reproducible report to <a href="mailto:legal@trenith.in">legal@trenith.in</a>. Do not access other people’s data, disrupt the service, use destructive tests or publish an unremediated issue. We will acknowledge valid reports as resources permit; there is no standing bounty promise.</p>
</LegalPage>; }
