import type { Metadata } from "next";
import Link from "next/link";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Product Changelog", description: "Verified Trenith Tools releases, fixes and new free browser utilities.", alternates: alternateUrls("/changelog") };

const releases = [
  { date: "18 July 2026", title: "Deep reliability audit release", items: ["Fixed audio conversion failing to start: the private media engine worker now loads correctly on every supported browser.", "Fixed metadata removal end to end: images clean through ExifTool, PDFs through a dedicated document rewriter, MP3/FLAC/Ogg/Opus/WAV/AIFF/WebM audio through the media engine, and Word, Excel and PowerPoint documents through direct property scrubbing.", "Every cleaned file now verifies, lists its remaining structural fields and downloads individually or as one ZIP.", "Video joining, image processing and provider connections keep working when the tab is moved to the background.", "Files beyond the in-browser engine capacity now fail fast with a clear size limit instead of a generic error."] },
  { date: "17 July 2026", title: "Verified media and workflow release", items: ["Added true MP3, WAV, FLAC, Ogg, Opus and M4A/AAC audio conversion.", "Added free audio trimming and volume adjustment.", "Added FFmpeg compatibility decoding to the audio joiner and explicit output preview/download states.", "Added batch ZIP download for public audio discoveries.", "Corrected reversed PDF page ranges and the voice-conversion provider route.", "Rebuilt category discovery cards and published a capability status matrix."] },
  { date: "17 July 2026", title: "Privacy and global discovery foundation", items: ["Added local metadata inspection, cleaning and verification.", "Added global and India canonicals, hreflang, sitemap, structured data, llms.txt and consent controls.", "Added privacy, terms, cookies, choices, security, subprocessors, copyright and accessibility notices."] },
];

export default function ChangelogPage() {
  return <><section className="directory-hero page-frame compact-hero"><span className="section-kicker">WHAT CHANGED</span><h1>Shipped work.<br /><em>Plainly documented.</em></h1><p>Release notes describe user-visible changes and fixed defects. Subscribe through the <a href="/feed.xml">RSS feed</a>.</p></section><section className="changelog-list page-frame">{releases.map((release, index) => <article key={`${release.date}-${release.title}`}><div><span>{release.date}</span><b>v{releases.length - index}.0</b></div><section><h2>{release.title}</h2><ul>{release.items.map((item) => <li key={item}>{item}</li>)}</ul>{index === 0 && <Link href="/status">Review current tool status →</Link>}</section></article>)}</section></>;
}
