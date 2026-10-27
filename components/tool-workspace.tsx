"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ToolDefinition } from "../lib/catalog";
import { MetadataScrubber } from "./metadata-scrubber";
import { SeoUtility } from "./seo-tools";
import { DevUtility } from "./dev-tools";
import { ImageEditor } from "./image-editor";
import { ImageBatch } from "./image-batch";
import { VideoWorkspace } from "./video-tools";
import { PdfRasterWorkspace } from "./pdf-raster";
import { FileList, FilePicker, Progress, formatEta, megabytes } from "./workspace-bits";
import {
  changeAudioVolume,
  compressPdfImages,
  downloadBlob,
  extractPdfPages,
  imagesToPdf,
  joinAudioFiles,
  joinVideoFiles,
  mergePdfFiles,
  splitPdfToZip,
  trimAudioFile,
  transformPdf,
} from "../lib/client-tools";
import { audioFormatOrder, audioProfiles, changeAudioVolumeToFormat, defaultAudioOptions, transcodeAudio, trimAudioLossless, trimAudioToFormat, type AudioOptions, type AudioOutputFormat } from "../lib/audio-transcode";
import { resetFfmpeg } from "../lib/ffmpeg-loader";
import { concatVideosLosslessly } from "../lib/media-convert";
import { probeMedia } from "../lib/media-engine";
import { concatCompatibility } from "../lib/media-probe";
import { trenithContactUrl } from "../lib/site";

type AudioResult = { url: string; name: string; format: string };

export function ToolWorkspace({ tool }: { tool: ToolDefinition }) {
  if (tool.slug === "metadata-remover") return <MetadataScrubber />;
  if (tool.kind === "byok") return <ByokWorkspace tool={tool} />;
  if (tool.slug === "audio-downloader") return <DownloaderWorkspace />;
  if (["tap-bpm", "bpm-delay-calculator", "note-frequency", "metronome"].includes(tool.slug)) return <MusicUtility slug={tool.slug} />;
  if (tool.category === "SEO") return <SeoUtility slug={tool.slug} />;
  if (tool.category === "Developer") return <DevUtility slug={tool.slug} />;
  if (["video-converter", "video-compressor", "video-trimmer", "video-to-audio", "video-to-gif"].includes(tool.slug)) return <VideoWorkspace slug={tool.slug as "video-converter"} />;
  if (["pdf-to-image", "pdf-to-text"].includes(tool.slug)) return <PdfRasterWorkspace slug={tool.slug as "pdf-to-image"} />;
  if (tool.category === "Image") return <><ImageEditor slug={tool.slug} /><ImageBatch slug={tool.slug} /></>;
  if (["audio-converter", "audio-trimmer", "audio-volume-changer"].includes(tool.slug)) return <AudioWorkspace slug={tool.slug as "audio-converter"} />;
  return <FileWorkspace tool={tool} />;
}

