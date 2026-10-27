"use client";

import { useMemo, useRef, useState } from "react";
import { downloadBlob } from "../lib/client-tools";
import { canCleanMetadata, cleanAndVerify, classifyFields, inspectMetadata, routeFor, routeLabel, unsupportedReason, type FieldReport, type MetadataField, type RiskCategory } from "../lib/metadata-clean";

type ScrubItem = {
  id: string;
  file: File;
  status: "queued" | "scanning" | "ready" | "cleaning" | "clean" | "unsupported" | "error";
  before: MetadataField[];
  report: FieldReport;
  after: MetadataField[];
  afterReport: FieldReport;
  notes: string[];
  embedded: number;
  passes: number;
  progress?: string;
  output?: Blob;
  error?: string;
};

const wasmFetch = async () => window.fetch("/zeroperl.wasm", { cache: "force-cache" });
const categoryOrder: RiskCategory[] = ["Location", "Identity", "Device", "Timestamps", "Software", "Descriptive"];
const emptyReport: FieldReport = { identifying: [], other: [], categories: {} };
// Media that ExifTool can read but that the FFmpeg engine rewrites: skip the
// ExifTool pre-scan beyond this size so a 1 GB recording does not get loaded
// into the Perl heap twice.
const SCAN_LIMIT_BYTES = 600 * 1024 * 1024;

function categorySummary(report: FieldReport) {
  return categoryOrder.filter((category) => report.categories[category]).map((category) => `${category} ${report.categories[category]}`).join(" · ");
}

function statusLabel(item: ScrubItem) {
  if (item.status === "queued") return "Waiting to scan";
  if (item.status === "scanning") return "Inspecting metadata";
  if (item.status === "ready") return item.report.identifying.length ? `${item.report.identifying.length} identifying field${item.report.identifying.length === 1 ? "" : "s"} · ${categorySummary(item.report)}` : `No identifying fields detected · ${item.report.other.length} structural`;
  if (item.status === "cleaning") return item.progress || "Removing metadata";
  if (item.status === "clean") {
    const removed = Math.max(0, item.report.identifying.length - item.afterReport.identifying.length);
    return item.afterReport.identifying.length ? `${removed} removed · ${item.afterReport.identifying.length} identifying remain` : `${removed} identifying field${removed === 1 ? "" : "s"} removed · verified clean${item.embedded ? ` · ${item.embedded} embedded cleaned` : ""}`;
  }
  if (item.status === "unsupported") return item.report.identifying.length ? `${item.report.identifying.length} identifying field${item.report.identifying.length === 1 ? "" : "s"} detected · inspect only` : "Inspect only";
  return item.error || "Processing failed";
}

