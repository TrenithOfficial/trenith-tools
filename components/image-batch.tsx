"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "../lib/client-tools";
import { decodeImage, extensionFor, formatMeta, OUTPUT_FORMATS, renderImage, sourceSize, type ImageOutputFormat } from "../lib/image-engine";
import { FileList, FilePicker, Progress, megabytes } from "./workspace-bits";

type Item = { file: File; status: "queued" | "working" | "done" | "failed"; url?: string; blob?: Blob; filename?: string; width?: number; height?: number; error?: string };

const ACCEPT = "image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff,.svg";

function stem(name: string) {
  return (name.replace(/\.[^./\\]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "image");
}

// Batch companion to the single-image editor: the same quality-first engine
// (stepped resampling, exact format labelling, no silent upscaling) applied to
// a whole folder, with one ZIP at the end.
export function ImageBatch({ slug }: { slug: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [format, setFormat] = useState<ImageOutputFormat>(slug === "image-compressor" ? "image/webp" : slug === "image-converter" ? "image/png" : "image/jpeg");
  const [quality, setQuality] = useState(slug === "image-compressor" ? 80 : 90);
  const [maxWidth, setMaxWidth] = useState(slug === "image-resizer" ? 1920 : 0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [bg, setBg] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");

  // Object URLs live until the next run or unmount; revoking on every items
  // change would kill the download links of finished entries mid-batch.
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => { itemsRef.current.forEach((item) => { if (item.url) URL.revokeObjectURL(item.url); }); }, []);
  const meta = formatMeta(format);

  async function run() {
    if (!files.length) return;
    setBusy(true); setProgress(1); setLabel("Starting");
    items.forEach((item) => { if (item.url) URL.revokeObjectURL(item.url); });
    const queue: Item[] = files.map((file) => ({ file, status: "queued" }));
    setItems(queue);
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      setProgress(Math.max(1, Math.round((index / queue.length) * 100)));
      setLabel(`Processing ${index + 1} of ${queue.length}: ${item.file.name}`);
      setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, status: "working" } : entry));
      try {
        const source = await decodeImage(item.file);
        try {
          const { width, height } = sourceSize(source);
          const out = await renderImage(source, { targetWidth: maxWidth || undefined, targetHeight: maxHeight || undefined, lockAspect: !(maxWidth && maxHeight), allowUpscale: false, format, quality: quality / 100, background: bg, crop: { x: 0, y: 0, width, height } });
          const filename = `${stem(item.file.name)}.${extensionFor(format, out.type)}`;
          const done: Item = { ...item, status: "done", blob: out.blob, url: URL.createObjectURL(out.blob), filename, width: out.width, height: out.height };
          queue[index] = done;
          setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? done : entry));
        } finally {
          if ("close" in source) source.close();
        }
      } catch (caught) {
        const failed: Item = { ...item, status: "failed", error: caught instanceof Error ? caught.message : "This image could not be processed." };
        queue[index] = failed;
        setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? failed : entry));
      }
    }
    setProgress(100); setLabel(`${queue.filter((item) => item.status === "done").length} of ${queue.length} ready`);
    setBusy(false);
  }

  async function downloadZip() {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const used = new Set<string>();
    for (const item of items) {
      if (!item.blob || !item.filename) continue;
      let name = item.filename;
      let counter = 2;
      while (used.has(name)) { name = item.filename.replace(/(\.[^.]+)$/, ` (${counter})$1`); counter += 1; }
      used.add(name);
      zip.file(name, item.blob);
    }
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "STORE" }), `trenith-${slug}-batch.zip`);
  }

  const doneCount = items.filter((item) => item.status === "done").length;
  const totalIn = items.filter((item) => item.status === "done").reduce((sum, item) => sum + item.file.size, 0);
  const totalOut = items.filter((item) => item.status === "done").reduce((sum, item) => sum + (item.blob?.size || 0), 0);

  return <div className="tool-workspace file-workspace image-batch">
    <section className="workspace-panel file-input-panel">
      <div className="panel-heading-row"><div><span className="panel-label">BATCH MODE</span><h2>Process many images at once</h2></div>{files.length > 0 && <button className="text-button" onClick={() => { setFiles([]); setItems([]); }}>Clear queue</button>}</div>
      <p>Same engine as the editor above — crisp stepped downscaling, exact format labels, no upscaling — applied to every file in a folder, then one ZIP. HEIC, TIFF, AVIF and SVG open too.</p>
      <div className="picker-grid"><FilePicker files={files} setFiles={setFiles} accept={ACCEPT} title="Choose images" hint="JPG, PNG, WebP, GIF, BMP, AVIF, HEIC, TIFF, SVG" /><FilePicker files={files} setFiles={setFiles} accept={ACCEPT} folder title="Choose a complete folder" /></div>
      {files.length > 0 && <FileList files={files} setFiles={setFiles} />}
      {items.length > 0 && <div className="batch-results">{items.map((item, index) => <article key={`${item.file.name}-${index}`} className={item.status}><div><strong>{item.filename || item.file.name}</strong><small>{item.status === "done" && item.blob ? `${item.width}×${item.height} · ${megabytes(item.blob.size)}${item.blob.size < item.file.size ? ` · ${Math.round((1 - item.blob.size / item.file.size) * 100)}% smaller` : ""}` : item.status === "failed" ? item.error : item.status === "working" ? "Processing…" : "Queued"}</small></div>{item.status === "done" && item.url && <a href={item.url} download={item.filename}>Download ↓</a>}</article>)}</div>}
    </section>
    <aside className="workspace-panel output-panel">
      <span className="panel-label">BATCH SETTINGS</span><h2>{meta.label}{meta.lossy ? "" : " · lossless"}</h2>
      <p>{files.length} file{files.length === 1 ? "" : "s"} · {megabytes(files.reduce((sum, file) => sum + file.size, 0))} selected</p>
      <label>Format<select value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}>{OUTPUT_FORMATS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}{entry.lossy ? "" : " · lossless"}</option>)}</select></label>
      {meta.lossy && <label>Quality · {quality}%<input type="range" min={30} max={100} value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
      <div className="option-grid"><label>Max width (px)<input type="number" min={0} placeholder="keep" value={maxWidth || ""} onChange={(event) => setMaxWidth(Math.max(0, Number(event.target.value) || 0))} /></label><label>Max height (px)<input type="number" min={0} placeholder="keep" value={maxHeight || ""} onChange={(event) => setMaxHeight(Math.max(0, Number(event.target.value) || 0))} /></label></div>
      {meta.opaque && <label className="editor-bg-row">Background<input type="color" value={bg} onChange={(event) => setBg(event.target.value)} /><small>Used where an image is transparent</small></label>}
      <small>Images smaller than the limits stay at their own size — nothing is upscaled. Leave both blank to keep every size.</small>
      {progress > 0 && <Progress value={progress} label={label} />}
      {doneCount > 0 && <div className="output-ready"><div><span>✓</span><div><strong>{doneCount} image{doneCount === 1 ? "" : "s"} ready</strong><small>{megabytes(totalIn)} → {megabytes(totalOut)}{totalOut < totalIn ? ` · ${Math.round((1 - totalOut / totalIn) * 100)}% smaller` : ""}</small></div></div>{doneCount > 1 ? <button className="workspace-download" onClick={downloadZip}>Download all as ZIP <span>↓</span></button> : items.find((item) => item.status === "done")?.url && <a className="workspace-download" href={items.find((item) => item.status === "done")!.url} download={items.find((item) => item.status === "done")!.filename}>Download <span>↓</span></a>}</div>}
      <button className="workspace-run" onClick={run} disabled={busy || !files.length}>{busy ? "Processing…" : doneCount ? "Run again" : `Process ${files.length || ""} image${files.length === 1 ? "" : "s"}`}<span>→</span></button>
    </aside>
  </div>;
}
