import Link from "next/link";
import { JsonLd } from "../components/json-ld";
import { OrbitVisual } from "../components/orbit-visual";
import { ToolCard } from "../components/tool-card";
import { quickTools, tools } from "../lib/catalog";
import { COMPANY_NAME, siteUrl } from "../lib/site";

const faqs = [
  ["What does processed on your device mean?", "Audio, video, PDF and image source files are handled by browser APIs on your computer or phone. Trenith does not receive or store those input files for these tools."],
  ["Is Trenith Tools free?", "Yes. The Trenith interface and device-processed utilities have no subscription price. If you connect an external AI provider, that provider may charge your own account according to its terms."],
  ["How does BYOK work?", "BYOK means Bring Your Own Key. You add a provider key to a session-only vault, choose that connection in AI Studio, and the key is used only for your requested provider call. You can optionally encrypt connections on your device with a passphrase."],
  ["Are there unlimited uploads?", "Trenith does not impose an artificial file-count limit on device tools. Your practical limit depends on browser memory, available storage, file size and codec support."],
  ["Can every visible tool be opened?", "Yes. Device tools open a complete local workspace. Public-link tools open the URL scanner. Provider-dependent tools open the BYOK Studio with connection requirements and an API runner."],
];

export default function Home() {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${siteUrl("/")}#organization`,
      name: COMPANY_NAME,
      url: "https://trenith.com",
      logo: siteUrl("/trenith-mark.png"),
      areaServed: ["India", "Worldwide"],
      founder: { "@type": "Person", name: "Sai Phanindra Manikanta Yalamanchili" },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${siteUrl("/")}#website`,
      name: "Trenith Tools",
      url: siteUrl("/"),
      publisher: { "@id": `${siteUrl("/")}#organization` },
      inLanguage: "en-IN",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Trenith Tools",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any modern web browser",
      url: siteUrl("/"),
      description: "Free browser-based audio, video, PDF, image and BYOK AI tools.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      featureList: quickTools.map((tool) => tool.name),
      author: { "@id": `${siteUrl("/")}#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
    },
  ];

  return (
    <>
      <JsonLd data={structuredData} />
      <section className="home-hero page-frame">
        <div className="hero-copy">
          <span className="section-kicker">PRIVATE-BY-DESIGN FILE UTILITIES</span>
          <h1>Every file tool.<br /><em>Free. Private. Fast.</em></h1>
          <p>Download authorized audio, join media, optimize documents and connect your own AI providers—inside one precise Trenith workspace.</p>
          <div className="hero-actions">
            <Link className="primary-action" href="/tools">Open all {tools.length} tools <span>→</span></Link>
            <Link className="text-action" href="/connections">Connect your AI keys</Link>
          </div>
          <div className="hero-facts">
            <span><i>✓</i>No subscriptions</span>
            <span><i>✓</i>Device-first file processing</span>
            <span><i>✓</i>BYOK AI</span>
          </div>
        </div>
        <OrbitVisual />
      </section>

      <section className="quick-launch page-frame" aria-labelledby="quick-title">
        <div className="section-title-row"><div><span className="section-number">01</span><h2 id="quick-title">Quick launch</h2></div><Link href="/tools">View all {tools.length} tools <span>→</span></Link></div>
        <div className="quick-grid">{quickTools.map((tool) => <ToolCard key={tool.slug} tool={tool} featured />)}</div>
      </section>

      <section className="proof-rail" aria-label="Trenith Tools promises">
        <div className="page-frame"><div><span>◇</span><strong>Private processing</strong><small>Device tools keep files in your browser</small></div><div><span>○</span><strong>Zero subscriptions</strong><small>The Trenith interface is completely free</small></div><div><span>⌁</span><strong>Your provider accounts</strong><small>Bring your own AI keys when needed</small></div></div>
      </section>

      <section className="answer-section page-frame">
        <div className="answer-copy"><span className="section-kicker">CLEAR BY DESIGN</span><h2>Know exactly where every job runs.</h2><p>Trenith labels each workflow by how it operates. There are no decorative tool cards and no surprise paywall after you click.</p></div>
        <div className="answer-grid">
          <article><span className="answer-code">DEVICE</span><h3>Processed on your device</h3><p>Your browser reads the file, performs the operation and creates the download. Best for audio joining, supported video joining, PDFs and images.</p><Link href="/tools">Browse device tools →</Link></article>
          <article><span className="answer-code">WEB</span><h3>Public source scanner</h3><p>The server checks a public URL for media links it openly exposes. It does not bypass authentication, DRM or private platform controls.</p><Link href="/tools/audio-downloader">Open audio downloader →</Link></article>
          <article><span className="answer-code">BYOK</span><h3>Your API key, your provider</h3><p>Connect OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter or a compatible endpoint. Trenith does not bundle or resell provider credits.</p><Link href="/connections">Set up connections →</Link></article>
        </div>
      </section>

      <section className="category-showcase page-frame">
        <div className="section-title-row"><div><span className="section-number">02</span><h2>One system, every workflow</h2></div><p>Each category has dedicated tool pages, support notes, formats and a real action surface.</p></div>
        <div className="category-orbit">
          {["Audio", "Video", "PDF", "Image", "Music", "AI Studio"].map((category, index) => (
            <Link key={category} href={`/tools?category=${encodeURIComponent(category)}`}><span>0{index + 1}</span><h3>{category}</h3><p>{tools.filter((tool) => tool.category === category).length} tools</p><b>↗</b></Link>
          ))}
        </div>
      </section>

      <section className="byok-callout page-frame">
        <div className="byok-orb"><span>KEY</span><i /><i /><i /></div>
        <div><span className="section-kicker">BRING YOUR OWN KEY</span><h2>AI access without another subscription.</h2><p>Save connections for this session, test a supported provider, or unlock an encrypted device vault. Provider charges—if any—stay directly between you and that provider.</p></div>
        <Link className="primary-action" href="/connections">Open Connections Vault <span>→</span></Link>
      </section>

      <section className="faq-section page-frame">
        <div><span className="section-kicker">DIRECT ANSWERS</span><h2>Frequently asked questions</h2><p>Plain-language answers for people, search engines and answer engines.</p></div>
        <div className="faq-list">{faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span>＋</span></summary><p>{answer}</p></details>)}</div>
      </section>
    </>
  );
}
