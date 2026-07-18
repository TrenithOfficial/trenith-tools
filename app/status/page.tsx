import type { Metadata } from "next";
import Link from "next/link";
import { kindLabel, tools } from "../../lib/catalog";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = {
  title: "Tool Capability & Browser Status",
  description: "See how every Trenith tool runs, what it needs, and which browser or provider limitations apply before you start.",
  alternates: alternateUrls("/status"),
};

const engineNotes: Record<string, string> = {
  "metadata-remover": "Per-format engines · ExifTool for images, document rewriting for PDF/Office, FFmpeg stream copy for audio; every result is re-scanned",
  "audio-downloader": "Public URL scanner · no login, DRM or access-control bypass",
  "audio-joiner": "Web Audio with FFmpeg compatibility fallback · direct-to-disk mode for large jobs",
  "audio-converter": "FFmpeg WebAssembly · MP3, WAV, FLAC, Ogg, Opus and M4A/AAC output",
  "audio-trimmer": "Web Audio with FFmpeg compatibility fallback · WAV output",
  "audio-volume-changer": "Web Audio with FFmpeg compatibility fallback · WAV output",
  "video-joiner": "Canvas + MediaRecorder · output and input codec support varies by browser",
  "compress-pdf": "Structural PDF optimization · not a claim of lossy image recompression",
};

function engineNote(slug: string, category: string, kind: string) {
  if (engineNotes[slug]) return engineNotes[slug];
  if (kind === "byok") return "Real provider request · account, model, quota and endpoint capability are supplied by the user";
  if (category === "PDF") return "pdf-lib local document processing";
  if (category === "Image") return "Canvas local image processing · JPG, PNG and WebP export";
  if (category === "Music") return "Local calculator or Web Audio utility";
  return "Browser-local processing";
}

export default function StatusPage() {
  return <>
    <section className="directory-hero page-frame compact-hero"><span className="section-kicker">CAPABILITY, NOT MARKETING</span><h1>Know what works.<br /><em>Before you add a file.</em></h1><p>Every workspace is classified by processing path and practical dependency. “Available” means the action surface is implemented; it does not erase browser codec, device capacity or external-provider limits.</p><div className="security-points"><span><i>01</i>Audited 17 July 2026</span><span><i>02</i>{tools.length} routed workspaces</span><span><i>03</i>No placeholder cards</span></div></section>
    <section className="status-section page-frame">
      <div className="status-legend"><article><span className="status-dot" /><div><strong>Device or public tool</strong><p>Ready to use with the stated browser/source constraints.</p></div></article><article><span className="status-provider">KEY</span><div><strong>Provider-dependent</strong><p>The runner works, but the connected API determines the result.</p></div></article></div>
      <div className="status-table" role="table" aria-label="Trenith tool capability status">
        <div className="status-table-head" role="row"><span>Workspace</span><span>Processing path</span><span>Engine and practical dependency</span><span>Open</span></div>
        {tools.map((tool) => <div className="status-table-row" role="row" key={tool.slug}><div><span className={`tool-line-icon ${tool.accent}`}>{tool.icon}</span><strong>{tool.name}</strong><small>{tool.category}</small></div><span className={`capability-chip ${tool.kind}`}>{kindLabel(tool.kind)}</span><p>{engineNote(tool.slug, tool.category, tool.kind)}</p><Link href={`/tools/${tool.slug}`} aria-label={`Open ${tool.name}`}>Open →</Link></div>)}
      </div>
    </section>
  </>;
}
