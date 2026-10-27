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
  "metadata-remover": "Per-format engines · ExifTool for images and RAW (colour profile and orientation kept), FFmpeg lossless stream copy for every audio/video container, document rewriters for PDF, Office, OpenDocument, EPUB, SVG, HTML and RTF, recursive ZIP and embedded-media cleaning; every result is re-scanned and classified",
  "audio-downloader": "Public URL scanner · direct files, HTML5 players, podcast RSS/Atom feeds · names streaming platforms instead of failing · no login, DRM or access-control bypass",
  "audio-joiner": "Web Audio with FFmpeg compatibility fallback · direct-to-disk mode for large jobs",
  "audio-converter": "FFmpeg WebAssembly · MP3, M4A/AAC, WAV, FLAC, ALAC, AIFF, Ogg, Opus, WebM, WavPack, AC3 and WMA · batch with ZIP · tags and cover art kept",
  "audio-trimmer": "FFmpeg lossless stream-copy cut (frame-accurate to ~26 ms) or re-encode to any format · Web Audio WAV path kept",
  "audio-volume-changer": "Web Audio for WAV · FFmpeg volume filter for every other output format",
  "video-joiner": "FFmpeg lossless concat when clips share codec parameters · Canvas + MediaRecorder re-record otherwise",
  "video-converter": "FFmpeg WebAssembly · lossless remux when codecs fit the container, else libx264 / libvpx-vp9 single-threaded encode",
  "video-compressor": "FFmpeg libx264 CRF or bitrate budget for a target size · never upscales",
  "video-trimmer": "FFmpeg keyframe-accurate stream copy or frame-accurate re-encode",
  "video-to-audio": "FFmpeg stream copy for matching codecs · encode to MP3, M4A, WAV, FLAC, Opus or Ogg otherwise",
  "video-to-gif": "FFmpeg two-pass palettegen/paletteuse · no audio",
  "compress-pdf": "pdf-lib image recompression (JPEG/Flate, text layer untouched) plus orphan sweep · masks, CMYK and scans kept as-is",
  "pdf-to-image": "pdf.js rendering to canvas · JPG, PNG or WebP at 72–300 dpi · CMaps, standard fonts and JPX/JBIG2 decoders served from this origin",
  "pdf-to-text": "pdf.js text layer with positional line reconstruction · scans need the OCR workflow",
  "jpg-to-pdf": "pdf-lib with the image engine decoding HEIC, TIFF, AVIF, GIF, BMP and SVG to lossless PNG first",
  "text-to-speech": "Browser speech synthesis with no key · ElevenLabs or a compatible endpoint for downloadable MP3",
  "ocr-pdf": "Vision request through your OpenAI, Gemini or Anthropic key · JPG/PNG/WebP up to 3 MB",
  "serp-snippet-preview": "Local snippet renderer · character and approximate pixel checks",
  "keyword-density-analyzer": "Local text analysis · counts, densities, readability estimate and question detection",
};

function engineNote(slug: string, category: string, kind: string) {
  if (engineNotes[slug]) return engineNotes[slug];
  if (kind === "byok") return "Real provider request · account, model, quota and endpoint capability are supplied by the user";
  if (category === "PDF") return "pdf-lib local document processing";
  if (category === "Image") return "Canvas image engine · opens HEIC, TIFF, SVG, AVIF · exports JPG, PNG, WebP, AVIF, GIF, BMP, ICO, TIFF · batch mode with ZIP";
  if (category === "Music") return "Local calculator or Web Audio utility";
  return "Browser-local processing";
}

export default function StatusPage() {
  return <>
    <section className="directory-hero page-frame compact-hero"><span className="section-kicker">CAPABILITY, NOT MARKETING</span><h1>Know what works.<br /><em>Before you add a file.</em></h1><p>Every workspace is classified by processing path and practical dependency. “Available” means the action surface is implemented; it does not erase browser codec, device capacity or external-provider limits.</p><div className="security-points"><span><i>01</i>Audited 27 October 2026</span><span><i>02</i>{tools.length} routed workspaces</span><span><i>03</i>No placeholder cards</span></div></section>
    <section className="status-section page-frame">
      <article className="watch-status-card"><div><span className="status-dot" /><strong>Watch Together beta · protocol 2</strong><p>Room, encrypted chat/reactions, WebRTC voice/video and the cross-browser companion are implemented, with server clock alignment, latency-projected seeks, a host heartbeat, per-participant drift display, resync, host handover (manual and automatic), lock and remove. Launch provider adapters: YouTube, Netflix (page player API), Prime Video and JioHotstar. Other OTT websites use the documented generic HTML5 beta.</p></div><div><span>25 sync</span><span>6 media</span><span>6h expiry</span><Link href="/watch-together/supported">Compatibility →</Link></div></article>
      <div className="status-legend"><article><span className="status-dot" /><div><strong>Device or public tool</strong><p>Ready to use with the stated browser/source constraints.</p></div></article><article><span className="status-provider">KEY</span><div><strong>Provider-dependent</strong><p>The runner works, but the connected API determines the result.</p></div></article></div>
      <div className="status-table" role="table" aria-label="Trenith tool capability status">
        <div className="status-table-head" role="row"><span>Workspace</span><span>Processing path</span><span>Engine and practical dependency</span><span>Open</span></div>
        {tools.map((tool) => <div className="status-table-row" role="row" key={tool.slug}><div><span className={`tool-line-icon ${tool.accent}`}>{tool.icon}</span><strong>{tool.name}</strong><small>{tool.category}</small></div><span className={`capability-chip ${tool.kind}`}>{kindLabel(tool.kind)}</span><p>{engineNote(tool.slug, tool.category, tool.kind)}</p><Link href={`/tools/${tool.slug}`} aria-label={`Open ${tool.name}`}>Open →</Link></div>)}
      </div>
    </section>
  </>;
}