function DownloaderWorkspace() {
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<AudioResult[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [error, setError] = useState("");
  async function scan(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResults([]);
    try {
      const response = await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await response.json() as { title?: string; files?: AudioResult[]; error?: string };
      if (!response.ok) throw new Error(data.error || "The public URL could not be scanned.");
      setTitle(data.title || "Public source"); setResults(data.files || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The public URL could not be scanned."); }
    finally { setBusy(false); }
  }
  async function downloadAll() {
    setBatchBusy(true); setBatchProgress(0); setError("");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const used = new Map<string, number>();
      const failures: string[] = [];
      for (let index = 0; index < results.length; index += 1) {
        const file = results[index];
        try {
          const response = await fetch(`/api/download?url=${encodeURIComponent(file.url)}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const duplicate = used.get(file.name) || 0;
          used.set(file.name, duplicate + 1);
          const name = duplicate ? file.name.replace(/(\.[^.]+)?$/, `-${duplicate + 1}$1`) : file.name;
          zip.file(name, await response.blob());
        } catch { failures.push(file.name); }
        setBatchProgress(Math.round(((index + 1) / results.length) * 88));
      }
      if (failures.length === results.length) throw new Error("None of the discovered files could be downloaded from the source.");
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, ({ percent }) => setBatchProgress(88 + Math.round(percent * .12)));
      downloadBlob(blob, "trenith-audio-downloads.zip");
      if (failures.length) setError(`${failures.length} source file${failures.length === 1 ? "" : "s"} could not be added to the ZIP. The remaining files were downloaded.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The batch download could not be created."); }
    finally { setBatchBusy(false); }
  }
  return <div className="tool-workspace downloader-workspace"><div className="workspace-panel"><span className="panel-label">PUBLIC SOURCE</span><h2>Paste an authorized URL</h2><p>The scanner finds direct audio links that the source page openly exposes. It does not bypass logins, DRM or platform restrictions.</p><form className="scanner-form" onSubmit={scan}><span>⌕</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required placeholder="https://example.com/page-or-file.mp3" /><button disabled={busy}>{busy ? "Scanning…" : "Find audio"}</button></form><small className="responsibility-note">Only download media you own, have permission to use, or are otherwise authorized to save.</small>{error && <div className="workspace-error" role="alert">{error}</div>}</div>{results.length > 0 && <div className="result-panel"><div className="result-title"><div><span className="panel-label">RESULTS</span><h2>{title}</h2><p>{results.length} public audio file{results.length === 1 ? "" : "s"} discovered</p></div><div className="result-actions"><strong>{results.length} file{results.length === 1 ? "" : "s"}</strong><button className="secondary-button" onClick={downloadAll} disabled={batchBusy}>{batchBusy ? `Building ZIP · ${batchProgress}%` : "Download all as ZIP ↓"}</button></div></div>{results.map((file, index) => <article key={file.url}><span className="result-index">{String(index + 1).padStart(2, "0")}</span><span className="result-note">♪</span><div><strong>{file.name}</strong><small>{file.format}</small></div><audio controls preload="none" src={file.url} /><a href={`/api/download?url=${encodeURIComponent(file.url)}`} download={file.name}>Download ↓</a></article>)}<div className="result-business-cta"><div><strong>Need repeatable collection or media automation?</strong><p>Trenith can turn this free one-off workflow into a monitored system for your team.</p></div><a href={trenithContactUrl} target="_blank" rel="noreferrer">Build with Trenith ↗</a></div></div>}</div>;
}

// --- Audio converter, trimmer and volume changer --------------------------------------

type BatchItem = { file: File; status: "queued" | "working" | "done" | "failed"; blob?: Blob; filename?: string; url?: string; note?: string; error?: string };
const AUDIO_ACCEPT = "audio/*,video/*,.mp3,.wav,.m4a,.m4b,.aac,.ogg,.oga,.opus,.flac,.webm,.aiff,.aif,.wma,.ac3,.amr,.wv,.mka,.mp4,.mov,.mkv,.caf,.mp2";

function AudioWorkspace({ slug }: { slug: "audio-converter" | "audio-trimmer" | "audio-volume-changer" }) {
  const isConvert = slug === "audio-converter";
  const isTrim = slug === "audio-trimmer";
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [format, setFormat] = useState<AudioOutputFormat | "same">(isConvert ? "mp3" : isTrim ? "same" : "wav");
  const [bitrate, setBitrate] = useState(192);
  const [options, setOptions] = useState<AudioOptions>(defaultAudioOptions);
  const [advanced, setAdvanced] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [eta, setEta] = useState("");
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  const profile = format === "same" ? null : audioProfiles[format];
  const lossy = profile ? !profile.lossless : false;

  // Reset the trim range synchronously when the source file changes so a new
  // file never inherits a stale End time before its metadata loads.
  const [trimFileKey, setTrimFileKey] = useState<File | null>(null);
  if (isTrim && (files[0] ?? null) !== trimFileKey) { setTrimFileKey(files[0] ?? null); setSourceDuration(0); setTrimStart(0); setTrimEnd(0); }

  useEffect(() => {
    if (!isTrim || !files[0]) return;
    const url = URL.createObjectURL(files[0]);
    const audio = document.createElement("audio");
    const loaded = () => { if (Number.isFinite(audio.duration) && audio.duration > 0) { setSourceDuration(audio.duration); setTrimStart(0); setTrimEnd(Number(audio.duration.toFixed(2))); } };
    audio.addEventListener("loadedmetadata", loaded);
    audio.src = url;
    return () => { audio.removeEventListener("loadedmetadata", loaded); audio.src = ""; URL.revokeObjectURL(url); };
  }, [files, isTrim]);

  // Object URLs live until the next run or unmount; revoking on every items
  // change would kill the download links of finished entries mid-batch.
  const itemsRef = useRef<BatchItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => { itemsRef.current.forEach((item) => { if (item.url) URL.revokeObjectURL(item.url); }); }, []);

  const update = (value: number, message: string) => {
    setProgress(value); setLabel(message);
    setEta(value > 14 && value < 96 ? formatEta(performance.now() - startedAt.current, (value - 14) / 82) : "");
  };

  async function processOne(file: File): Promise<{ blob: Blob; filename: string; note?: string }> {
    if (isConvert) {
      const output = await transcodeAudio(file, format as AudioOutputFormat, bitrate, update, options);
      return { blob: output.blob, filename: output.filename, note: output.notes.join(" ") };
    }
    if (isTrim) {
      if (format === "same") { const output = await trimAudioLossless(file, trimStart, trimEnd, update); return { ...output, note: "Cut without re-encoding." }; }
      if (format === "wav" && options.sampleRate === 0 && options.channels === 0 && options.bitDepth === 16) { const output = await trimAudioFile(file, trimStart, trimEnd, update); return { blob: output.blob, filename: output.filename }; }
      const output = await trimAudioToFormat(file, trimStart, trimEnd, format as AudioOutputFormat, bitrate, update, options);
      return { blob: output.blob, filename: output.filename };
    }
    if (format === "wav" && options.sampleRate === 0 && options.channels === 0 && options.bitDepth === 16) { const output = await changeAudioVolume(file, volume, update); return { blob: output.blob, filename: output.filename }; }
    const output = await changeAudioVolumeToFormat(file, volume, format as AudioOutputFormat, bitrate, update, options);
    return { blob: output.blob, filename: output.filename, note: output.notes.join(" ") };
  }

  async function run() {
    if (!files.length) return;
    setBusy(true); setError(""); setProgress(1); setLabel("Starting"); setEta("");
    items.forEach((item) => { if (item.url) URL.revokeObjectURL(item.url); });
    const queue: BatchItem[] = files.map((file) => ({ file, status: "queued" as const }));
    setItems(queue);
    startedAt.current = performance.now();
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, status: "working" } : entry));
      startedAt.current = performance.now();
      try {
        const output = await processOne(item.file);
        const done: BatchItem = { ...item, status: "done", blob: output.blob, filename: output.filename, url: URL.createObjectURL(output.blob), note: output.note };
        setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? done : entry));
        queue[index] = done;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "This file could not be processed.";
        if (/terminate/i.test(message)) { setError("Cancelled."); setItems((current) => current.map((entry, entryIndex) => entryIndex >= index ? { ...entry, status: "failed", error: "Cancelled" } : entry)); break; }
        setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, status: "failed", error: message } : entry));
        queue[index] = { ...item, status: "failed", error: message };
      }
    }
    setProgress(100); setLabel(`${queue.filter((item) => item.status === "done").length} of ${queue.length} ready`); setEta("");
    setBusy(false);
  }

  async function downloadAll() {
    const done = items.filter((item) => item.blob && item.filename);
    if (done.length === 1) { downloadBlob(done[0].blob!, done[0].filename!); return; }
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const used = new Set<string>();
    for (const item of done) {
      let name = item.filename!;
      let counter = 2;
      while (used.has(name)) { name = item.filename!.replace(/(\.[^.]+)$/, ` (${counter})$1`); counter += 1; }
      used.add(name);
      zip.file(name, item.blob!);
    }
    downloadBlob(await zip.generateAsync({ type: "blob", compression: "STORE" }), `trenith-${slug}.zip`);
  }

  const outputLabel = profile ? profile.label : "Same format · no re-encode";
  const doneCount = items.filter((item) => item.status === "done").length;
  const formatChoices = isTrim ? [["same", "Same as source · lossless cut"] as const, ...audioFormatOrder.map((key) => [key, `${audioProfiles[key].label}${audioProfiles[key].lossless ? " · lossless" : ""}`] as const)] : audioFormatOrder.map((key) => [key, `${audioProfiles[key].label}${audioProfiles[key].lossless ? " · lossless" : ""}`] as const);

  return <div className="tool-workspace file-workspace">
    <section className="workspace-panel file-input-panel">
      <div className="panel-heading-row"><div><span className="panel-label">INPUT</span><h2>{isConvert ? "Add one file or a whole batch" : "Choose a source file"}</h2></div>{files.length > 0 && <button className="text-button" onClick={() => { setFiles([]); setItems([]); }}>Clear queue</button>}</div>
      <p>Source files remain in this browser tab. Video files are accepted too — their audio track is used.</p>
      <div className={isConvert ? "picker-grid" : ""}><FilePicker files={files} setFiles={setFiles} accept={AUDIO_ACCEPT} multiple={isConvert} title={isConvert ? "Choose audio files" : "Choose an audio file"} hint="MP3, WAV, FLAC, M4A, AAC, OGG, Opus, AIFF, WMA, WebM, MKV, MP4 and more" />{isConvert && <FilePicker files={files} setFiles={setFiles} accept={AUDIO_ACCEPT} folder multiple title="Choose a complete folder" />}</div>
      {files.length > 0 && <FileList files={files} setFiles={setFiles} />}
    </section>
    <aside className="workspace-panel output-panel">
      <span className="panel-label">OUTPUT</span><h2>{outputLabel}</h2><p>{files.length} file{files.length === 1 ? "" : "s"} · {megabytes(files.reduce((sum, file) => sum + file.size, 0))} selected</p>
      <label>Output format<select value={format} onChange={(event) => setFormat(event.target.value as AudioOutputFormat | "same")}>{formatChoices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      {lossy && <label>Target bitrate · {bitrate} kbps<input type="range" min={64} max={format === "ac3" ? 640 : 320} step={32} value={bitrate} onChange={(event) => setBitrate(Number(event.target.value))} /></label>}
      {isTrim && <div className="time-grid"><label>Start (seconds)<input type="number" min="0" max={sourceDuration || undefined} step="0.01" value={trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} /></label><label>End (seconds)<input type="number" min="0.01" max={sourceDuration || undefined} step="0.01" value={trimEnd || ""} placeholder="End of file" onChange={(event) => setTrimEnd(Number(event.target.value))} /></label>{sourceDuration > 0 ? <small>Detected duration: {sourceDuration.toFixed(2)} seconds{format === "same" ? " · the lossless cut lands on the nearest audio frame (within about 26 ms)" : ""}</small> : files[0] && <small>Length couldn&apos;t be read in this browser — the whole file exports unless you set an End time.</small>}</div>}
      {slug === "audio-volume-changer" && <label>Output volume · {volume}%<input type="range" min="0" max="400" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>}
      {format !== "same" && <button type="button" className="text-button" onClick={() => setAdvanced((value) => !value)}>{advanced ? "Hide" : "Show"} advanced options</button>}
      {advanced && format !== "same" && <div className="option-grid">
        <label>Sample rate<select value={options.sampleRate} onChange={(event) => setOptions({ ...options, sampleRate: Number(event.target.value) as AudioOptions["sampleRate"] })}><option value={0}>Keep source</option><option value={44100}>44.1 kHz</option><option value={48000}>48 kHz</option><option value={96000}>96 kHz</option><option value={22050}>22.05 kHz</option></select></label>
        <label>Channels<select value={options.channels} onChange={(event) => setOptions({ ...options, channels: Number(event.target.value) as AudioOptions["channels"] })}><option value={0}>Keep source</option><option value={2}>Stereo</option><option value={1}>Mono</option></select></label>
        {profile?.lossless && format !== "alac" && <label>Bit depth<select value={options.bitDepth} onChange={(event) => setOptions({ ...options, bitDepth: Number(event.target.value) as AudioOptions["bitDepth"] })}><option value={16}>16-bit</option><option value={24}>24-bit</option>{(format === "wav" || format === "aiff") && <option value={32}>32-bit float</option>}</select></label>}
        <label className="check-label"><input type="checkbox" checked={options.keepTags} onChange={(event) => setOptions({ ...options, keepTags: event.target.checked })} /><span>Keep title, artist and cover art</span></label>
      </div>}
      {isConvert && <div className="large-job-note"><strong>Twelve real encoders</strong><p>MP3, M4A/AAC, WAV, FLAC, ALAC, AIFF, Ogg Vorbis, Opus, WebM, WavPack, AC3 and WMA run in the private media engine. Batches convert one after another and download as a single ZIP.</p></div>}
      {progress > 0 && <Progress value={progress} label={label} eta={eta} />}
      {busy && <button className="secondary-button video-cancel" onClick={() => { resetFfmpeg(); setLabel("Cancelling…"); }}>Cancel</button>}
      {error && <div className="workspace-error" role="alert">{error}</div>}
      {items.length > 0 && <div className="batch-results">{items.map((item, index) => <article key={`${item.file.name}-${index}`} className={item.status}><div><strong>{item.filename || item.file.name}</strong><small>{item.status === "done" && item.blob ? `${megabytes(item.blob.size)}${item.note ? ` · ${item.note}` : ""}` : item.status === "failed" ? item.error : item.status === "working" ? "Processing…" : "Queued"}</small>{item.status === "done" && item.url && <audio controls src={item.url} preload="none" />}</div>{item.status === "done" && item.url && <a href={item.url} download={item.filename}>Download ↓</a>}</article>)}</div>}
      {doneCount > 1 && <button className="secondary-button" onClick={downloadAll}>Download all {doneCount} as ZIP ↓</button>}
      {doneCount > 0 && <div className="result-business-cta compact"><div><strong>Need this workflow at scale?</strong><p>Trenith builds private file pipelines, automation and cloud systems.</p></div><a href={trenithContactUrl} target="_blank" rel="noreferrer">Talk to Trenith ↗</a></div>}
      <button className="workspace-run" onClick={run} disabled={busy || !files.length}>{busy ? "Processing…" : doneCount ? "Run again" : isConvert ? `Convert ${files.length || ""} file${files.length === 1 ? "" : "s"}` : isTrim ? "Cut audio" : "Apply volume"}<span>→</span></button>
      <small>There is no artificial file-count limit. Browser memory, codec support, free storage and individual file health still define practical capacity.</small>
    </aside>
  </div>;
}

