"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  downloadBlob,
  extractPdfPages,
  imagesToPdf,
  joinAudioFiles,
  joinVideoFiles,
  mergePdfFiles,
  processImage,
  splitPdfToZip,
  transformPdf,
} from "../lib/client-tools";

type AudioResult = { url: string; name: string; format: string };
type ToolAction = "downloader" | "audio" | "video" | "pdf" | "image" | "connect";
type Tool = { name: string; description: string; category: string; icon: string; tone: string; action?: ToolAction; badge?: string };
type PdfMode = "merge" | "extract" | "split" | "rotate" | "number" | "watermark" | "compress" | "images";

const tools: Tool[] = [
  { name: "Audio Downloader", description: "Find direct public audio files exposed by a webpage or media URL.", category: "Audio", icon: "⇩", tone: "cyan", action: "downloader", badge: "Live" },
  { name: "Audio Joiner", description: "Join files and complete folders into a lossless WAV locally.", category: "Audio", icon: "⌁", tone: "violet", action: "audio", badge: "Local" },
  { name: "Video Joiner", description: "Combine browser-compatible clips into one WebM video locally.", category: "Video", icon: "▶", tone: "rose", action: "video", badge: "Local" },
  { name: "Audio Converter", description: "Prepare audio for MP3, WAV, FLAC, AAC, OGG and more.", category: "Audio", icon: "↻", tone: "amber", action: "connect" },
  { name: "Stem Separator", description: "Separate vocals, drums, bass and instruments with a connected model.", category: "Audio", icon: "≋", tone: "indigo", action: "connect" },
  { name: "BPM Detector", description: "Analyze tempo and timing for music production workflows.", category: "Audio", icon: "♩", tone: "lime", action: "connect" },
  { name: "Audio to MIDI", description: "Turn melodies and performances into editable MIDI data.", category: "Audio", icon: "⌨", tone: "blue", action: "connect" },
  { name: "Denoise & De-reverb", description: "Clean recordings using an external audio processing provider.", category: "Audio", icon: "◌", tone: "cyan", action: "connect" },
  { name: "AI Song Generator", description: "Create songs from a prompt through your chosen music provider.", category: "Create", icon: "✦", tone: "violet", action: "connect", badge: "Provider" },
  { name: "AI Vocal Generator", description: "Generate or transform vocal performances with connected models.", category: "Create", icon: "◉", tone: "rose", action: "connect" },
  { name: "Cover & Remix", description: "Build authorized covers and remixes from music you can use.", category: "Create", icon: "∞", tone: "amber", action: "connect" },
  { name: "Text to Speech", description: "Create natural speech through ElevenLabs or another provider.", category: "Create", icon: "Aa", tone: "blue", action: "connect" },
  { name: "Merge PDF", description: "Combine multiple PDFs in your chosen order, entirely in the browser.", category: "PDF", icon: "⊕", tone: "rose", action: "pdf", badge: "Local" },
  { name: "Split PDF", description: "Extract a range or package every page as an individual PDF.", category: "PDF", icon: "✂", tone: "amber", action: "pdf", badge: "Local" },
  { name: "Compress PDF", description: "Optimize PDF structure and object streams without uploading.", category: "PDF", icon: "⇲", tone: "lime", action: "pdf" },
  { name: "Organize PDF", description: "Extract, remove or reorder selected pages with precise ranges.", category: "PDF", icon: "▦", tone: "violet", action: "pdf" },
  { name: "Rotate PDF", description: "Rotate every page clockwise and export a clean PDF.", category: "PDF", icon: "↻", tone: "blue", action: "pdf" },
  { name: "Page Numbers", description: "Add consistent page numbering to an entire document.", category: "PDF", icon: "#", tone: "indigo", action: "pdf" },
  { name: "Watermark PDF", description: "Apply a centered text watermark across every page.", category: "PDF", icon: "W", tone: "cyan", action: "pdf" },
  { name: "JPG to PDF", description: "Create a polished multi-page PDF from JPG and PNG images.", category: "PDF", icon: "▧", tone: "rose", action: "pdf" },
  { name: "PDF to JPG", description: "Render document pages through a connected conversion service.", category: "PDF", icon: "▣", tone: "amber", action: "connect" },
  { name: "PDF to Word", description: "Preserve document structure with an enterprise conversion provider.", category: "PDF", icon: "W", tone: "blue", action: "connect" },
  { name: "PDF to PowerPoint", description: "Convert PDF pages into editable presentation slides.", category: "PDF", icon: "P", tone: "rose", action: "connect" },
  { name: "PDF to Excel", description: "Extract structured tables into an editable workbook.", category: "PDF", icon: "X", tone: "lime", action: "connect" },
  { name: "Word to PDF", description: "Convert DOC and DOCX through an office conversion provider.", category: "PDF", icon: "↗", tone: "blue", action: "connect" },
  { name: "PowerPoint to PDF", description: "Export PPT and PPTX decks as portable PDF files.", category: "PDF", icon: "↗", tone: "rose", action: "connect" },
  { name: "Excel to PDF", description: "Turn spreadsheets into shareable, print-ready PDFs.", category: "PDF", icon: "↗", tone: "lime", action: "connect" },
  { name: "Edit & Sign PDF", description: "Annotate, redact, fill and sign with a document provider.", category: "PDF", icon: "✎", tone: "violet", action: "connect" },
  { name: "Protect & Unlock PDF", description: "Manage passwords only for documents you are authorized to edit.", category: "PDF", icon: "◇", tone: "amber", action: "connect" },
  { name: "OCR & Repair PDF", description: "Recover text and damaged document structure with OCR services.", category: "PDF", icon: "◎", tone: "cyan", action: "connect" },
  { name: "Compare & Translate PDF", description: "Review document changes or translate while preserving layout.", category: "PDF", icon: "⇄", tone: "indigo", action: "connect" },
  { name: "Image Compressor", description: "Resize and compress JPG, PNG and WebP images locally.", category: "Image", icon: "◫", tone: "lime", action: "image", badge: "Local" },
  { name: "Image Resizer", description: "Set a maximum width while preserving the original aspect ratio.", category: "Image", icon: "↔", tone: "cyan", action: "image" },
  { name: "Image Converter", description: "Convert images to JPG, PNG or WebP in your browser.", category: "Image", icon: "⇄", tone: "violet", action: "image" },
  { name: "YouTube & Link Downloader", description: "Process direct public media links you own or can download.", category: "Download", icon: "↓", tone: "rose", action: "downloader" },
  { name: "Batch Link Downloader", description: "Queue public direct-file pages while respecting source permissions.", category: "Download", icon: "☷", tone: "amber", action: "downloader" },
];

