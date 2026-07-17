import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Copyright & Takedown", description: "Copyright rules and takedown contact for public-link tools and Trenith Tools content.", alternates: alternateUrls("/copyright") };

export default function CopyrightPage() { return <LegalPage title="Rights come before downloading." summary="Copyright and notice procedure">
  <h2>User responsibility</h2><p>Use download, remix, cover, conversion and AI features only for content you own, license or may lawfully use. Technical accessibility is not permission. Trenith tools do not grant rights and must not be used to bypass access controls or DRM.</p>
  <h2>Send a notice</h2><p>Email <a href="mailto:legal@trenith.in">legal@trenith.in</a> with your signature or authority, the protected work, exact Trenith URL or source, contact information, a good-faith statement, and a statement that the information is accurate. We may forward a notice and request more information.</p>
  <h2>Response</h2><p>Trenith may disable a route, block a source or remove material where appropriate. Affected users may send a counter-notice with proof of authority. We may terminate repeated harmful use where technically identifiable and legally appropriate.</p>
</LegalPage>; }