// --- PDF, images-to-PDF, audio join and video join ----------------------------------------

function FileWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState("1-3,5");
  const [watermark, setWatermark] = useState("TRENITH");
  const [skipUnreadable, setSkipUnreadable] = useState(false);
  const [joinMode, setJoinMode] = useState<"auto" | "record">("auto");
  const [compressMode, setCompressMode] = useState<"structure" | "images">("images");
  const [imageQuality, setImageQuality] = useState(75);
  const [maxImagePx, setMaxImagePx] = useState(2000);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<{ url: string; filename: string; blob: Blob; notes?: string[] } | null>(null);
  const [savedToDisk, setSavedToDisk] = useState("");

  const isAudioJoin = tool.slug === "audio-joiner";
  const isVideo = tool.slug === "video-joiner";
  const isImagesToPdf = tool.slug === "jpg-to-pdf";
  const multiple = isAudioJoin || isVideo || tool.slug === "merge-pdf" || isImagesToPdf;
  const accept = isAudioJoin ? AUDIO_ACCEPT : isVideo ? "video/*,.mp4,.webm,.mov,.m4v,.ogv,.mkv,.ts" : isImagesToPdf ? "image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff,.svg" : "application/pdf,.pdf";
  const minimum = isAudioJoin || isVideo || tool.slug === "merge-pdf" ? 2 : 1;
  const totalMb = (files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2);

  const outputLabel = useMemo(() => {
    if (isAudioJoin) return "Streaming WAV / RF64";
    if (isVideo) return joinMode === "record" ? "Re-recorded WebM / MP4" : "Lossless join when clips match, re-recorded otherwise";
    if (tool.slug === "split-pdf") return "ZIP with individual PDFs";
    if (tool.slug === "compress-pdf") return compressMode === "images" ? "Smaller PDF · text stays selectable" : "Structurally optimized PDF";
    return "Processed PDF";
  }, [isAudioJoin, isVideo, joinMode, compressMode, tool.slug]);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const update = (value: number, label: string) => { setProgress(value); setProgressLabel(label); };
  async function run() {
    setBusy(true); setError(""); setWarnings([]); setProgress(1); setSavedToDisk("");
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    try {
      let blob: Blob; let filename = "trenith-output.pdf"; let notes: string[] = [];
      if (isAudioJoin) { const output = await joinAudioFiles(files, update, { skipUnreadable }); setWarnings(output.warnings); if (output.savedToDisk) { setSavedToDisk(`${output.filename} was saved to the destination you chose.`); return; } if (!output.blob) throw new Error("The browser did not return an audio output."); blob = output.blob; filename = output.filename; }
      else if (isVideo) {
        let joined: { blob: Blob; filename: string } | null = null;
        if (joinMode === "auto") {
          try {
            update(3, "Inspecting clips for a lossless join");
            const probes = await Promise.all(files.map((file) => probeMedia(file, file.name, update)));
            const compatibility = concatCompatibility(probes);
            if (compatibility.compatible) { joined = await concatVideosLosslessly(files, update); notes = ["Clips shared one codec, size and frame rate, so they were joined without re-encoding."]; }
            else notes = [`${compatibility.reason} The clips were re-recorded through the browser instead.`];
          } catch (caught) {
            notes = [`Lossless join unavailable (${caught instanceof Error ? caught.message : "engine error"}); the clips were re-recorded through the browser instead.`];
          }
        }
        if (!joined) joined = await joinVideoFiles(files, update);
        blob = joined.blob; filename = joined.filename;
      }
      else if (tool.slug === "merge-pdf") { blob = await mergePdfFiles(files, update); filename = "trenith-merged.pdf"; }
      else if (tool.slug === "split-pdf") { blob = await splitPdfToZip(files[0], update); filename = "trenith-split-pages.zip"; }
      else if (tool.slug === "organize-pdf") { blob = await extractPdfPages(files[0], selection, update); filename = "trenith-organized.pdf"; }
      else if (tool.slug === "rotate-pdf") { blob = await transformPdf(files[0], "rotate", "", update); filename = "trenith-rotated.pdf"; }
      else if (tool.slug === "page-numbers") { blob = await transformPdf(files[0], "number", "", update); filename = "trenith-numbered.pdf"; }
      else if (tool.slug === "watermark-pdf") { blob = await transformPdf(files[0], "watermark", watermark, update); filename = "trenith-watermarked.pdf"; }
      else if (tool.slug === "compress-pdf") {
        if (compressMode === "images") { const output = await compressPdfImages(files[0], { quality: imageQuality / 100, maxPixels: maxImagePx }, update); blob = output.blob; notes = output.notes; }
        else blob = await transformPdf(files[0], "compress", "", update);
        filename = "trenith-optimized.pdf";
      }
      else if (isImagesToPdf) { blob = await imagesToPdf(files, update); filename = "trenith-images.pdf"; }
      else throw new Error("This workflow is not available in the current browser.");
      setResult({ blob, filename, url: URL.createObjectURL(blob), notes });
    } catch (caught) {
      setProgress(0);
      setProgressLabel("");
      setError(caught instanceof Error ? caught.message : typeof caught === "string" && caught ? caught : "The selected files could not be processed.");
    }
    finally { setBusy(false); }
  }

  return <div className="tool-workspace file-workspace"><section className="workspace-panel file-input-panel"><div className="panel-heading-row"><div><span className="panel-label">INPUT</span><h2>{multiple ? "Add files in output order" : "Choose a source file"}</h2></div>{files.length > 0 && <button className="text-button" onClick={() => setFiles([])}>Clear queue</button>}</div><p>Source files remain in this browser tab for device-processed tools.</p><div className={multiple && (isAudioJoin || isVideo) ? "picker-grid" : ""}><FilePicker files={files} setFiles={setFiles} accept={accept} multiple={multiple} title={isImagesToPdf ? "Choose images" : "Choose files"} hint={isImagesToPdf ? "JPG, PNG, WebP, GIF, BMP, AVIF, HEIC, TIFF and SVG" : undefined} />{(isAudioJoin || isVideo) && <FilePicker files={files} setFiles={setFiles} accept={accept} folder multiple title="Choose a complete folder" />}</div>{files.length > 0 && <FileList files={files} setFiles={setFiles} />}</section><aside className="workspace-panel output-panel"><span className="panel-label">OUTPUT</span><h2>{outputLabel}</h2><p>{files.length} file{files.length === 1 ? "" : "s"} · {totalMb} MB selected</p>{tool.slug === "organize-pdf" && <label>Page order or ranges<input value={selection} onChange={(event) => setSelection(event.target.value)} placeholder="1-3,5,8 or 8-5" /></label>}{tool.slug === "watermark-pdf" && <label>Watermark text<input value={watermark} onChange={(event) => setWatermark(event.target.value)} maxLength={48} /></label>}{tool.slug === "compress-pdf" && <><fieldset className="editor-group"><legend>Compression</legend><label className="watch-radio"><input type="radio" name="compress-mode" checked={compressMode === "images"} onChange={() => setCompressMode("images")} /><span><strong>Recompress images</strong><small>Embedded photos are re-encoded at the chosen quality and capped resolution; text, vectors and links stay untouched.</small></span></label><label className="watch-radio"><input type="radio" name="compress-mode" checked={compressMode === "structure"} onChange={() => setCompressMode("structure")} /><span><strong>Structure only · lossless</strong><small>Rewrites object streams and drops orphaned data; pixels are never touched.</small></span></label></fieldset>{compressMode === "images" && <><label>Image quality · {imageQuality}%<input type="range" min={30} max={95} step={5} value={imageQuality} onChange={(event) => setImageQuality(Number(event.target.value))} /></label><label>Maximum image size<select value={maxImagePx} onChange={(event) => setMaxImagePx(Number(event.target.value))}><option value={0}>Keep original pixels</option><option value={3000}>3000 px · print</option><option value={2000}>2000 px · sharing</option><option value={1400}>1400 px · screen</option><option value={1000}>1000 px · email</option></select></label></>}</>}{isAudioJoin && <label className="check-label"><input type="checkbox" checked={skipUnreadable} onChange={(event) => setSkipUnreadable(event.target.checked)} /><span>Skip files unreadable by both decoders</span></label>}{isAudioJoin && <div className="large-job-note"><strong>Large-folder mode</strong><p>Jobs over 60 files or 120 MB stream directly to disk in Chrome/Edge. A compatibility decoder is tried automatically when the browser rejects a track.</p></div>}{isVideo && <><fieldset className="editor-group"><legend>Join method</legend><label className="watch-radio"><input type="radio" name="join-mode" checked={joinMode === "auto"} onChange={() => setJoinMode("auto")} /><span><strong>Lossless when possible</strong><small>Clips with the same codec, size and frame rate are concatenated bit-for-bit in seconds.</small></span></label><label className="watch-radio"><input type="radio" name="join-mode" checked={joinMode === "record"} onChange={() => setJoinMode("record")} /><span><strong>Always re-record</strong><small>Plays each clip through the browser and records one WebM/MP4; works for mixed sources.</small></span></label></fieldset></>}{progress > 0 && <Progress value={progress} label={progressLabel} />}{error && <div className="workspace-error" role="alert">{error}</div>}{warnings.length > 0 && <div className="workspace-warning"><strong>{warnings.length} file{warnings.length === 1 ? "" : "s"} skipped</strong><span>{warnings.slice(0, 3).join(" ")}</span></div>}{savedToDisk && <div className="workspace-success"><strong>Saved successfully</strong><span>{savedToDisk}</span></div>}{result && <><div className="output-ready"><div><span>✓</span><div><strong>{result.filename}</strong><small>{megabytes(result.blob.size)} ready{files[0] && files.length === 1 && result.blob.size < files[0].size ? ` · ${Math.round((1 - result.blob.size / files[0].size) * 100)}% smaller` : ""}</small></div></div>{result.blob.type.startsWith("audio/") && <audio controls src={result.url} preload="metadata" />}{result.blob.type.startsWith("video/") && <video controls src={result.url} preload="metadata" />}<a className="workspace-download" href={result.url} download={result.filename}>Download result <span>↓</span></a></div>{result.notes && result.notes.length > 0 && <ul className="metadata-notes">{result.notes.map((note) => <li key={note}>{note}</li>)}</ul>}<div className="result-business-cta compact"><div><strong>Need this workflow at scale?</strong><p>Trenith builds private file pipelines, automation and cloud systems.</p></div><a href={trenithContactUrl} target="_blank" rel="noreferrer">Talk to Trenith ↗</a></div></>}<button className="workspace-run" onClick={run} disabled={busy || files.length < minimum}>{busy ? "Processing…" : isAudioJoin && (files.length > 60 || Number(totalMb) > 120) ? "Choose destination and stream" : result ? "Create again" : "Create output"}<span>→</span></button><small>There is no artificial file-count limit. Browser memory, codec support, free storage and individual file health still define practical capacity.</small></aside></div>;
}

