import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "../../../components/json-ld";
import { ToolWorkspace } from "../../../components/tool-workspace";
import { kindLabel, toolBySlug, tools } from "../../../lib/catalog";
import { alternateUrls, COMPANY_NAME, siteUrl, trenithContactUrl } from "../../../lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tool = toolBySlug[slug];
  if (!tool) return { title: "Tool not found" };
  return {
    title: `${tool.name} — Free Online Tool`,
    description: `${tool.description} Open the free ${tool.name} workspace from Trenith Technologies.`,
    keywords: [tool.name, `free ${tool.name.toLowerCase()}`, `${tool.category.toLowerCase()} tools`, ...(tool.formats || [])],
    alternates: alternateUrls(`/tools/${tool.slug}`),
    openGraph: { title: `${tool.name} | Trenith Tools`, description: tool.description, url: siteUrl(`/tools/${tool.slug}`), type: "website" },
  };
}

function toolFaq(tool: (typeof tools)[number]) {
  const entries: Array<{ question: string; answer: string }> = [];
  entries.push({
    question: `Is ${tool.name} free to use?`,
    answer: `Yes. ${tool.name} is free from Trenith with no account, subscription or artificial usage limit. ${tool.kind === "byok" ? "You connect your own provider API key, and that provider bills your account directly for any model usage." : "Practical capacity depends on your device's memory, free storage and browser codec support."}`,
  });
  if (tool.kind === "device") entries.push({ question: `Does ${tool.name} upload my files?`, answer: "No. Processing happens inside your browser tab on your own device. Source files are not sent to Trenith, and refreshing or closing the tab clears the current queue." });
  if (tool.kind === "web") entries.push({ question: "Does the scanner bypass logins or DRM?", answer: "No. Only publicly exposed audio links are discovered. The scanner rejects private network addresses and does not bypass authentication, DRM or platform access controls." });
  if (tool.kind === "byok") entries.push({ question: "Where does my API key go?", answer: "Keys stay in this browser's session storage and are sent only to the provider you selected over a fixed, allowlisted route. They never appear in URLs, logs or page source, and an optional passphrase-encrypted device vault is available." });
  if (tool.formats?.length) entries.push({ question: `Which formats does ${tool.name} support?`, answer: `${tool.name} works with ${tool.formats.filter((format) => format !== "and more").join(", ")}${tool.formats.includes("and more") ? " and other compatible formats" : ""}.` });
  entries.push({ question: `How do I use ${tool.name}?`, answer: tool.steps.map((step, index) => `${index + 1}. ${step}`).join(" ") + " No sign-up is required." });
  return entries;
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = toolBySlug[slug];
  if (!tool) notFound();
  const related = tools.filter((candidate) => candidate.category === tool.category && candidate.slug !== tool.slug).slice(0, 4);
  const faq = toolFaq(tool);
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((entry) => ({ "@type": "Question", name: entry.question, acceptedAnswer: { "@type": "Answer", text: entry.answer } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: tool.name,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any modern web browser",
      description: tool.description,
      url: siteUrl(`/tools/${tool.slug}`),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@type": "Organization", name: COMPANY_NAME, url: "https://trenith.com" },
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: `How to use ${tool.name}`,
      description: tool.description,
      step: tool.steps.map((step, index) => ({ "@type": "HowToStep", position: index + 1, name: step, text: step })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Tools", item: siteUrl("/tools") },
        { "@type": "ListItem", position: 3, name: tool.name, item: siteUrl(`/tools/${tool.slug}`) },
      ],
    },
  ];
  return <>
    <JsonLd data={structuredData} />
    <section className="tool-page-hero page-frame">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/tools">Tools</Link><span>/</span><strong>{tool.name}</strong></nav>
      <div className="tool-page-heading"><span className={`hero-tool-icon ${tool.accent}`}>{tool.icon}</span><div><span className="section-kicker">{tool.category} · {kindLabel(tool.kind)}</span><h1>{tool.name}</h1><p>{tool.description}</p><div className="format-row">{tool.formats?.map((format) => <span key={format}>{format}</span>)}</div></div></div>
    </section>
    <section className="workspace-section page-frame"><ToolWorkspace tool={tool} /></section>
    <section className="how-section page-frame"><div><span className="section-kicker">HOW IT WORKS</span><h2>Three clear steps</h2><p>No hidden queue, upgrade screen or misleading result state.</p></div><ol>{tool.steps.map((step, index) => <li key={step}><span>0{index + 1}</span><p>{step}</p></li>)}</ol></section>
    <section className="tool-assurance page-frame"><article><span>◇</span><h2>{tool.kind === "device" ? "Your files remain on your device" : tool.kind === "byok" ? "Your provider account stays yours" : "Only public sources are scanned"}</h2><p>{tool.kind === "device" ? "Processing happens inside the browser tab. Refreshing or closing the tab clears the current file queue." : tool.kind === "byok" ? "Trenith sends requests only when you run them and does not include bundled provider credits." : "The scanner rejects private network addresses and unsupported media URLs."}</p></article><article><span>∞</span><h2>No Trenith usage price</h2><p>Device tools and the Trenith interface are free. External providers may separately charge the account associated with your own API key.</p></article></section>
    <section className="faq-section page-frame"><div className="section-title-row"><div><span className="section-number">FAQ</span><h2>Common questions</h2></div></div><div className="faq-list">{faq.map((entry) => <details key={entry.question}><summary>{entry.question}</summary><p>{entry.answer}</p></details>)}</div></section>
    <section className="service-cta page-frame"><div><span className="section-kicker">NEED THIS AT BUSINESS SCALE?</span><h2>Turn a useful tool into your workflow.</h2><p>Trenith builds SaaS backends, AI integrations, cloud infrastructure, CRM workflows and automation for teams that need more than a one-off browser task.</p></div><a className="primary-action" href={trenithContactUrl} target="_blank" rel="noreferrer">Build with Trenith <span>↗</span></a></section>
    {related.length > 0 && <section className="related-section page-frame"><div className="section-title-row"><div><span className="section-number">NEXT</span><h2>Related {tool.category} tools</h2></div><Link href={`/tools?category=${encodeURIComponent(tool.category)}`}>View category →</Link></div><div className="related-grid">{related.map((item) => <Link href={`/tools/${item.slug}`} key={item.slug}><span className={`tool-line-icon ${item.accent}`}>{item.icon}</span><div><h3>{item.shortName}</h3><p>{kindLabel(item.kind)}</p></div><b>↗</b></Link>)}</div></section>}
  </>;
}
