import type { Metadata } from "next";
import { Suspense } from "react";
import { JsonLd } from "../../components/json-ld";
import { ToolsBrowser } from "../../components/tools-browser";
import { tools } from "../../lib/catalog";
import { alternateUrls, siteUrl } from "../../lib/site";

export const metadata: Metadata = {
  title: "All Free Online Tools — Audio, PDF, Image, SEO & AI",
  description: "Browse 48 free Trenith tools: metadata removal, audio, video, PDF, image, music, SEO, developer utilities (password, hash, UUID, Base64) and BYOK AI. Private, in-browser processing with no sign-up — every listing opens a working workspace.",
  alternates: alternateUrls("/tools"),
};

export default function ToolsPage() {
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Trenith Tools directory",
        numberOfItems: tools.length,
        itemListElement: tools.map((tool, index) => ({ "@type": "ListItem", position: index + 1, name: tool.name, url: siteUrl(`/tools/${tool.slug}`) })),
      }} />
      <section className="directory-hero page-frame">
        <span className="section-kicker">THE COMPLETE TOOL DIRECTORY</span>
        <h1>Open a tool.<br /><em>Start the real workflow.</em></h1>
        <p>{tools.length} free utilities. Device tools run in your browser; public-link tools scan authorized pages; AI tools use your own provider connection.</p>
        <div className="directory-legend"><span className="device">Processed on your device</span><span className="web">Public web source</span><span className="byok">Uses your API key</span></div>
      </section>
      <section className="directory-section page-frame">
        <Suspense fallback={<div className="directory-loading">Loading tool directory…</div>}><ToolsBrowser /></Suspense>
      </section>
    </>
  );
}
