import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Use", description: "The terms for using Trenith Tools and connecting external provider accounts.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return <><section className="legal-hero page-frame"><span className="section-kicker">TERMS OF USE</span><h1>Use the tools responsibly.</h1><p>Last updated 17 July 2026</p></section><article className="legal-document page-frame">
    <h2>Using Trenith Tools</h2><p>You may use Trenith Tools for lawful purposes and only with files, URLs, voices, music and other material you own, are authorized to use, or may legally process. Do not use the service to bypass DRM, authentication, access controls or third-party terms.</p>
    <h2>No subscription fee</h2><p>Trenith does not charge a subscription for this interface. External providers connected through BYOK may bill your account. You are responsible for those provider charges, quotas, account permissions and terms.</p>
    <h2>Uploads and practical limits</h2><p>Device tools do not impose an artificial file-count limit. They are still limited by the memory, storage, codecs and browser capabilities of your device. “No limit” does not guarantee that every device can process every quantity or file size.</p>
    <h2>External services</h2><p>Provider names and trademarks belong to their respective owners. A provider may change or withdraw a model, API or feature. Trenith is not affiliated with or endorsed by those providers unless expressly stated.</p>
    <h2>Availability and output</h2><p>The tools are provided as available without a guarantee that every input, codec, public page or third-party API will work. Review outputs before relying on them, especially for legal, medical, financial, accessibility or production-critical uses.</p>
    <h2>Contact</h2><p>Questions about these terms can be sent to <a href="mailto:contact@trenith.com">contact@trenith.com</a>.</p>
  </article></>;
}
