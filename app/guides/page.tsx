import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../../components/json-ld";
import { guides } from "../../lib/guides";
import { alternateUrls, siteUrl } from "../../lib/site";

export const metadata: Metadata = { title: "Free File & BYOK AI Guides", description: "Practical guides for metadata privacy, large audio folders, PDFs, local browser processing and BYOK AI.", alternates: alternateUrls("/guides") };

export default function GuidesPage() { return <>
  <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Trenith Tools guides", url: siteUrl("/guides"), hasPart: guides.map((guide) => ({ "@type": "Article", name: guide.title, url: siteUrl(`/guides/${guide.slug}`) })) }} />
  <section className="directory-hero page-frame"><span className="section-kicker">PRACTICAL ANSWERS</span><h1>Make files safer.<br /><em>Make workflows clearer.</em></h1><p>Human-readable, answer-engine-ready guides based on how the tools actually work—not keyword filler.</p></section>
  <section className="guides-grid page-frame">{guides.map((guide, index) => <Link href={`/guides/${guide.slug}`} key={guide.slug}><span>0{index + 1}</span><h2>{guide.title}</h2><p>{guide.description}</p><b>Read guide →</b></Link>)}</section>
  </>; }