const providers = ["Suno", "MiniMax", "Lyria 3", "Audimee", "LALAL.ai", "Vocuno", "Udio", "Mureka", "MusicGPT", "ElevenLabs", "Moises AI"];
const categories = ["All", "Audio", "Video", "PDF", "Image", "Create", "Download"];
const themes = [
  { id: "electric", label: "Electric blue", color: "#5b7cff" },
  { id: "violet", label: "Studio violet", color: "#9b6cff" },
  { id: "emerald", label: "Signal green", color: "#24c69a" },
  { id: "sunset", label: "Sunset coral", color: "#ff6d6d" },
];

const pricing = [
  {
    name: "Starter", old: "$19", price: "$14", note: "For hobbyists exploring creative tools", credits: "3,000 monthly credits", save: "Save $60 compared to monthly",
    features: ["All the latest models", "Every tool included", "100% ownership + commercial license", "Standard audio quality", "2 generations at once · standard queue", "Distribute up to 5 releases / month", "Basic Studio editor", "YouTube & public-link tools"],
  },
  {
    name: "Pro", old: "$49", price: "$34", note: "For creators who ship tracks", credits: "10,000 monthly credits", save: "Save $180 compared to monthly", popular: true,
    features: ["Everything in Starter", "High-quality WAV audio", "6 generations at once · priority queue", "Distribute up to 25 releases / month", "Advanced Studio · multitrack mixing", "Cover or remix authorized public songs", "15% off credit top-ups", "Batch public-link downloader"],
  },
  {
    name: "Studio", old: "$99", price: "$69", note: "For professionals who want maximum freedom", credits: "30,000 priority credits", save: "Save $360 compared to monthly",
    features: ["Everything in Pro", "Unlimited eligible provider generations", "Unlimited conversions and local exports", "Every provider and quality mode", "Studio-grade audio quality", "Distribute up to 100 releases / month", "10,000 Marketplace credits / month", "Priority support"],
  },
];

