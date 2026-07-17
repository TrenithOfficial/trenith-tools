import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "../../components/json-ld";
import { COMPANY_NAME, siteUrl } from "../../lib/site";

export const metadata: Metadata = { title: "About Trenith Tools", description: "Learn who builds Trenith Tools, how its privacy-first utilities work and what the free platform includes.", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "AboutPage", name: "About Trenith Tools", url: siteUrl("/about"), mainEntity: { "@type": "Organization", name: COMPANY_NAME, url: "https://trenith.com", logo: siteUrl("/trenith-mark.png"), areaServed: ["India", "Worldwide"], founder: { "@type": "Person", name: "Sai Phanindra Manikanta Yalamanchili" } } }} />
    <section className="about-hero page-frame"><div><span className="section-kicker">BUILT BY TRENITH</span><h1>Useful software,<br /><em>without the gatekeeping.</em></h1><p>Trenith Tools is a free browser workspace for media, documents, images, music utilities and user-connected AI providers.</p><div className="hero-actions"><Link className="primary-action" href="/tools">Explore every tool <span>→</span></Link><a className="text-action" href="https://trenith.com">Visit Trenith.com ↗</a></div></div><div className="brand-plinth"><Image src="/trenith-mark.png" width={330} height={330} alt="Trenith symbol" priority /><span>TRENITH TECHNOLOGIES PVT LTD</span></div></section>
    <section className="principles-grid page-frame"><article><span>01</span><h2>Free interface</h2><p>No Trenith subscription, credits or pricing wall. External AI providers may still charge the account whose key is connected.</p></article><article><span>02</span><h2>Device-first</h2><p>Supported file operations execute with browser APIs on the visitor’s own device. Inputs are not sent to Trenith for those workflows.</p></article><article><span>03</span><h2>Honest capability</h2><p>Every tool states whether it uses the device, a public source URL or an external BYOK provider before the user starts.</p></article></section>
    <section className="credit-band page-frame"><div><span className="section-kicker">COMPANY FOOTPRINT</span><h2>Designed and built by {COMPANY_NAME}</h2></div><p>Co-authored by <strong>Sai Phanindra Manikanta Yalamanchili</strong>. Serving users in India and worldwide through <a href="https://trenith.com">trenith.com</a>.</p></section>
  </>;
}
