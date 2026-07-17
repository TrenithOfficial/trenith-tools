import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { PrivacySettingsButton } from "../../components/privacy-settings-button";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Privacy Choices", description: "Change cookie consent, honor Global Privacy Control and exercise data rights with Trenith Tools.", alternates: alternateUrls("/privacy-choices") };

export default function PrivacyChoicesPage() { return <LegalPage title="Your privacy choices." summary="Control consent or exercise regional rights at any time.">
  <h2>Change consent</h2><p>Open the consent center to accept, reject or customize analytics, preferences and marketing measurement.</p><PrivacySettingsButton />
  <h2>Global Privacy Control</h2><p>If your browser sends Global Privacy Control, Trenith treats it as an opt-out of marketing measurement. Analytics remains a separate consent choice where applicable.</p>
  <h2>Access, correct or delete</h2><p>Email <a href="mailto:privacy@trenith.in">privacy@trenith.in</a> with the subject “Privacy request.” State the site, country, request and email used to contact us. Do not send API keys or sensitive file contents. We may verify identity before acting.</p>
  <h2>Grievances and appeals</h2><p>Email <a href="mailto:grevience@trenith.in">grevience@trenith.in</a> and describe the original request and desired resolution. You may also contact the regulator or supervisory authority available under the law that applies to you.</p>
</LegalPage>; }