function Brand() {
  return <a className="brand" href="#top" aria-label="Trenith Tools home"><span className="brand-glyph"><i /><i /><i /></span><span>Trenith<span className="brand-accent">Tools</span></span></a>;
}

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    document.body.classList.add("modal-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("modal-open"); };
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="tool-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-header"><div><span>{eyebrow}</span><h2 id="modal-title">{title}</h2></div><button onClick={onClose} aria-label="Close tool">×</button></header>
      {children}
    </section>
  </div>;
}

function DropZone({ accept, files, onFiles, folder, title, note }: { accept: string; files: File[]; onFiles: (files: File[]) => void; folder?: boolean; title: string; note: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (folder && input.current) input.current.setAttribute("webkitdirectory", ""); }, [folder]);
  const add = (list: FileList | null) => { if (list?.length) onFiles([...list]); };
  return <>
    <button className="drop-zone" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); add(event.dataTransfer.files); }}>
      <span className="drop-icon">＋</span><strong>{title}</strong><small>{note}</small>
    </button>
    <input ref={input} className="sr-only" type="file" accept={accept} multiple onChange={(event) => add(event.target.files)} />
    {files.length > 0 && <span className="selection-summary">{files.length} file{files.length === 1 ? "" : "s"} selected</span>}
  </>;
}

function FileQueue({ files, setFiles }: { files: File[]; setFiles: (files: File[]) => void }) {
  const move = (index: number, direction: number) => {
    const next = [...files];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFiles(next);
  };
  return <div className="file-queue">
    {files.map((file, index) => <div className="queue-item" key={`${file.name}-${file.lastModified}-${index}`}>
      <span className="queue-number">{String(index + 1).padStart(2, "0")}</span>
      <div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div>
      <div className="queue-actions"><button onClick={() => move(index, -1)} disabled={!index} aria-label="Move up">↑</button><button onClick={() => move(index, 1)} disabled={index === files.length - 1} aria-label="Move down">↓</button><button onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove">×</button></div>
    </div>)}
  </div>;
}

function Progress({ value, label }: { value: number; label: string }) {
  return <div className="progress-box" aria-live="polite"><div><span>{label}</span><strong>{value}%</strong></div><div className="progress-track"><i style={{ width: `${value}%` }} /></div></div>;
}

