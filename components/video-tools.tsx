"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob } from "../lib/client-tools";
import { formatDuration } from "../lib/media-engine";
import { resetFfmpeg } from "../lib/ffmpeg-loader";
import { convertVideo, defaultVideoOptions, estimateEncodeMinutes, extractAudio, videoContainers, type ExtractTarget, type FpsCap, type HeightCap, type Rotation, type VideoContainer, type VideoOptions, type VideoQuality, type VideoSpeed } from "../lib/media-convert";
import { trenithContactUrl } from "../lib/site";
import { FilePicker, Progress, formatEta, megabytes } from "./workspace-bits";

type VideoSlug = "video-converter" | "video-compressor" | "video-trimmer" | "video-to-audio" | "video-to-gif";
type SourceInfo = { duration: number; width: number; height: number; readable: boolean };
type Outcome = { url: string; blob: Blob; filename: string; mode: string; reasons: string[]; seconds: number; lossless: boolean; sourceSize: number };

const ACCEPT = "video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.wmv,.flv,.ts,.m2ts,.mts,.mpg,.mpeg,.3gp,.ogv,.vob";

export function VideoWorkspace({ slug }: { slug: VideoSlug }) {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [options, setOptions] = useState<VideoOptions>(() => ({ ...defaultVideoOptions, forceEncode: slug === "video-compressor", container: slug === "video-to-gif" ? "gif" : "mp4" }));
  const [extractTarget, setExtractTarget] = useState<ExtractTarget>("mp3");
  const [bitrate, setBitrate] = useState(192);
  const [trimMode, setTrimMode] = useState<"lossless" | "precise">("lossless");
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [eta, setEta] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Outcome | null>(null);
  const startedAt = useRef(0);
  const set = <K extends keyof VideoOptions>(key: K, value: VideoOptions[K]) => setOptions((current) => ({ ...current, [key]: value }));

  // Read duration and dimensions through the browser's own decoder first: it
  // is instant and avoids loading the 31 MB engine just to show a time range.
  const [lastFile, setLastFile] = useState<File | undefined>(file);
  if (file !== lastFile) { setLastFile(file); setSource(null); setResult(null); setError(""); setTrimStart(0); setTrimEnd(0); }

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setPreviewUrl(url));
    const video = document.createElement("video");
    video.preload = "metadata";
    const detach = () => { video.removeEventListener("loadedmetadata", done); video.removeEventListener("error", failed); video.src = ""; };
    const done = () => { setSource({ duration: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth, height: video.videoHeight, readable: true }); setTrimEnd(Number.isFinite(video.duration) ? Number(video.duration.toFixed(2)) : 0); detach(); };
    const failed = () => { setSource({ duration: 0, width: 0, height: 0, readable: false }); detach(); };
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("error", failed);
    video.src = url;
    return () => { cancelAnimationFrame(frame); detach(); URL.revokeObjectURL(url); setPreviewUrl(""); };
  }, [file]);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const estimate = useMemo(() => {
    if (!source?.duration) return "";
    const span = slug === "video-trimmer" || slug === "video-to-gif" ? Math.max(0, (trimEnd || source.duration) - trimStart) : source.duration;
    if (slug === "video-to-audio") return "Audio extraction runs several times faster than real time.";
    if (slug === "video-trimmer" && trimMode === "lossless") return "A lossless cut finishes in seconds regardless of length.";
    if (slug === "video-to-gif") return `About ${Math.max(1, Math.round(span / 10))} s per 10 s of clip.`;
    const height = options.maxHeight && source.height > options.maxHeight ? options.maxHeight : source.height;
    const minutes = estimateEncodeMinutes(span, height, options.container, options.speed);
    return `Re-encoding in the browser takes about ${minutes < 1 ? `${Math.max(10, Math.round(minutes * 60))} s` : `${Math.round(minutes)} min`} for this clip; a lossless container copy is instant when codecs already match.`;
  }, [source, slug, trimStart, trimEnd, trimMode, options.maxHeight, options.container, options.speed]);

  const update = (value: number, message: string) => {
    setProgress(value); setLabel(message);
    const ratio = (value - 10) / 87;
    setEta(value > 10 && value < 97 ? formatEta(performance.now() - startedAt.current, ratio) : "");
  };

  async function run() {
    if (!file) return;
    setBusy(true); setError(""); setProgress(1); setLabel("Starting"); setEta("");
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    startedAt.current = performance.now();
    try {
      if (slug === "video-to-audio") {
        const output = await extractAudio(file, extractTarget, bitrate, update);
        setResult({ url: URL.createObjectURL(output.blob), blob: output.blob, filename: output.filename, mode: output.lossless ? "copy" : "encode", reasons: [output.lossless ? "Audio stream copied bit-for-bit" : `Encoded to ${extractTarget.toUpperCase()}`], seconds: (performance.now() - startedAt.current) / 1000, lossless: output.lossless, sourceSize: file.size });
        return;
      }
      const effective: VideoOptions = { ...options };
      if (slug === "video-trimmer") {
        effective.trimStart = trimStart; effective.trimEnd = trimEnd || undefined;
        effective.forceEncode = trimMode === "precise";
        const sourceExt = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "mp4").toLowerCase();
        effective.container = trimMode === "lossless" ? ((["mp4", "mov", "mkv", "webm"].includes(sourceExt) ? sourceExt : sourceExt === "m4v" ? "mp4" : "mkv") as VideoContainer) : options.container;
      }
      if (slug === "video-to-gif") { effective.container = "gif"; effective.trimStart = trimStart; effective.trimEnd = trimEnd || undefined; }
      if (slug === "video-compressor") effective.forceEncode = true;
      const output = await convertVideo(file, effective, update);
      setResult({ url: URL.createObjectURL(output.blob), blob: output.blob, filename: output.filename, mode: output.mode, reasons: output.reasons, seconds: output.seconds, lossless: output.mode === "remux", sourceSize: file.size });
    } catch (caught) {
      setProgress(0); setLabel("");
      const message = caught instanceof Error ? caught.message : "The video could not be processed.";
      setError(/terminate/i.test(message) ? "Cancelled." : message);
    } finally {
      setBusy(false); setEta("");
    }
  }

  function cancel() {
    resetFfmpeg();
    setLabel("Cancelling…");
  }

  const outputLabel = slug === "video-to-audio" ? extractTarget.toUpperCase() : slug === "video-to-gif" ? "Animated GIF" : slug === "video-trimmer" && trimMode === "lossless" ? "Same codec, keyframe-accurate cut" : videoContainers.find((entry) => entry.value === options.container)?.label || "MP4";
  const previewable = result && /^(video\/mp4|video\/webm|image\/gif|audio\/)/.test(result.blob.type);

  return <div className="tool-workspace file-workspace">
    <section className="workspace-panel file-input-panel">
      <div className="panel-heading-row"><div><span className="panel-label">INPUT</span><h2>Choose a video</h2></div>{file && <button className="text-button" onClick={() => setFiles([])}>Clear</button>}</div>
      <p>The file stays in this browser tab. The private media engine (about 31 MB) loads on first use.</p>
      <FilePicker files={files} setFiles={setFiles} accept={ACCEPT} multiple={false} title="Choose a video file" hint="MP4, MOV, MKV, WebM, AVI, WMV, TS, MPEG, 3GP, FLV, OGV" />
      {file && <div className="workspace-file-list"><div><span>01</span><div><strong>{file.name}</strong><small>{megabytes(file.size)}{source?.readable ? ` · ${source.width}×${source.height} · ${formatDuration(source.duration)}` : source ? " · this browser cannot preview the container; the engine will inspect it" : ""}</small></div><div><button onClick={() => setFiles([])} aria-label={`Remove ${file.name}`}>×</button></div></div></div>}
      {source?.readable && previewUrl && <video className="video-source-preview" controls preload="metadata" src={previewUrl} />}
    </section>
    <aside className="workspace-panel output-panel">
      <span className="panel-label">OUTPUT</span><h2>{outputLabel}</h2>
      <p>{file ? `${file.name} · ${megabytes(file.size)}` : "No file selected"}</p>

      {(slug === "video-converter" || slug === "video-compressor") && <label>Output container<select value={options.container} onChange={(event) => set("container", event.target.value as VideoContainer)}>{videoContainers.filter((entry) => entry.value !== "gif").map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select><small>{videoContainers.find((entry) => entry.value === options.container)?.note}</small></label>}
      {slug === "video-trimmer" && <>
        <div className="time-grid"><label>Start (seconds)<input type="number" min={0} step="0.01" max={source?.duration || undefined} value={trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} /></label><label>End (seconds)<input type="number" min={0} step="0.01" max={source?.duration || undefined} value={trimEnd || ""} placeholder="End of file" onChange={(event) => setTrimEnd(Number(event.target.value))} /></label>{source?.duration ? <small>Detected duration: {source.duration.toFixed(2)} seconds</small> : null}</div>
        <fieldset className="editor-group"><legend>Cut mode</legend>
          <label className="watch-radio"><input type="radio" name="trim-mode" checked={trimMode === "lossless"} onChange={() => setTrimMode("lossless")} /><span><strong>Lossless (no re-encode)</strong><small>Instant and pixel-identical; the cut snaps to the nearest keyframe before the start time, usually within 1–2 s.</small></span></label>
          <label className="watch-radio"><input type="radio" name="trim-mode" checked={trimMode === "precise"} onChange={() => setTrimMode("precise")} /><span><strong>Frame-accurate (re-encode)</strong><small>Exact start and end; re-encodes with H.264 at the chosen quality.</small></span></label>
        </fieldset>
        {trimMode === "precise" && <label>Output container<select value={options.container} onChange={(event) => set("container", event.target.value as VideoContainer)}>{videoContainers.filter((entry) => entry.value !== "gif").map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>}
      </>}
      {slug === "video-to-gif" && <>
        <div className="time-grid"><label>Start (seconds)<input type="number" min={0} step="0.01" value={trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} /></label><label>End (seconds)<input type="number" min={0} step="0.01" value={trimEnd || ""} placeholder="End of file" onChange={(event) => setTrimEnd(Number(event.target.value))} /></label>{source?.duration ? <small>GIFs grow fast: 480 px at 12 fps is about 1 MB per 2 seconds of motion.</small> : null}</div>
        <label>Frame rate<select value={options.gifFps} onChange={(event) => set("gifFps", Number(event.target.value) as 10 | 12 | 15 | 20)}>{[10, 12, 15, 20].map((fps) => <option key={fps} value={fps}>{fps} fps</option>)}</select></label>
        <label>Width<select value={options.gifWidth} onChange={(event) => set("gifWidth", Number(event.target.value) as 320 | 480 | 640 | 800)}>{[320, 480, 640, 800].map((width) => <option key={width} value={width}>{width} px</option>)}</select></label>
      </>}
      {slug === "video-to-audio" && <>
        <label>Audio format<select value={extractTarget} onChange={(event) => setExtractTarget(event.target.value as ExtractTarget)}><option value="mp3">MP3</option><option value="m4a">M4A / AAC</option><option value="wav">WAV · lossless</option><option value="flac">FLAC · lossless</option><option value="opus">Opus</option><option value="ogg">Ogg Vorbis</option></select><small>When the source already uses the same codec (AAC → M4A, MP3 → MP3, Opus → Opus) the stream is copied without any re-encoding.</small></label>
        {["mp3", "m4a", "opus", "ogg"].includes(extractTarget) && <label>Bitrate · {bitrate} kbps<input type="range" min={64} max={320} step={32} value={bitrate} onChange={(event) => setBitrate(Number(event.target.value))} /></label>}
      </>}
      {(slug === "video-converter" || slug === "video-compressor" || (slug === "video-trimmer" && trimMode === "precise")) && <>
        <label>Quality<select value={options.quality} onChange={(event) => set("quality", event.target.value as VideoQuality)}><option value="high">High · visually lossless (CRF 18)</option><option value="balanced">Balanced · CRF 23</option><option value="small">Small · CRF 28</option></select></label>
        <label>Encoder speed<select value={options.speed} onChange={(event) => set("speed", event.target.value as VideoSpeed)}><option value="fast">Fast · larger file</option><option value="balanced">Balanced</option><option value="best">Best compression · slowest</option></select></label>
        <label>Maximum height<select value={options.maxHeight} onChange={(event) => set("maxHeight", Number(event.target.value) as HeightCap)}><option value={0}>Keep source</option><option value={2160}>2160p</option><option value={1440}>1440p</option><option value={1080}>1080p</option><option value={720}>720p</option><option value={480}>480p</option><option value={360}>360p</option></select><small>Never upscales — a smaller source stays as it is.</small></label>
        <label>Maximum frame rate<select value={options.maxFps} onChange={(event) => set("maxFps", Number(event.target.value) as FpsCap)}><option value={0}>Keep source</option><option value={60}>60 fps</option><option value={30}>30 fps</option><option value={24}>24 fps</option><option value={15}>15 fps</option></select></label>
        <label>Rotate<select value={options.rotate} onChange={(event) => set("rotate", Number(event.target.value) as Rotation)}><option value={0}>No rotation</option><option value={90}>90° clockwise</option><option value={180}>180°</option><option value={270}>90° counter-clockwise</option></select></label>
        {slug === "video-compressor" && <label>Target size (MB)<input type="number" min={0} step={1} value={options.targetMb || ""} placeholder="Use quality setting" onChange={(event) => set("targetMb", Math.max(0, Number(event.target.value) || 0))} /><small>Leave empty to compress by quality; enter a size to hit a bitrate budget instead.</small></label>}
        <label className="check-label"><input type="checkbox" checked={options.mute} onChange={(event) => set("mute", event.target.checked)} /><span>Remove the audio track</span></label>
        {slug === "video-converter" && <label className="check-label"><input type="checkbox" checked={options.forceEncode} onChange={(event) => set("forceEncode", event.target.checked)} /><span>Always re-encode (skip the lossless copy when codecs already fit)</span></label>}
      </>}
      {estimate && <div className="large-job-note"><strong>{slug === "video-converter" ? "Smart copy first" : "Time estimate"}</strong><p>{estimate}</p></div>}
      {progress > 0 && <Progress value={progress} label={label} eta={eta} />}
      {busy && <button className="secondary-button video-cancel" onClick={cancel}>Cancel</button>}
      {error && <div className="workspace-error" role="alert">{error}</div>}
      {result && <>
        <div className="output-ready">
          <div><span>✓</span><div><strong>{result.filename}</strong><small>{megabytes(result.blob.size)}{result.sourceSize ? ` · ${result.blob.size < result.sourceSize ? `${Math.round((1 - result.blob.size / result.sourceSize) * 100)}% smaller` : `${Math.round((result.blob.size / result.sourceSize - 1) * 100)}% larger`}` : ""} · {result.seconds < 60 ? `${result.seconds.toFixed(1)} s` : `${(result.seconds / 60).toFixed(1)} min`} · {result.lossless ? "lossless" : result.mode}</small></div></div>
          {previewable && result.blob.type.startsWith("video/") && <video controls src={result.url} preload="metadata" />}
          {previewable && result.blob.type === "image/gif" && (
            // eslint-disable-next-line @next/next/no-img-element -- blob: preview URL
            <img className="editor-result-preview" src={result.url} alt="GIF preview" />
          )}
          {previewable && result.blob.type.startsWith("audio/") && <audio controls src={result.url} preload="metadata" />}
          <a className="workspace-download" href={result.url} download={result.filename}>Download result <span>↓</span></a>
          <button className="text-button" onClick={() => downloadBlob(result.blob, result.filename)}>Save again</button>
        </div>
        {result.reasons.length > 0 && <ul className="metadata-notes">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        <div className="result-business-cta compact"><div><strong>Need video pipelines at scale?</strong><p>Trenith builds private media processing, transcoding and cloud systems.</p></div><a href={trenithContactUrl} target="_blank" rel="noreferrer">Talk to Trenith ↗</a></div>
      </>}
      <button className="workspace-run" onClick={run} disabled={busy || !file}>{busy ? "Processing…" : result ? "Create again" : slug === "video-to-audio" ? "Extract audio" : slug === "video-to-gif" ? "Create GIF" : slug === "video-trimmer" ? "Cut video" : slug === "video-compressor" ? "Compress video" : "Convert video"}<span>→</span></button>
      <small>Single-threaded WebAssembly: lossless copies and audio extraction are quick; full re-encodes run slower than real time, so long 4K clips are better reduced to 1080p or cut first.</small>
    </aside>
  </div>;
}