function ByokWorkspace({ tool }: { tool: ToolDefinition }) {
  return <div className="tool-workspace byok-workspace"><section className="workspace-panel"><span className="panel-label">BRING YOUR OWN KEY</span><h2>Run {tool.shortName} with your provider</h2><p>Trenith supplies the interface and request workflow. You supply credentials for a provider you already use. Keys are session-only unless you explicitly encrypt them for this device.</p><div className="byok-steps">{tool.steps.map((step, index) => <div key={step}><span>0{index + 1}</span><p>{step}</p></div>)}</div></section><aside className="workspace-panel output-panel"><span className="panel-label">CONNECTION REQUIRED</span><h2>No bundled credits</h2><p>Connect OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter or a compatible endpoint.</p><Link className="workspace-run" href={`/studio?workflow=${tool.slug}`}>Open in AI Studio <span>→</span></Link><Link className="secondary-workspace-link" href="/connections">Manage provider connections</Link><small>Provider availability, costs, rights and rate limits are controlled by the provider account you connect.</small></aside></div>;
}

function MusicUtility({ slug }: { slug: string }) {
  const [taps, setTaps] = useState<number[]>([]);
  const [bpm, setBpm] = useState(120);
  const [note, setNote] = useState("A");
  const [octave, setOctave] = useState(4);
  const [a4, setA4] = useState(440);
  const [beats, setBeats] = useState(4);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const beatIndex = useRef(0);
  const nextNoteTime = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beats);
  // Keep the live tempo/beats in refs the running scheduler reads, updated in an
  // effect (not during render) so dragging the slider changes speed without
  // restarting the click loop and without the react-hooks/refs violation.
  useEffect(() => { bpmRef.current = bpm; beatsRef.current = beats; });

  useEffect(() => () => { audio.current?.close(); }, []);
  useEffect(() => {
    if (!running) return;
    const context = audio.current || new AudioContext();
    audio.current = context;
    void context.resume();
    // Web-Audio look-ahead scheduler: schedule every beat that falls inside the
    // next 120ms against the audio clock, so the tempo is exact and background-tab
    // timer throttling can never slow the click. bpm/beats are read from refs, so
    // dragging the tempo slider changes speed without restarting the loop or
    // firing a burst of clicks.
    const scheduleClick = (time: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = beatIndex.current % Math.max(1, beatsRef.current) === 0 ? 1150 : 820;
      gain.gain.setValueAtTime(.14, time);
      gain.gain.exponentialRampToValueAtTime(.001, time + .045);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(time); oscillator.stop(time + .05);
      beatIndex.current += 1;
    };
    beatIndex.current = 0;
    nextNoteTime.current = context.currentTime + .06;
    const tick = () => {
      const secondsPerBeat = 60 / Math.max(30, bpmRef.current);
      while (nextNoteTime.current < context.currentTime + .12) {
        scheduleClick(nextNoteTime.current);
        nextNoteTime.current += secondsPerBeat;
      }
    };
    tick();
    timer.current = window.setInterval(tick, 25);
    return () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; };
  }, [running]);
  const tapBpm = taps.length > 1 ? Math.round(60_000 / ((taps[taps.length - 1] - taps[Math.max(0, taps.length - 6)]) / Math.min(5, taps.length - 1))) : 0;
  const noteIndexes: Record<string, number> = { C: -9, "C#": -8, D: -7, "D#": -6, E: -5, F: -4, "F#": -3, G: -2, "G#": -1, A: 0, "A#": 1, B: 2 };
  const frequency = a4 * 2 ** ((noteIndexes[note] + (octave - 4) * 12) / 12);
  const timings = [{ label: "Whole", factor: 4 }, { label: "Half", factor: 2 }, { label: "Quarter", factor: 1 }, { label: "Eighth", factor: .5 }, { label: "Sixteenth", factor: .25 }];
  const toggleMetronome = () => {
    if (!running) {
      const context = audio.current || new AudioContext();
      audio.current = context;
      void context.resume();
      beatIndex.current = 0;
    }
    setRunning((current) => !current);
  };

  if (slug === "tap-bpm") return <div className="calculator-workspace"><span className="panel-label">TAP TEMPO</span><div className="tempo-readout"><strong>{tapBpm || "—"}</strong><span>BPM</span></div><button className="tap-button" onClick={() => setTaps([...taps.slice(-5), Date.now()])}>TAP THE BEAT</button><button className="reset-button" onClick={() => setTaps([])}>Reset taps</button><p>Uses the latest five intervals for a responsive tempo estimate.</p></div>;
  if (slug === "bpm-delay-calculator") return <div className="calculator-workspace"><span className="panel-label">TEMPO INPUT</span><label className="large-input">BPM<input type="number" min="20" max="400" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><div className="timing-grid">{timings.map((item) => { const base = bpm >= 1 ? 60_000 / bpm : 0; const ms = (value: number) => bpm >= 1 ? `${Math.round(value)} ms` : "—"; return <article key={item.label}><span>{item.label}</span><strong>{ms(base * item.factor)}</strong><small>Dotted {ms(base * item.factor * 1.5)} · Triplet {ms(base * item.factor * 2 / 3)}</small></article>; })}</div></div>;
  if (slug === "note-frequency") return <div className="calculator-workspace"><span className="panel-label">EQUAL TEMPERAMENT</span><div className="frequency-controls"><label>Note<select value={note} onChange={(event) => setNote(event.target.value)}>{Object.keys(noteIndexes).map((item) => <option key={item}>{item}</option>)}</select></label><label>Octave<input type="number" min="0" max="9" value={octave} onChange={(event) => setOctave(Number(event.target.value))} /></label><label>A4 reference<input type="number" min="400" max="480" value={a4} onChange={(event) => setA4(Number(event.target.value))} /></label></div><div className="frequency-result"><strong>{frequency.toFixed(3)}</strong><span>Hz</span><p>{note}{octave} with A4 tuned to {a4} Hz</p></div></div>;
  return <div className="calculator-workspace"><span className="panel-label">BROWSER METRONOME</span><div className={running ? "metronome-display running" : "metronome-display"}><i /><strong>{bpm}</strong><span>BPM</span></div><div className="frequency-controls"><label>Tempo<input type="range" min="30" max="240" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><label>Beats per bar<select value={beats} onChange={(event) => setBeats(Number(event.target.value))}>{[2,3,4,5,6,7].map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="workspace-run metronome-button" onClick={toggleMetronome}>{running ? "Stop metronome" : "Start metronome"}</button></div>;
}