function FieldTable({ fields, prefix }: { fields: MetadataField[]; prefix: string }) {
  return <dl>{fields.slice(0, 120).map(([key, value]) => <div key={`${prefix}-${key}`}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

export function MetadataScrubber() {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScrubItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showOther, setShowOther] = useState<Record<string, boolean>>({});
  const update = (id: string, value: Partial<ScrubItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...value } : item));

  const totals = useMemo(() => ({
    files: items.length,
    detected: items.reduce((sum, item) => sum + item.report.identifying.length, 0),
    removed: items.filter((item) => item.status === "clean").reduce((sum, item) => sum + Math.max(0, item.report.identifying.length - item.afterReport.identifying.length), 0),
    cleaned: items.filter((item) => item.output).length,
    embedded: items.reduce((sum, item) => sum + item.embedded, 0),
  }), [items]);

  async function scanOne(item: ScrubItem) {
    update(item.id, { status: "scanning", error: undefined });
    const cleanable = canCleanMetadata(item.file.name);
    const route = routeFor(item.file.name);
    if (route === "plain") { update(item.id, { status: "ready", before: [], report: emptyReport }); return; }
    if (route === "media" && item.file.size > SCAN_LIMIT_BYTES) { update(item.id, { status: "ready", before: [], report: emptyReport, notes: ["Large recording: inspection skipped, cleaning rewrites every tag and chapter."] }); return; }
    try {
      const before = await inspectMetadata(item.file, item.file.name, wasmFetch);
      setEngineReady(true);
      update(item.id, { status: cleanable ? "ready" : "unsupported", before, report: classifyFields(before), error: cleanable ? undefined : unsupportedReason(item.file.name) });
    } catch (caught) {
      // ExifTool could not parse it. Routes with their own engine can still clean.
      const message = caught instanceof Error ? caught.message : "The file format could not be inspected.";
      if (cleanable && route !== "unsupported") update(item.id, { status: "ready", before: [], report: emptyReport, notes: [`Inspection skipped: ${message}`] });
      else update(item.id, { status: "unsupported", error: cleanable ? message : unsupportedReason(item.file.name) });
    }
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const additions: ScrubItem[] = [...fileList]
      .sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((file) => ({ id: crypto.randomUUID(), file, status: "queued" as const, before: [], report: emptyReport, after: [], afterReport: emptyReport, notes: [], embedded: 0, passes: 0 }));
    setItems((current) => [...current, ...additions]);
    setBusy(true);
    for (const item of additions) await scanOne(item);
    setBusy(false);
  }

  async function cleanOne(item: ScrubItem) {
    update(item.id, { status: "cleaning", error: undefined, progress: "Removing metadata" });
    try {
      const result = await cleanAndVerify(item.file, wasmFetch, (message) => update(item.id, { progress: message }));
      // Commit the downloadable output together with the verification so a file
      // is never shown as clean without the evidence behind that label.
      update(item.id, { status: "clean", output: result.blob, after: result.after, afterReport: result.report, notes: [...new Set([...item.notes, ...result.notes])], embedded: result.embedded, passes: result.passes, progress: undefined });
      setEngineReady(true);
    } catch (caught) {
      update(item.id, { status: "error", error: caught instanceof Error ? caught.message : "Metadata removal failed.", progress: undefined });
    }
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
    const epoch = new Date(Date.UTC(1980, 0, 1));
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
      zip.file(name, item.output!, { date: epoch });
    });
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), "trenith-metadata-cleaned.zip");
  }

  const pendingCount = items.filter((item) => item.status === "ready" || item.status === "error").length;

  return <div className="metadata-workspace">
    <section className="workspace-panel metadata-intro">
      <div><span className="panel-label">PRIVACY SCRUBBER</span><h2>Inspect first. Remove second. Verify before download.</h2><p>Every file type gets the engine that can actually rewrite it: ExifTool for images and RAW, a lossless FFmpeg stream copy for audio and video, document rewriters for PDF, Word, Excel, PowerPoint, OpenDocument, EPUB, SVG, HTML and RTF, and a recursive pass through ZIP archives and the media embedded inside documents. Colour profiles, orientation and track languages are kept so nothing looks or plays differently.</p></div>
      <div className="metadata-pickers"><button className="file-picker" onClick={() => input.current?.click()}><span>＋</span><strong>Choose any files</strong><small>Images, RAW, audio, video, documents, archives</small></button><button className="file-picker" onClick={() => folderInput.current?.click()}><span>▦</span><strong>Choose a folder</strong><small>Preserves folder-relative names in ZIP export</small></button></div>
      <input ref={input} className="sr-only" type="file" multiple onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} />
      <input ref={(node) => { folderInput.current = node; if (node) node.setAttribute("webkitdirectory", ""); }} className="sr-only" type="file" multiple onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} />
      <div className="metadata-engine"><span className={engineReady ? "status-dot" : "engine-dot"} /><strong>{engineReady ? "Private cleaning engines ready" : busy ? "Loading the private cleaning engine…" : "Engines load only after you select a file"}</strong><small>No file content is sent to Trenith. The media engine (about 31 MB) loads on first use for audio and video.</small></div>
    </section>

    {items.length > 0 && <section className="workspace-panel metadata-results">
      <div className="metadata-results-head"><div><span className="panel-label">INSPECTION REPORT</span><h2>{totals.files} file{totals.files === 1 ? "" : "s"}</h2><p className="metadata-totals">{totals.detected} identifying field{totals.detected === 1 ? "" : "s"} detected{totals.cleaned ? ` · ${totals.removed} removed in ${totals.cleaned} cleaned file${totals.cleaned === 1 ? "" : "s"}` : ""}{totals.embedded ? ` · ${totals.embedded} embedded file${totals.embedded === 1 ? "" : "s"} cleaned inside documents` : ""}</p></div><div><button className="secondary-button" onClick={() => setItems([])} disabled={busy}>Clear</button><button className="primary-action" onClick={cleanAll} disabled={busy || !pendingCount}>{busy ? "Working…" : `Remove metadata from ${pendingCount || "all"} file${pendingCount === 1 ? "" : "s"}`}<span>→</span></button></div></div>
      <div className="metadata-list">{items.map((item) => {
        const route = routeFor(item.file.name);
        const remainingIdentifying = item.afterReport.identifying;
        return <article key={item.id} className={`metadata-row ${item.status}`}>
          <div className="metadata-row-head">
            <button className="metadata-summary" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-expanded={expanded === item.id}><span className="metadata-file-icon">{item.file.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}</span><div><strong>{item.file.webkitRelativePath || item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(2)} MB · {statusLabel(item)}</small></div><b>{expanded === item.id ? "−" : "+"}</b></button>
            {item.output && <button className="metadata-row-download" onClick={() => downloadBlob(item.output!, `clean-${item.file.name}`)} aria-label={`Download cleaned ${item.file.name}`}>Download ↓</button>}
          </div>
          {expanded === item.id && <div className="metadata-details">
            <p className="metadata-route"><span>ENGINE</span> {routeLabel(route)}</p>
            {item.error && <p className="metadata-warning">{item.error}</p>}
            {item.report.identifying.length > 0 && <div className="metadata-categories">{categoryOrder.filter((category) => item.report.categories[category]).map((category) => <span key={category} className={`metadata-category ${category.toLowerCase()}`}>{category} · {item.report.categories[category]}</span>)}</div>}
            {item.before.length ? <>
              <h3>Identifying fields detected ({item.report.identifying.length})</h3>
              {item.report.identifying.length ? <FieldTable fields={item.report.identifying} prefix="before" /> : <p>None. The fields below describe the format, not the author.</p>}
              {item.report.other.length > 0 && <p><button className="text-button" onClick={() => setShowOther((current) => ({ ...current, [item.id]: !current[item.id] }))}>{showOther[item.id] ? "Hide" : "Show"} {item.report.other.length} structural field{item.report.other.length === 1 ? "" : "s"}</button></p>}
              {showOther[item.id] && <FieldTable fields={item.report.other} prefix="other" />}
            </> : item.status !== "scanning" && item.status !== "queued" && <p>{route === "plain" ? "This format has no metadata container, so there is nothing to remove." : "No metadata fields were readable before cleaning."}</p>}
            {item.status === "clean" && <>
              <p className={remainingIdentifying.length ? "metadata-warning" : "metadata-clean-note"}>{remainingIdentifying.length ? `Verification found ${remainingIdentifying.length} identifying field${remainingIdentifying.length === 1 ? "" : "s"} that could not be removed in-browser.` : `Verification complete${item.passes > 1 ? ` after ${item.passes} passes` : ""}: no identifying metadata remains. ${item.afterReport.other.length} structural field${item.afterReport.other.length === 1 ? "" : "s"} describe the format only.`}</p>
              {remainingIdentifying.length > 0 && <><h3>Still present after cleaning</h3><FieldTable fields={remainingIdentifying} prefix="after" /></>}
            </>}
            {item.notes.length > 0 && <ul className="metadata-notes">{item.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
            <div className="metadata-row-actions">{(item.status === "ready" || item.status === "error") && <button className="secondary-button" onClick={() => void cleanOne(item)} disabled={busy}>Clean this file</button>}{item.output && <button className="secondary-button" onClick={() => downloadBlob(item.output!, `clean-${item.file.name}`)}>Download cleaned file</button>}</div>
          </div>}
        </article>;
      })}</div>
      {items.filter((item) => item.output).length > 1 && <button className="workspace-run" onClick={downloadZip}>Download all cleaned files as ZIP <span>↓</span></button>}
      <p className="metadata-caveat">Verification is format-aware and re-reads every cleaned file, but no automated remover can promise that every proprietary application trace, visible watermark or detail drawn into the pixels is gone. Review high-risk files with the receiving application before publication.</p>
    </section>}
  </div>;
}
