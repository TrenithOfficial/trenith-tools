import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Cookie Policy", description: "Trenith Tools cookie, local storage, analytics and advertising consent categories.", alternates: alternateUrls("/cookies") };

export default function CookiesPage() { return <LegalPage title="Cookies only after a real choice." summary="Effective 17 July 2026">
  <p className="legal-lead">Trenith Tools uses browser storage and similar technologies. Necessary features work without advertising cookies. Optional categories remain denied until you choose otherwise.</p>
  <h2>Necessary</h2><p>Stores your consent record, security state and short-lived interface session information. Session BYOK credentials are kept in session storage at your direction; an optional encrypted vault is kept in local storage until you delete it. These functions cannot be disabled through our banner because the requested feature would not work.</p>
  <h2>Preferences</h2><p>Remembers optional color and interface choices on the device. Enabled only when you consent, except a choice that is strictly necessary to deliver an explicitly requested setting.</p>
  <h2>Analytics</h2><p>Vercel Analytics, Speed Insights and Google Analytics may measure aggregate usage, referrers, performance and conversions after consent. Google Analytics is configured with IP anonymization and signals limited by your marketing choice. Configure retention is targeted at 14 months.</p>
  <h2>Marketing measurement</h2><p>Google Ads conversion measurement may run only after marketing consent and only when Trenith configures an Ads identifier. It is used to measure Trenith service campaigns, not to monetize file contents or BYOK activity. Global Privacy Control forces this category off.</p>
  <h2>Control</h2><p>Use <a href="/privacy-choices">Privacy Choices</a> at any time. You can also clear site data in the browser; doing so resets consent and removes local vault data. Browser blocking can affect requested features.</p>
</LegalPage>; }
