import { siteUrl } from "../../lib/site";

export const runtime = "edge";

export function GET() {
  const items = [
    { title: "Readability, real logo and all-device polish", date: "Sat, 18 Jul 2026 16:00:00 GMT", description: "Larger, more readable type site-wide with a 12px floor, the real Trenith shield restored as favicon and brand mark, reliable vector icons, a feedback button that always delivers, and a fixed navigation gap on medium screens." },
    { title: "Feedback everywhere, search-intent pages and security hardening", date: "Sat, 18 Jul 2026 12:00:00 GMT", description: "A floating feedback button on every page, search-intent titles for all 44 tools, zero known production dependency vulnerabilities, header-injection hardening and API burst limits." },
    { title: "Any-key AI Studio, free SEO tools and answer-engine upgrade", date: "Sat, 18 Jul 2026 08:00:00 GMT", description: "Every AI workflow now runs with any connected key with clear provider recommendations, browser-voice speech works with no key, vision keys read scans, and free on-device SERP preview and keyword density tools join the directory." },
    { title: "Deep reliability audit release", date: "Sat, 18 Jul 2026 04:00:00 GMT", description: "Media engine startup fix, full metadata-removal repair with per-format cleaning engines, verified downloads, background-tab resilience and honest size limits." },
    { title: "Verified media and workflow release", date: "Fri, 17 Jul 2026 20:00:00 GMT", description: "True multi-format audio conversion, compatibility decoding, batch downloads, PDF fixes and denser discovery." },
    { title: "Privacy and global discovery foundation", date: "Fri, 17 Jul 2026 12:00:00 GMT", description: "Metadata cleaning, trust pages, consent controls, structured data and global/India search foundations." },
  ];
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Trenith Tools Changelog</title><link>${siteUrl("/changelog")}</link><description>Verified free tool releases from Trenith Technologies.</description><language>en</language>${items.map((item) => `<item><title>${escape(item.title)}</title><link>${siteUrl("/changelog")}</link><guid>${siteUrl(`/changelog#${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}</guid><pubDate>${item.date}</pubDate><description>${escape(item.description)}</description></item>`).join("")}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
