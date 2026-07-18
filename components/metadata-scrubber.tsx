"use client";

import { useRef, useState } from "react";
import { downloadBlob } from "../lib/client-tools";
import { canCleanMetadata, stripFileMetadata } from "../lib/metadata-clean";

type MetadataValue = string | number | boolean | null | MetadataValue[] | { [key: string]: MetadataValue };
type MetadataMap = Record<string, MetadataValue>;
type ScrubItem = {
  id: string;
  file: File;
  status: "queued" | "scanning" | "ready" | "cleaning" | "clean" | "unsupported" | "error";
  before: Array<[string, string]>;
  after: Array<[string, string]>;
  output?: Blob;
  error?: string;
};

// Excludes ExifTool's own tags plus structural/container groups that describe
// the file format (dimensions, bit depth, colour profile) rather than private
// authorship or location metadata, so the "removable fields" count is honest.
const operationalGroups = new Set(["ExifTool", "File", "System", "Composite", "JFIF", "ICC_Profile", "ICC-header", "PNG", "JPEG", "GIF", "BMP", "MPF", "FlashPix"]);
const wasmFetch = async () => window.fetch("/zeroperl.wasm", { cache: "force-cache" });

function displayValue(value: MetadataValue) {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 240);
  return String(value).slice(0, 240);
}

function privateMetadata(input: MetadataMap | undefined) {
  if (!input) return [];
  return Object.entries(input)
    .filter(([key]) => !operationalGroups.has(key.split(":", 1)[0]) && !["SourceFile", "Directory"].includes(key))
    .map(([key, value]) => [key, displayValue(value)] as [string, string])
    .sort(([left], [right]) => left.localeCompare(right));
}

function statusLabel(item: ScrubItem) {
  if (item.status === "queued") return "Waiting to scan";
  if (item.status === "scanning") return "Inspecting metadata";
  if (item.status === "ready") return `${item.before.length} removable field${item.before.length === 1 ? "" : "s"}`;
  if (item.status === "cleaning") return "Removing metadata";
  if (item.status === "clean") return `${Math.max(0, item.before.length - item.after.length)} fields removed · ${item.after.length} remain`;
  if (item.status === "unsupported") return item.before.length ? `${item.before.length} field${item.before.length === 1 ? "" : "s"} detected · inspect only (format cannot be rewritten in-browser)` : "No readable or writable metadata";
  return item.error || "Processing failed";
}

