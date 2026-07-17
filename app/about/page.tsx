import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "../../components/json-ld";
import { alternateUrls, COMPANY_ADDRESS, COMPANY_CIN, COMPANY_NAME, siteUrl, trenithContactUrl } from "../../lib/site";

export const metadata: Metadata = { title: "About Trenith Tools", description: "Learn who builds Trenith Tools in Hyderabad, India, how device-first utilities work and what the free global platform includes.", alternates: alternateUrls("/about") };

export default function AboutPage() {
  return <>
    <JsonLd data={{ "@context": "https://schema.org", "@type": "AboutPage", name: "About Trenith Tools", url: siteUrl("/about"), mainEntity: { "@type": ["Organization", "ProfessionalService"], name: COMPANY_NAME, legalName: COMPANY_NAME, taxID: COMPANY_CIN, url: "https://www.trenith.com", logo: siteUrl("/trenith-mark.png"), email: "info@trenith.com", telephone: "+1-561-221-2199", address: { "@type": "PostalAddress", streetAddress: "Plot No. 272, Pragatinagar", addressLocality: "Hyderabad", addressRegion: "Telangana", postalCode: "500090", addressCountry: "IN" }, areaServed: ["India", "United States", "European Union", "Worldwide"] } }} />
    <section className="about-hero page-frame"><div><span className="section-kicker">BUILT BY TRENITH</span><h1>Useful software,<br /><em>without the gatekeeping.</em></h1><p>Trenith Tools is a free browser workspace for media, documents, images, music utilities and user-connected AI providers.</p><div className="hero-actions"><Link className="primary-action" href="/tools">Explore every tool <span>→</span></Link><a className="text-action" href="https://trenith.com">Visit Trenith.com ↗</a></div></div><div className="brand-plinth"><Image src="/trenith-mark.png" width={330} height={330} alt="Trenith symbol" priority /><span>TRENITH TECHNOLOGIES PVT LTD</span></div></section>
    <section className="principles-grid page-frame"><article><span>01</span><h2>Free interface</h2><p>No Trenith subscription, credits or pricing wall. External AI providers may still charge the account whose key is connected.</p></article><article><span>02</span><h2>Device-first</h2><p>Supported file operations execute with browser APIs on the visitor’s own device. Inputs are not sent to Trenith for those workflows.</p></article><article><span>03</span><h2>Honest capability</h2><p>Every tool states whether it uses the device, a public source URL or an external BYOK provider before the user starts.</p></article></section>
    <section className="credit-band page-frame"><div><span className="section-kicker">COMPANY FOOTPRINT</span><h2>Designed and built by {COMPANY_NAME}</h2></div><p>CIN {COMPANY_CIN}. Registered at {COMPANY_ADDRESS}. Co-authored by <strong>Sai Phanindra Manikanta Yalamanchili</strong>. <a href={trenithContactUrl}>Discuss a project with Trenith ↗</a></p></section>
  </>;
}
