import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "../../../components/json-ld";
import { guideBySlug, guides } from "../../../lib/guides";
import { alternateUrls, COMPANY_NAME, siteUrl } from "../../../lib/site";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return guides.map((guide) => ({ slug: guide.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const guide = guideBySlug[slug]; if (!guide) return {}; return { title: guide.title, description: guide.description, alternates: alternateUrls(`/guides/${slug}`), openGraph: { type: "article", title: guide.title, description: guide.description, url: siteUrl(`/guides/${slug}`) } }; }

export default async function GuidePage({ params }: Props) { const { slug } = await params; const guide = guideBySlug[slug]; if (!guide) notFound(); return <>
  <JsonLd data={[{ "@context": "https://schema.org", "@type": "Article", headline: guide.title, description: guide.description, datePublished: "2026-07-17", dateModified: "2026-07-17", mainEntityOfPage: siteUrl(`/guides/${slug}`), author: { "@type": "Organization", name: COMPANY_NAME, url: "https://www.trenith.com" }, publisher: { "@type": "Organization", name: COMPANY_NAME, logo: { "@type": "ImageObject", url: siteUrl("/trenith-mark.png") } } }, { "@context": "https://schema.org", "@type": "HowTo", name: guide.title, step: guide.steps.map((step, index) => ({ "@type": "HowToStep", position: index + 1, name: step, text: step })) }]} />
  <article className="guide-article page-frame"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/guides">Guides</Link><span>/</span><strong>{guide.title}</strong></nav><header><span className="section-kicker">TRENITH FIELD GUIDE</span><h1>{guide.title}</h1><p>{guide.description}</p></header><aside className="direct-answer"><span>DIRECT ANSWER</span><p>{guide.answer}</p></aside><section><h2>Step by step</h2><ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>{guide.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}{guide.tool && <section className="guide-cta"><h2>Do it now with Trenith Tools</h2><p>Open the free workspace. The tool page explains exactly where the job runs before you choose a file or provider.</p><Link className="primary-action" href={`/tools/${guide.tool}`}>Open the tool <span>→</span></Link></section>}</article>
  </>; }