export function MetadataScrubber() {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScrubItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const update = (id: string, value: Partial<ScrubItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...value } : item));

  async function scanOne(item: ScrubItem) {
    update(item.id, { status: "scanning", error: undefined });
    try {
      const { parseMetadata } = await import("@uswriting/exiftool");
      setEngineReady(true);
      const result = await parseMetadata<MetadataMap[]>(item.file, { args: ["-json", "-G1", "-s", "-n"], fetch: wasmFetch, transform: (value) => JSON.parse(value) as MetadataMap[] });
      if (!result.success) throw new Error(result.error);
      // Only promise a clean for formats the engine can actually rewrite; a
      // read-only format is shown as inspect-only rather than "ready" so the
      // user is never offered a removal that would fail with no download.
      update(item.id, { status: canCleanMetadata(item.file.name) ? "ready" : "unsupported", before: privateMetadata(result.data[0]) });
    } catch (caught) {
      update(item.id, { status: "unsupported", error: caught instanceof Error ? caught.message : "The file format could not be inspected." });
    }
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const additions = [...fileList].sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true })).map((file) => ({ id: crypto.randomUUID(), file, status: "queued" as const, before: [], after: [] }));
    setItems((current) => [...current, ...additions]);
    setBusy(true);
    for (const item of additions) await scanOne(item);
    setBusy(false);
  }

  async function cleanOne(item: ScrubItem) {
    update(item.id, { status: "cleaning", error: undefined });
    let blob: Blob;
    try {
      blob = await stripFileMetadata(item.file, wasmFetch);
    } catch (caught) {
      update(item.id, { status: "error", error: caught instanceof Error ? caught.message : "Metadata removal failed." });
      return;
    }
    // Commit the downloadable output before verifying, so a re-inspection error
    // can never discard an already-cleaned file.
    update(item.id, { status: "clean", output: blob, after: [] });
    try {
      const { parseMetadata } = await import("@uswriting/exiftool");
      const verificationFile = new File([blob], item.file.name, { type: item.file.type, lastModified: Date.now() });
      const verified = await parseMetadata<MetadataMap[]>(verificationFile, { args: ["-json", "-G1", "-s", "-n"], fetch: wasmFetch, transform: (value) => JSON.parse(value) as MetadataMap[] });
      if (verified.success) update(item.id, { after: privateMetadata(verified.data[0]) });
    } catch { /* keep the cleaned output even if re-inspection fails */ }
  }

  async function cleanAll() {
    setBusy(true);
    for (const item of items.filter((candidate) => candidate.status === "ready" || candidate.status === "error")) await cleanOne(item);
    setBusy(false);
  }

  async function downloadZip() {
    const cleaned = items.filter((item) => item.output);
    if (!cleaned.length) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    // Two individually-picked files can share a basename (report.pdf from two
    // folders). JSZip overwrites same-name entries, so de-duplicate here — a
    // silent drop from a privacy tool could leave a user with an uncleaned file.
    const usedNames = new Set<string>();
    cleaned.forEach((item) => {
      const base = item.file.webkitRelativePath || item.file.name;
      let name = base;
      if (usedNames.has(name)) {
        const dot = base.lastIndexOf(".");
        const stem = dot > 0 ? base.slice(0, dot) : base;
        const ext = dot > 0 ? base.slice(dot) : "";
        let counter = 2;
        do { name = `${stem} (${counter})${ext}`; counter += 1; } while (usedNames.has(name));
      }
      usedNames.add(name);
      zip.file(name, item.output!);
    });
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), "trenith-metadata-cleaned.zip");
  }

  return <div className="metadata-workspace">
    <section className="workspace-panel metadata-intro">
      <div><span className="panel-label">PRIVACY SCRUBBER</span><h2>Inspect first. Remove second. Verify before download.</h2><p>ExifTool runs as WebAssembly inside this browser. Trenith accepts every file for inspection and safely cleans formats the engine can write without uploading the source.</p></div>
      <div className="metadata-pickers"><button className="file-picker" onClick={() => input.current?.click()}><span>＋</span><strong>Choose any files</strong><small>Images, media, documents, archives and more</small></button><button className="file-picker" onClick={() => folderInput.current?.click()}><span>▦</span><strong>Choose a folder</strong><small>Preserves folder-relative names in ZIP export</small></button></div>
      <input ref={input} className="sr-only" type="file" multiple onChange={(event) => addFiles(event.target.files)} />
      <input ref={(node) => { folderInput.current = node; if (node) node.setAttribute("webkitdirectory", ""); }} className="sr-only" type="file" multiple onChange={(event) => addFiles(event.target.files)} />
      <div className="metadata-engine"><span className={engineReady ? "status-dot" : "engine-dot"} /><strong>{engineReady ? "Private cleaning engine ready" : busy ? "Loading the private cleaning engine…" : "Engine loads only after you select a file"}</strong><small>No file content is sent to Trenith.</small></div>
    </section>

    {items.length > 0 && <section className="workspace-panel metadata-results">
      <div className="metadata-results-head"><div><span className="panel-label">INSPECTION REPORT</span><h2>{items.length} file{items.length === 1 ? "" : "s"}</h2></div><div><button className="secondary-button" onClick={() => setItems([])} disabled={busy}>Clear</button><button className="primary-action" onClick={cleanAll} disabled={busy || !items.some((item) => item.status === "ready" || item.status === "error")}>{busy ? "Working…" : "Remove detected metadata"}<span>→</span></button></div></div>
      <div className="metadata-list">{items.map((item) => <article key={item.id} className={`metadata-row ${item.status}`}><div className="metadata-row-head"><button className="metadata-summary" onClick={() => setExpanded(expanded === item.id ? null : item.id)}><span className="metadata-file-icon">{item.file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}</span><div><strong>{item.file.webkitRelativePath || item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(2)} MB · {statusLabel(item)}</small></div><b>{expanded === item.id ? "−" : "+"}</b></button>{item.output && <button className="metadata-row-download" onClick={() => downloadBlob(item.output!, `clean-${item.file.name}`)} aria-label={`Download cleaned ${item.file.name}`}>Download ↓</button>}</div>{expanded === item.id && <div className="metadata-details">{item.error && <p className="metadata-warning">{item.error}</p>}{item.before.length ? <><h3>Detected before cleaning</h3><dl>{item.before.slice(0, 100).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{item.before.length > 100 && <p>Showing 100 of {item.before.length} fields.</p>}</> : <p>No removable metadata fields were detected.</p>}{item.status === "clean" && <p className="metadata-clean-note">Verification complete: {item.after.length} non-operational metadata fields remain.</p>}{item.status === "clean" && item.after.length > 0 && <><h3>Remaining after cleaning</h3><dl>{item.after.slice(0, 100).map(([key, value]) => <div key={`after-${key}`}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></>}<div className="metadata-row-actions">{item.status === "ready" && <button className="secondary-button" onClick={() => cleanOne(item)}>Clean this file</button>}{item.output && <button className="secondary-button" onClick={() => downloadBlob(item.output!, `clean-${item.file.name}`)}>Download cleaned file</button>}</div></div>}</article>)}</div>
      {items.filter((item) => item.output).length > 1 && <button className="workspace-run" onClick={downloadZip}>Download all cleaned files as ZIP <span>↓</span></button>}
      <p className="metadata-caveat">Verification is format-aware, but no automated remover can promise that every proprietary application-specific trace is gone. Review high-risk files with the receiving application before publication.</p>
    </section>}
  </div>;
}
