import { siteUrl } from "../../lib/site";

export const runtime = "edge";

export function GET() {
  const items = [
    { title: "Verified media and workflow release", date: "Fri, 17 Jul 2026 20:00:00 GMT", description: "True multi-format audio conversion, compatibility decoding, batch downloads, PDF fixes and denser discovery." },
    { title: "Privacy and global discovery foundation", date: "Fri, 17 Jul 2026 12:00:00 GMT", description: "Metadata cleaning, trust pages, consent controls, structured data and global/India search foundations." },
  ];
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Trenith Tools Changelog</title><link>${siteUrl("/changelog")}</link><description>Verified free tool releases from Trenith Technologies.</description><language>en</language>${items.map((item) => `<item><title>${escape(item.title)}</title><link>${siteUrl("/changelog")}</link><guid>${siteUrl(`/changelog#${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}</guid><pubDate>${item.date}</pubDate><description>${escape(item.description)}</description></item>`).join("")}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
