"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downloadBlob } from "../lib/client-tools";
import { extractPdfText, renderPdfPages, type RenderedPage } from "../lib/pdf-tools";
import { trenithContactUrl } from "../lib/site";
import { FilePicker, Progress, megabytes } from "./workspace-bits";

type Format = "image/jpeg" | "image/png" | "image/webp";

export function PdfRasterWorkspace({ slug }: { slug: "pdf-to-image" | "pdf-to-text" }) {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];
  const [format, setFormat] = useState<Format>("image/jpeg");
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(90);
  const [pages, setPages] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [rendered, setRendered] = useState<Array<RenderedPage & { url: string }>>([]);
  const [text, setText] = useState<{ text: string; pages: number; empty: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => { rendered.forEach((page) => URL.revokeObjectURL(page.url)); }, [rendered]);
  // Reset outputs when the source changes, synchronously during render (the
  // "adjust state on change" pattern) instead of through an effect.
  const [lastFile, setLastFile] = useState<File | undefined>(file);
  if (file !== lastFile) { setLastFile(file); setRendered([]); setText(null); setError(""); setProgress(0); }

  const update = (value: number, message: string) => { setProgress(value); setLabel(message); };

  function parsePages(value: string): number[] | undefined {
    const selection: number[] = [];
    for (const part of value.split(",").map((entry) => entry.trim()).filter(Boolean)) {
      const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) { const [from, to] = [Number(range[1]), Number(range[2])]; for (let page = Math.min(from, to); page <= Math.max(from, to); page += 1) selection.push(page); }
      else if (/^\d+$/.test(part)) selection.push(Number(part));
    }
    return selection.length ? selection : undefined;
  }

  async function run() {
    if (!file) return;
    setBusy(true); setError(""); setProgress(1); setLabel("Starting");
    rendered.forEach((page) => URL.revokeObjectURL(page.url));
    setRendered([]); setText(null);
    try {
      if (slug === "pdf-to-image") {
        const output = await renderPdfPages(file, { format, dpi, quality: quality / 100, pages: parsePages(pages) }, update);
        setRendered(output.map((page) => ({ ...page, url: URL.createObjectURL(page.blob) })));
      } else {
        setText(await extractPdfText(file, update));
      }
    } catch (caught) {
      setProgress(0); setLabel("");
      setError(caught instanceof Error ? caught.message : "The PDF could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    rendered.forEach((page) => zip.file(page.name, page.blob));
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "STORE" }), `${file?.name.replace(/\.pdf$/i, "") || "pages"}-images.zip`);
  }

  async function copyText() {
    if (!text) return;
    await navigator.clipboard.writeText(text.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const extension = format === "image/jpeg" ? "JPG" : format === "image/png" ? "PNG" : "WebP";

  return <div className="tool-workspace file-workspace">
    <section className="workspace-panel file-input-panel">
      <div className="panel-heading-row"><div><span className="panel-label">INPUT</span><h2>Choose a PDF</h2></div>{file && <button className="text-button" onClick={() => setFiles([])}>Clear</button>}</div>
      <p>The document is rendered by the pdf.js engine inside this tab. Nothing is uploaded; fonts and colour profiles load on demand from Trenith&apos;s own origin.</p>
      <FilePicker files={files} setFiles={setFiles} accept="application/pdf,.pdf" multiple={false} title="Choose a PDF" />
      {file && <div className="workspace-file-list"><div><span>01</span><div><strong>{file.name}</strong><small>{megabytes(file.size)}</small></div><div><button onClick={() => setFiles([])} aria-label={`Remove ${file.name}`}>×</button></div></div></div>}
      {rendered.length > 0 && <div className="pdf-page-grid">{rendered.map((page) => <figure key={page.name}>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview URL */}
        <img src={page.url} alt={`Page ${page.page}`} loading="lazy" /><figcaption><span>Page {page.page} · {page.width}×{page.height}</span><a href={page.url} download={page.name}>↓ {megabytes(page.blob.size)}</a></figcaption></figure>)}</div>}
      {text && <div className="pdf-text-output"><div className="pdf-text-head"><strong>{text.pages} page{text.pages === 1 ? "" : "s"} · {text.text.length.toLocaleString()} characters</strong><div><button className="secondary-button" onClick={copyText}>{copied ? "Copied" : "Copy text"}</button><button className="secondary-button" onClick={() => downloadBlob(new Blob([text.text], { type: "text/plain" }), `${file?.name.replace(/\.pdf$/i, "") || "document"}.txt`)}>Download .txt</button></div></div>{text.empty ? <p className="metadata-warning">No text layer was found. This PDF is probably a scan — run it through the <Link href="/studio?workflow=ocr-pdf">OCR workflow</Link> with your own vision-capable key.</p> : <textarea readOnly value={text.text} rows={18} />}</div>}
    </section>
    <aside className="workspace-panel output-panel">
      <span className="panel-label">OUTPUT</span><h2>{slug === "pdf-to-image" ? `${extension} per page` : "Plain text with page markers"}</h2>
      <p>{file ? file.name : "No file selected"}</p>
      {slug === "pdf-to-image" && <>
        <label>Image format<select value={format} onChange={(event) => setFormat(event.target.value as Format)}><option value="image/jpeg">JPG · photos and mixed pages</option><option value="image/png">PNG · lossless, crisp text</option><option value="image/webp">WebP · smallest</option></select></label>
        <label>Resolution<select value={dpi} onChange={(event) => setDpi(Number(event.target.value))}><option value={72}>72 dpi · screen preview</option><option value={110}>110 dpi · web</option><option value={150}>150 dpi · documents</option><option value={200}>200 dpi · sharp reading</option><option value={300}>300 dpi · print</option></select><small>An A4 page at 150 dpi is 1240×1754 px; 300 dpi is 2480×3508 px.</small></label>
        {format !== "image/png" && <label>Quality · {quality}%<input type="range" min={50} max={100} step={5} value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
        <label>Pages<input value={pages} onChange={(event) => setPages(event.target.value)} placeholder="All pages — or 1-3,7" /></label>
      </>}
      {slug === "pdf-to-text" && <div className="large-job-note"><strong>Real text layer only</strong><p>Characters are read exactly as embedded by the authoring app, with reading order and line breaks reconstructed from their positions. Scanned pages have no text layer; use the OCR workflow for those.</p></div>}
      {progress > 0 && <Progress value={progress} label={label} />}
      {error && <div className="workspace-error" role="alert">{error}</div>}
      {rendered.length > 1 && <button className="secondary-button" onClick={downloadZip}>Download all {rendered.length} pages as ZIP ↓</button>}
      {rendered.length === 1 && <a className="workspace-download" href={rendered[0].url} download={rendered[0].name}>Download {extension} <span>↓</span></a>}
      {text && !text.empty && <Link className="secondary-workspace-link" href="/studio?workflow=pdf-summarizer">Summarize or translate this text in AI Studio →</Link>}
      <button className="workspace-run" onClick={run} disabled={busy || !file}>{busy ? "Processing…" : slug === "pdf-to-image" ? "Render pages" : "Extract text"}<span>→</span></button>
      <small>Large documents render page by page; a 100-page file at 300 dpi needs a desktop browser with free memory.</small>
      <div className="result-business-cta compact"><div><strong>Need document pipelines at scale?</strong><p>Trenith builds private document processing, OCR and automation systems.</p></div><a href={trenithContactUrl} target="_blank" rel="noreferrer">Talk to Trenith ↗</a></div>
    </aside>
  </div>;
}