export default function Home() {
  const [theme, setTheme] = useState("electric");
  const [themeOpen, setThemeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [activeTool, setActiveTool] = useState<ToolAction | null>(null);
  const [connectName, setConnectName] = useState("");

  const [url, setUrl] = useState("");
  const [audioResults, setAudioResults] = useState<AudioResult[]>([]);
  const [sourceTitle, setSourceTitle] = useState("");
  const [downloaderBusy, setDownloaderBusy] = useState(false);
  const [downloaderError, setDownloaderError] = useState("");

  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [pdfMode, setPdfMode] = useState<PdfMode>("merge");
  const [pageSelection, setPageSelection] = useState("1-3,5");
  const [watermark, setWatermark] = useState("TRENITH");
  const [imageWidth, setImageWidth] = useState(1920);
  const [imageQuality, setImageQuality] = useState(82);
  const [imageFormat, setImageFormat] = useState<"image/jpeg" | "image/png" | "image/webp">("image/webp");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [toolError, setToolError] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("trenith-theme") || "electric";
    const frame = requestAnimationFrame(() => setTheme(saved));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("trenith-theme", theme);
  }, [theme]);

  const setColorTheme = (next: string) => {
    setTheme(next);
  };

  const visibleTools = useMemo(() => tools.filter((tool) => {
    const matchesCategory = category === "All" || tool.category === category;
    const matchesQuery = `${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  }), [category, query]);

  const openTool = (tool: Tool, preferredPdfMode?: PdfMode) => {
    if (preferredPdfMode) setPdfMode(preferredPdfMode);
    if (tool.action === "pdf") {
      const name = tool.name.toLowerCase();
      if (name.includes("split")) setPdfMode("split");
      else if (name.includes("compress")) setPdfMode("compress");
      else if (name.includes("organize")) setPdfMode("extract");
      else if (name.includes("rotate")) setPdfMode("rotate");
      else if (name.includes("number")) setPdfMode("number");
      else if (name.includes("watermark")) setPdfMode("watermark");
      else if (name.includes("jpg")) setPdfMode("images");
      else setPdfMode("merge");
    }
    if (tool.action === "connect") setConnectName(tool.name);
    setToolError("");
    setProgress(0);
    setActiveTool(tool.action || "connect");
  };

  const scanUrl = async (event: FormEvent) => {
    event.preventDefault();
    setDownloaderBusy(true); setDownloaderError(""); setAudioResults([]);
    try {
      const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await response.json() as { title?: string; files?: AudioResult[]; error?: string };
      if (!response.ok) throw new Error(data.error || "The link could not be scanned.");
      setSourceTitle(data.title || "Public source");
      setAudioResults(data.files || []);
    } catch (error) { setDownloaderError(error instanceof Error ? error.message : "The link could not be scanned."); }
    finally { setDownloaderBusy(false); }
  };

  const runJoin = async (kind: "audio" | "video") => {
    setProcessing(true); setToolError(""); setProgress(1);
    try {
      const output = kind === "audio"
        ? await joinAudioFiles(audioFiles, (value, label) => { setProgress(value); setProgressLabel(label); })
        : await joinVideoFiles(videoFiles, (value, label) => { setProgress(value); setProgressLabel(label); });
      downloadBlob(output.blob, output.filename);
    } catch (error) { setToolError(error instanceof Error ? error.message : "The files could not be joined."); }
    finally { setProcessing(false); }
  };

  const runPdf = async () => {
    setProcessing(true); setToolError(""); setProgress(1);
    const update = (value: number, label: string) => { setProgress(value); setProgressLabel(label); };
    try {
      let blob: Blob;
      let filename = "trenith-document.pdf";
      if (pdfMode === "merge") blob = await mergePdfFiles(pdfFiles, update);
      else if (pdfMode === "images") blob = await imagesToPdf(pdfFiles, update);
      else {
        if (!pdfFiles[0]) throw new Error("Choose a PDF file first.");
        if (pdfMode === "extract") blob = await extractPdfPages(pdfFiles[0], pageSelection, update);
        else if (pdfMode === "split") { blob = await splitPdfToZip(pdfFiles[0], update); filename = "trenith-split-pages.zip"; }
        else blob = await transformPdf(pdfFiles[0], pdfMode, watermark, update);
      }
      downloadBlob(blob, filename);
    } catch (error) { setToolError(error instanceof Error ? error.message : "The document could not be processed."); }
    finally { setProcessing(false); }
  };

  const runImage = async () => {
    setProcessing(true); setToolError(""); setProgress(5); setProgressLabel("Preparing image");
    try {
      if (!imageFiles[0]) throw new Error("Choose an image first.");
      const output = await processImage(imageFiles[0], imageWidth, imageQuality / 100, imageFormat);
      setProgress(100); setProgressLabel(`${output.width} × ${output.height} ready`);
      downloadBlob(output.blob, output.filename);
    } catch (error) { setToolError(error instanceof Error ? error.message : "The image could not be processed."); }
    finally { setProcessing(false); }
  };

  const addSortedFiles = (existing: File[], incoming: File[], kind: "audio" | "video" | "pdf" | "image") => {
    const patterns = {
      audio: /\.(mp3|wav|m4a|aac|ogg|flac|opus|webm)$/i,
      video: /\.(mp4|webm|mov|m4v|ogv)$/i,
      pdf: pdfMode === "images" ? /\.(jpe?g|png)$/i : /\.pdf$/i,
      image: /\.(jpe?g|png|webp)$/i,
    };
    const accepted = incoming.filter((file) => patterns[kind].test(file.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const unique = [...existing, ...accepted].filter((file, index, list) => list.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index);
    return unique;
  };

  return <main id="top">
    <div className="background-orb orb-one" /><div className="background-orb orb-two" />
    <header className="site-header">
      <Brand />
      <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Main navigation">
        <a href="#tools" onClick={() => setMenuOpen(false)}>Tools</a><a href="#studio" onClick={() => setMenuOpen(false)}>AI Studio</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a><a href="#about" onClick={() => setMenuOpen(false)}>About</a>
      </nav>
      <div className="header-actions">
        <button className="theme-button" onClick={() => setThemeOpen(!themeOpen)} aria-label="Change color theme"><i style={{ background: themes.find((item) => item.id === theme)?.color }} />Theme</button>
        <a className="header-cta" href="#tools">Open tools <span>↗</span></a>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? "×" : "☰"}</button>
      </div>
      {themeOpen && <div className="theme-popover"><strong>Interface color</strong>{themes.map((item) => <button key={item.id} className={theme === item.id ? "selected" : ""} onClick={() => setColorTheme(item.id)}><i style={{ background: item.color }} />{item.label}<span>✓</span></button>)}</div>}
    </header>

    <section className="hero">
      <div className="hero-copy-block">
        <span className="eyebrow"><i /> One workspace. Every format.</span>
        <h1>Create, convert and join.<br /><em>Without the friction.</em></h1>
        <p>Professional media, document and creator tools built by Trenith Technologies. Core file operations run privately in your browser.</p>
        <div className="hero-actions"><a className="primary-cta" href="#tools">Explore all tools <span>→</span></a><button className="secondary-cta" onClick={() => setActiveTool("audio")}><span>⌁</span> Join audio now</button></div>
        <div className="trust-row"><span><i>✓</i> Local-first processing</span><span><i>✓</i> Folder uploads</span><span><i>✓</i> No account required</span></div>
      </div>
      <div className="hero-console" aria-label="Trenith workflow preview">
        <div className="console-top"><span><i /><i /><i /></span><strong>Trenith Workspace</strong><small>LOCAL MODE</small></div>
        <div className="console-wave">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 17) % 54)}px` }} />)}</div>
        <div className="console-files"><div><span>01</span><strong>intro.wav</strong><em>03:42</em></div><div><span>02</span><strong>chapter-01.wav</strong><em>18:09</em></div><div><span>03</span><strong>outro.wav</strong><em>01:16</em></div></div>
        <div className="console-export"><span><i /> Ready to export</span><button onClick={() => setActiveTool("audio")}>Join 3 files <b>→</b></button></div>
      </div>
    </section>

    <section className="quick-tools" aria-label="Popular tools">
      {tools.filter((tool) => ["Audio Downloader", "Audio Joiner", "Video Joiner", "Merge PDF", "Image Compressor"].includes(tool.name)).map((tool) => <button key={tool.name} onClick={() => openTool(tool)}><span className={`tool-icon ${tool.tone}`}>{tool.icon}</span><div><strong>{tool.name}</strong><small>{tool.description.split(".")[0]}</small></div><b>↗</b></button>)}
    </section>

    <section className="tools-section" id="tools">
      <div className="section-intro"><span className="eyebrow"><i /> The complete toolkit</span><h2>Everything you need,<br /><em>ready when you are.</em></h2><p>Search the full suite. Tools marked Local process files on your device; provider tools are ready for secure API integration.</p></div>
      <div className="tool-controls"><div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools, formats or workflows…" /><kbd>⌘ K</kbd></div><div className="category-tabs">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}>{item}</button>)}</div></div>
      <div className="tool-grid">
        {visibleTools.map((tool) => <button className="tool-card" key={tool.name} onClick={() => openTool(tool)}>
          <div className="tool-card-top"><span className={`tool-icon ${tool.tone}`}>{tool.icon}</span>{tool.badge && <small>{tool.badge}</small>}<b>↗</b></div><strong>{tool.name}</strong><p>{tool.description}</p><span className="tool-category">{tool.category}</span>
        </button>)}
      </div>
      {!visibleTools.length && <div className="no-results">No tools match “{query}”. Try a format like PDF, audio or image.</div>}
    </section>

    <section className="privacy-band">
      <div><span className="privacy-mark">◇</span><div><small>LOCAL-FIRST ENGINE</small><h2>Your files stay under your control.</h2></div></div>
      <p>Audio joining, supported video joining, PDF editing and image conversion happen in your browser. There is no arbitrary app-level file-count cap; practical capacity depends on your device and browser memory.</p>
    </section>

    <section className="studio-section" id="studio">
      <div className="studio-copy"><span className="eyebrow"><i /> Provider-ready studio</span><h2>One creative desk.<br /><em>Every leading model.</em></h2><p>Connect the services your organization licenses, choose the right model for each job, and keep your workflow in one branded experience.</p><button className="primary-cta" onClick={() => { setConnectName("Trenith AI Studio"); setActiveTool("connect"); }}>Configure providers <span>→</span></button></div>
      <div className="provider-panel"><div className="provider-head"><span>AVAILABLE PROVIDERS</span><small>11 integrations</small></div><div className="provider-grid">{providers.map((provider, index) => <button key={provider} onClick={() => { setConnectName(provider); setActiveTool("connect"); }}><i>{provider.slice(0, 1)}</i><strong>{provider}</strong><span>{index < 6 ? "Ready" : "Connect"}</span></button>)}</div></div>
    </section>

    <section className="pricing-section" id="pricing">
      <div className="section-intro centered"><span className="eyebrow"><i /> Annual plans</span><h2>Built for every stage<br /><em>of your workflow.</em></h2><p>Plan content is ready for billing integration. Provider usage and rights remain subject to each connected service.</p></div>
      <div className="pricing-grid">{pricing.map((plan) => <article className={plan.popular ? "pricing-card popular" : "pricing-card"} key={plan.name}>{plan.popular && <span className="popular-label">MOST POPULAR</span>}<div className="plan-head"><h3>{plan.name}</h3><p>{plan.note}</p></div><div className="price"><del>{plan.old}</del><strong>{plan.price}</strong><span>/mo</span></div><small className="billing-note">billed annually · {plan.save}</small><div className="credit-pill">{plan.credits}</div><button>Choose {plan.name} <span>→</span></button><ul>{plan.features.map((feature) => <li key={feature}><i>✓</i>{feature}</li>)}</ul></article>)}</div>
    </section>

    <section className="about-section" id="about"><div><span className="eyebrow"><i /> Built in India. Ready for the world.</span><h2>Tools that feel simple,<br /><em>even when the work is not.</em></h2></div><div><p>Trenith Tools brings media and document workflows into one fast, private and extensible product surface. The architecture is ready for production provider credentials, billing and account services when you are.</p><a href="https://trenith.com" target="_blank" rel="noreferrer">Visit trenith.com <span>↗</span></a></div></section>

    <footer><div><Brand /><p>Professional creator and document tools by Trenith Technologies Pvt Ltd.</p></div><div className="footer-links"><a href="#tools">Tools</a><a href="#studio">Studio</a><a href="#pricing">Pricing</a><a href="https://trenith.com" target="_blank" rel="noreferrer">Trenith.com</a></div><div className="footer-bottom"><span>© 2026 Trenith Technologies Pvt Ltd. All rights reserved.</span><span>Co-authored by Sai Phanindra Manikanta Yalamanchili</span></div></footer>

    {activeTool === "downloader" && <Modal title="Public audio downloader" eyebrow="LINK TOOL" onClose={() => setActiveTool(null)}><div className="workspace-body"><p className="workspace-lead">Paste a public webpage or direct audio-file URL. Trenith reveals audio links the source openly exposes; it does not bypass access controls or platform protections.</p><form className="url-form" onSubmit={scanUrl}><span>⌕</span><input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/page-or-audio.mp3" /><button disabled={downloaderBusy}>{downloaderBusy ? "Scanning…" : "Find audio"}</button></form><p className="legal-note">Only process media you own, have permission to use, or are authorized to download.</p>{downloaderError && <div className="tool-error">{downloaderError}</div>}{audioResults.length > 0 && <div className="download-results"><div><strong>{sourceTitle}</strong><span>{audioResults.length} public file{audioResults.length === 1 ? "" : "s"} found</span></div>{audioResults.map((file) => <article key={file.url}><span>♪</span><div><strong>{file.name}</strong><small>{file.format}</small></div><audio controls preload="none" src={file.url} /><a href={`/api/download?url=${encodeURIComponent(file.url)}`} download={file.name}>Download ↓</a></article>)}</div>}</div></Modal>}

    {activeTool === "audio" && <Modal title="Audio joiner" eyebrow="LOCAL MEDIA TOOL" onClose={() => setActiveTool(null)}><div className="workspace-body two-column"><div><p className="workspace-lead">Add individual tracks or select a complete folder. Reorder them, then export one lossless WAV without uploading the source files.</p><div className="drop-pair"><DropZone accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.webm" files={audioFiles} onFiles={(incoming) => setAudioFiles(addSortedFiles(audioFiles, incoming, "audio"))} title="Add audio files" note="Drag and drop or browse" /><DropZone folder accept="audio/*" files={[]} onFiles={(incoming) => setAudioFiles(addSortedFiles(audioFiles, incoming, "audio"))} title="Add a folder" note="Files are sorted naturally" /></div>{audioFiles.length > 0 && <FileQueue files={audioFiles} setFiles={setAudioFiles} />}</div><aside className="export-panel"><span>OUTPUT</span><h3>Lossless WAV</h3><p>44.1 kHz · up to stereo · original order</p><div className="output-stat"><span>Files</span><strong>{audioFiles.length}</strong></div><div className="output-stat"><span>Total size</span><strong>{(audioFiles.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB</strong></div>{progress > 0 && <Progress value={progress} label={progressLabel} />}{toolError && <div className="tool-error">{toolError}</div>}<button className="workspace-action" disabled={processing || audioFiles.length < 2} onClick={() => runJoin("audio")}>{processing ? "Processing…" : "Join and download"}<span>→</span></button><small>Capacity is limited only by browser memory and the formats your browser can decode.</small></aside></div></Modal>}

    {activeTool === "video" && <Modal title="Video joiner" eyebrow="LOCAL MEDIA TOOL" onClose={() => setActiveTool(null)}><div className="workspace-body two-column"><div><p className="workspace-lead">Combine browser-compatible MP4, WebM, MOV, M4V or OGV clips in order. The result is recorded locally as WebM.</p><div className="drop-pair"><DropZone accept="video/*,.mp4,.webm,.mov,.m4v,.ogv" files={videoFiles} onFiles={(incoming) => setVideoFiles(addSortedFiles(videoFiles, incoming, "video"))} title="Add video files" note="Drag and drop or browse" /><DropZone folder accept="video/*" files={[]} onFiles={(incoming) => setVideoFiles(addSortedFiles(videoFiles, incoming, "video"))} title="Add a folder" note="Files are sorted naturally" /></div>{videoFiles.length > 0 && <FileQueue files={videoFiles} setFiles={setVideoFiles} />}</div><aside className="export-panel"><span>OUTPUT</span><h3>High-quality WebM</h3><p>Up to 1080p · 30fps · VP9/VP8 + Opus</p><div className="output-stat"><span>Clips</span><strong>{videoFiles.length}</strong></div><div className="output-stat"><span>Total size</span><strong>{(videoFiles.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB</strong></div>{progress > 0 && <Progress value={progress} label={progressLabel} />}{toolError && <div className="tool-error">{toolError}</div>}<button className="workspace-action" disabled={processing || videoFiles.length < 2} onClick={() => runJoin("video")}>{processing ? "Recording clips…" : "Join and download"}<span>→</span></button><small>Keep this tab active during recording. Codec support varies by browser.</small></aside></div></Modal>}

    {activeTool === "pdf" && <Modal title="PDF workspace" eyebrow="LOCAL DOCUMENT TOOLS" onClose={() => setActiveTool(null)}><div className="workspace-body"><div className="mode-tabs">{(["merge", "extract", "split", "rotate", "number", "watermark", "compress", "images"] as PdfMode[]).map((mode) => <button key={mode} className={pdfMode === mode ? "active" : ""} onClick={() => { setPdfMode(mode); setPdfFiles([]); }}>{mode === "images" ? "JPG to PDF" : mode === "number" ? "Page numbers" : mode[0].toUpperCase() + mode.slice(1)}</button>)}</div><div className="pdf-workspace"><div><DropZone accept={pdfMode === "images" ? "image/jpeg,image/png,.jpg,.jpeg,.png" : "application/pdf,.pdf"} files={pdfFiles} onFiles={(incoming) => setPdfFiles(addSortedFiles(pdfFiles, incoming, "pdf"))} title={pdfMode === "images" ? "Add JPG or PNG images" : pdfMode === "merge" ? "Add PDF files" : "Choose a PDF"} note={pdfMode === "merge" || pdfMode === "images" ? "Multiple files supported" : "Processed privately in your browser"} />{pdfFiles.length > 0 && <FileQueue files={pdfFiles} setFiles={setPdfFiles} />}</div><aside className="export-panel"><span>PDF ACTION</span><h3>{pdfMode === "images" ? "Create PDF" : pdfMode === "extract" ? "Extract pages" : pdfMode === "split" ? "Split every page" : `${pdfMode[0].toUpperCase()}${pdfMode.slice(1)} PDF`}</h3>{pdfMode === "extract" && <label className="field-label">Page selection<input value={pageSelection} onChange={(event) => setPageSelection(event.target.value)} placeholder="1-3,5,8" /></label>}{pdfMode === "watermark" && <label className="field-label">Watermark text<input value={watermark} maxLength={48} onChange={(event) => setWatermark(event.target.value)} /></label>}<p>{pdfMode === "compress" ? "Optimizes structural objects; image-heavy PDFs may not shrink significantly." : pdfMode === "split" ? "Every page downloads inside one ZIP archive." : "Your original file is never modified."}</p>{progress > 0 && <Progress value={progress} label={progressLabel} />}{toolError && <div className="tool-error">{toolError}</div>}<button className="workspace-action" disabled={processing || !pdfFiles.length || (pdfMode === "merge" && pdfFiles.length < 2)} onClick={runPdf}>{processing ? "Processing…" : "Process and download"}<span>→</span></button></aside></div></div></Modal>}

    {activeTool === "image" && <Modal title="Image converter" eyebrow="LOCAL IMAGE TOOL" onClose={() => setActiveTool(null)}><div className="workspace-body two-column"><div><p className="workspace-lead">Resize, compress and convert a JPG, PNG or WebP image without uploading it.</p><DropZone accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" files={imageFiles} onFiles={(incoming) => setImageFiles(addSortedFiles([], incoming.slice(0, 1), "image"))} title="Choose an image" note="JPG, PNG or WebP" />{imageFiles.length > 0 && <FileQueue files={imageFiles} setFiles={setImageFiles} />}</div><aside className="export-panel"><span>EXPORT SETTINGS</span><label className="field-label">Maximum width<input type="number" min="64" max="10000" value={imageWidth} onChange={(event) => setImageWidth(Number(event.target.value))} /></label><label className="field-label">Format<select value={imageFormat} onChange={(event) => setImageFormat(event.target.value as typeof imageFormat)}><option value="image/webp">WebP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label><label className="field-label">Quality · {imageQuality}%<input type="range" min="25" max="100" value={imageQuality} onChange={(event) => setImageQuality(Number(event.target.value))} disabled={imageFormat === "image/png"} /></label>{progress > 0 && <Progress value={progress} label={progressLabel} />}{toolError && <div className="tool-error">{toolError}</div>}<button className="workspace-action" disabled={processing || !imageFiles.length} onClick={runImage}>{processing ? "Processing…" : "Convert and download"}<span>→</span></button></aside></div></Modal>}

    {activeTool === "connect" && <Modal title={connectName || "Provider tool"} eyebrow="SECURE INTEGRATION" onClose={() => setActiveTool(null)}><div className="workspace-body connect-panel"><span className="connect-icon">⌁</span><h3>Ready for your provider credentials</h3><p>This interface is prepared for a licensed API connection. Add the provider account, billing service and server-side credentials before offering generations or advanced cloud conversions to customers.</p><div className="connect-checks"><span><i>✓</i>No fake generations</span><span><i>✓</i>No browser-exposed API keys</span><span><i>✓</i>Commercial rights stay traceable</span></div><a href="https://trenith.com" target="_blank" rel="noreferrer" className="workspace-action">Contact Trenith for integration <span>↗</span></a></div></Modal>}
  </main>;
}
