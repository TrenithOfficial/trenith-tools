"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ToolDefinition } from "../lib/catalog";
import { MetadataScrubber } from "./metadata-scrubber";
import { SeoUtility } from "./seo-tools";
import {
  changeAudioVolume,
  downloadBlob,
  extractPdfPages,
  imagesToPdf,
  joinAudioFiles,
  joinVideoFiles,
  mergePdfFiles,
  processImage,
  splitPdfToZip,
  trimAudioFile,
  transformPdf,
} from "../lib/client-tools";
import { audioProfiles, AudioOutputFormat, transcodeAudio } from "../lib/audio-transcode";
import { trenithContactUrl } from "../lib/site";

type AudioResult = { url: string; name: string; format: string };

function Progress({ value, label }: { value: number; label: string }) {
  return <div className="workspace-progress" aria-live="polite"><div><span>{label}</span><strong>{value}%</strong></div><div><i style={{ width: `${value}%` }} /></div></div>;
}

function FilePicker({ files, setFiles, accept, folder = false, multiple = true, title }: { files: File[]; setFiles: (files: File[]) => void; accept: string; folder?: boolean; multiple?: boolean; title: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (folder && input.current) input.current.setAttribute("webkitdirectory", ""); }, [folder]);
  const add = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const next = [...incoming].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFiles(multiple ? [...files, ...next].filter((file, index, all) => all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index) : next.slice(0, 1));
  };
  return <>
    <button type="button" className="file-picker" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); add(event.dataTransfer.files); }}>
      <span>＋</span><strong>{title}</strong><small>Drag and drop or browse</small>
    </button>
    <input ref={input} className="sr-only" type="file" accept={accept} multiple={multiple} onChange={(event) => { add(event.target.files); event.currentTarget.value = ""; }} />
  </>;
}

function FileList({ files, setFiles }: { files: File[]; setFiles: (files: File[]) => void }) {
  const move = (index: number, change: number) => {
    const target = index + change;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    setFiles(next);
  };
  return <div className="workspace-file-list">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div><div><button onClick={() => move(index, -1)} disabled={!index} aria-label={`Move ${file.name} up`}>↑</button><button onClick={() => move(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`}>↓</button><button onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>×</button></div></div>)}</div>;
}

export function ToolWorkspace({ tool }: { tool: ToolDefinition }) {
  if (tool.slug === "metadata-remover") return <MetadataScrubber />;
  if (tool.kind === "byok") return <ByokWorkspace tool={tool} />;
  if (tool.slug === "audio-downloader") return <DownloaderWorkspace />;
  if (["tap-bpm", "bpm-delay-calculator", "note-frequency", "metronome"].includes(tool.slug)) return <MusicUtility slug={tool.slug} />;
  if (tool.category === "SEO") return <SeoUtility slug={tool.slug} />;
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

function FileWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState("1-3,5");
  const [watermark, setWatermark] = useState("TRENITH");
  const [imageWidth, setImageWidth] = useState(1920);
  const [imageQuality, setImageQuality] = useState(82);
  const [imageFormat, setImageFormat] = useState<"image/jpeg" | "image/png" | "image/webp">("image/webp");
  const [skipUnreadable, setSkipUnreadable] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [audioFormat, setAudioFormat] = useState<AudioOutputFormat>("mp3");
  const [audioBitrate, setAudioBitrate] = useState(192);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [result, setResult] = useState<{ url: string; filename: string; blob: Blob } | null>(null);
  const [savedToDisk, setSavedToDisk] = useState("");

  const isAudioJoin = tool.slug === "audio-joiner";
  const isAudioConvert = tool.slug === "audio-converter";
  const isAudioTrim = tool.slug === "audio-trimmer";
  const isAudioVolume = tool.slug === "audio-volume-changer";
  const isAudioFileTool = isAudioJoin || isAudioConvert || isAudioTrim || isAudioVolume;
  const isVideo = tool.slug === "video-joiner";
  const isImagesToPdf = tool.slug === "jpg-to-pdf";
  const isImage = tool.category === "Image";
  const multiple = isAudioJoin || isVideo || tool.slug === "merge-pdf" || isImagesToPdf;
  const accept = isAudioFileTool ? "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.webm,.aiff,.aif" : isVideo ? "video/*,.mp4,.webm,.mov,.m4v,.ogv" : isImagesToPdf || isImage ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" : "application/pdf,.pdf";
  const minimum = isAudioJoin || isVideo || tool.slug === "merge-pdf" ? 2 : 1;
  const totalMb = (files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2);

  const outputLabel = useMemo(() => {
    if (isAudioJoin) return "Streaming WAV / RF64";
    if (isAudioConvert) return audioProfiles[audioFormat].label;
    if (isAudioTrim || isAudioVolume) return "Lossless WAV";
    if (isVideo) return "High-quality WebM";
    if (isImage) return imageFormat.replace("image/", "").toUpperCase().replace("JPEG", "JPG");
    if (tool.slug === "split-pdf") return "ZIP with individual PDFs";
    return "Processed PDF";
  }, [isAudioJoin, isAudioConvert, isAudioTrim, isAudioVolume, isVideo, isImage, imageFormat, audioFormat, tool.slug]);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  useEffect(() => {
    if (!isAudioTrim || !files[0]) return;
    const url = URL.createObjectURL(files[0]);
    const audio = document.createElement("audio");
    const loaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setSourceDuration(audio.duration);
        setTrimStart(0);
        setTrimEnd(Number(audio.duration.toFixed(2)));
      }
    };
    audio.addEventListener("loadedmetadata", loaded);
    audio.src = url;
    return () => { audio.removeEventListener("loadedmetadata", loaded); audio.src = ""; URL.revokeObjectURL(url); };
  }, [files, isAudioTrim]);

  const update = (value: number, label: string) => { setProgress(value); setProgressLabel(label); };
  async function run() {
    setBusy(true); setError(""); setWarnings([]); setProgress(1); setSavedToDisk("");
    if (result) { URL.revokeObjectURL(result.url); setResult(null); }
    try {
      let blob: Blob; let filename = "trenith-output.pdf";
      if (isAudioJoin) { const output = await joinAudioFiles(files, update, { skipUnreadable }); setWarnings(output.warnings); if (output.savedToDisk) { setSavedToDisk(`${output.filename} was saved to the destination you chose.`); return; } if (!output.blob) throw new Error("The browser did not return an audio output."); blob = output.blob; filename = output.filename; }
      else if (isAudioConvert) { const output = await transcodeAudio(files[0], audioFormat, audioBitrate, update); blob = output.blob; filename = output.filename; }
      else if (isAudioTrim) { const output = await trimAudioFile(files[0], trimStart, trimEnd, update); blob = output.blob; filename = output.filename; setSourceDuration(output.duration); }
      else if (isAudioVolume) { const output = await changeAudioVolume(files[0], volume, update); blob = output.blob; filename = output.filename; }
      else if (isVideo) { const output = await joinVideoFiles(files, update); blob = output.blob; filename = output.filename; }
      else if (tool.slug === "merge-pdf") { blob = await mergePdfFiles(files, update); filename = "trenith-merged.pdf"; }
      else if (tool.slug === "split-pdf") { blob = await splitPdfToZip(files[0], update); filename = "trenith-split-pages.zip"; }
      else if (tool.slug === "organize-pdf") { blob = await extractPdfPages(files[0], selection, update); filename = "trenith-organized.pdf"; }
      else if (tool.slug === "rotate-pdf") { blob = await transformPdf(files[0], "rotate", "", update); filename = "trenith-rotated.pdf"; }
      else if (tool.slug === "page-numbers") { blob = await transformPdf(files[0], "number", "", update); filename = "trenith-numbered.pdf"; }
      else if (tool.slug === "watermark-pdf") { blob = await transformPdf(files[0], "watermark", watermark, update); filename = "trenith-watermarked.pdf"; }
      else if (tool.slug === "compress-pdf") { blob = await transformPdf(files[0], "compress", "", update); filename = "trenith-optimized.pdf"; }
      else if (isImagesToPdf) { blob = await imagesToPdf(files, update); filename = "trenith-images.pdf"; }
      else if (isImage) { const output = await processImage(files[0], tool.slug === "image-converter" ? 100_000 : imageWidth, imageQuality / 100, imageFormat); blob = output.blob; filename = output.filename; update(100, `${output.width} × ${output.height} ready`); }
      else throw new Error("This workflow is not available in the current browser.");
      setResult({ blob, filename, url: URL.createObjectURL(blob) });
    } catch (caught) {
      setProgress(0);
      setProgressLabel("");
      setError(caught instanceof Error ? caught.message : typeof caught === "string" && caught ? caught : "The selected files could not be processed.");
    }
    finally { setBusy(false); }
  }

  return <div className="tool-workspace file-workspace"><section className="workspace-panel file-input-panel"><div className="panel-heading-row"><div><span className="panel-label">INPUT</span><h2>{multiple ? "Add files in output order" : "Choose a source file"}</h2></div>{files.length > 0 && <button className="text-button" onClick={() => setFiles([])}>Clear queue</button>}</div><p>Source files remain in this browser tab for device-processed tools.</p><div className={multiple && (isAudioJoin || isVideo) ? "picker-grid" : ""}><FilePicker files={files} setFiles={setFiles} accept={accept} multiple={multiple} title={isImagesToPdf ? "Choose JPG or PNG images" : "Choose files"} />{(isAudioJoin || isVideo) && <FilePicker files={files} setFiles={setFiles} accept={accept} folder multiple title="Choose a complete folder" />}</div>{files.length > 0 && <FileList files={files} setFiles={setFiles} />}</section><aside className="workspace-panel output-panel"><span className="panel-label">OUTPUT</span><h2>{outputLabel}</h2><p>{files.length} file{files.length === 1 ? "" : "s"} · {totalMb} MB selected</p>{tool.slug === "organize-pdf" && <label>Page order or ranges<input value={selection} onChange={(event) => setSelection(event.target.value)} placeholder="1-3,5,8 or 8-5" /></label>}{tool.slug === "watermark-pdf" && <label>Watermark text<input value={watermark} onChange={(event) => setWatermark(event.target.value)} maxLength={48} /></label>}{isAudioConvert && <><label>Output format<select value={audioFormat} onChange={(event) => setAudioFormat(event.target.value as AudioOutputFormat)}>{Object.values(audioProfiles).map((profile) => <option value={profile.extension} key={profile.extension}>{profile.label}{profile.lossless ? " · lossless" : ""}</option>)}</select></label>{!audioProfiles[audioFormat].lossless && <label>Target bitrate · {audioBitrate} kbps<input type="range" min="64" max="320" step="32" value={audioBitrate} onChange={(event) => setAudioBitrate(Number(event.target.value))} /></label>}<div className="large-job-note"><strong>Broad codec mode</strong><p>The private media engine loads about 31 MB on first use, then converts MP3, WAV, FLAC, Ogg, Opus, M4A/AAC, WebM audio and other readable formats without uploading the source.</p></div></>}{isAudioTrim && <div className="time-grid"><label>Start (seconds)<input type="number" min="0" max={sourceDuration || undefined} step="0.01" value={trimStart} onChange={(event) => setTrimStart(Number(event.target.value))} /></label><label>End (seconds)<input type="number" min="0.01" max={sourceDuration || undefined} step="0.01" value={trimEnd} onChange={(event) => setTrimEnd(Number(event.target.value))} /></label>{sourceDuration > 0 && <small>Detected duration: {sourceDuration.toFixed(2)} seconds</small>}</div>}{isAudioVolume && <label>Output volume · {volume}%<input type="range" min="0" max="400" step="5" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>}{isAudioJoin && <label className="check-label"><input type="checkbox" checked={skipUnreadable} onChange={(event) => setSkipUnreadable(event.target.checked)} /><span>Skip files unreadable by both decoders</span></label>}{isAudioJoin && <div className="large-job-note"><strong>Large-folder mode</strong><p>Jobs over 60 files or 120 MB stream directly to disk in Chrome/Edge. A compatibility decoder is now tried automatically when the browser rejects a track.</p></div>}{isImage && <>{tool.slug !== "image-converter" && <label>Maximum width<input type="number" min="64" max="10000" value={imageWidth} onChange={(event) => setImageWidth(Number(event.target.value))} /></label>}<label>Output format<select value={imageFormat} onChange={(event) => setImageFormat(event.target.value as typeof imageFormat)}><option value="image/webp">WebP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label><label>Quality · {imageQuality}%<input type="range" min="25" max="100" value={imageQuality} onChange={(event) => setImageQuality(Number(event.target.value))} disabled={imageFormat === "image/png"} /></label></>}{progress > 0 && <Progress value={progress} label={progressLabel} />}{error && <div className="workspace-error" role="alert">{error}</div>}{warnings.length > 0 && <div className="workspace-warning"><strong>{warnings.length} file{warnings.length === 1 ? "" : "s"} skipped</strong><span>{warnings.slice(0, 3).join(" ")}</span></div>}{savedToDisk && <div className="workspace-success"><strong>Saved successfully</strong><span>{savedToDisk}</span></div>}{result && <><div className="output-ready"><div><span>✓</span><div><strong>{result.filename}</strong><small>{(result.blob.size / 1024 / 1024).toFixed(2)} MB ready</small></div></div>{result.blob.type.startsWith("audio/") && <audio controls src={result.url} preload="metadata" />}<a className="workspace-download" href={result.url} download={result.filename}>Download result <span>↓</span></a></div><div className="result-business-cta compact"><div><strong>Need this workflow at scale?</strong><p>Trenith builds private file pipelines, automation and cloud systems.</p></div><a href={trenithContactUrl} target="_blank" rel="noreferrer">Talk to Trenith ↗</a></div></>}<button className="workspace-run" onClick={run} disabled={busy || files.length < minimum}>{busy ? "Processing…" : isAudioJoin && (files.length > 60 || Number(totalMb) > 120) ? "Choose destination and stream" : result ? "Create again" : "Create output"}<span>→</span></button><small>There is no artificial file-count limit. Browser memory, codec support, free storage and individual file health still define practical capacity.</small></aside></div>;
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

  useEffect(() => () => { audio.current?.close(); }, []);
  useEffect(() => {
    if (!running) return;
    const playClick = () => {
      const context = audio.current || new AudioContext();
      audio.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = beatIndex.current % beats === 0 ? 1150 : 820;
      gain.gain.setValueAtTime(.14, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .045);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + .05);
      beatIndex.current += 1;
    };
    playClick();
    timer.current = window.setInterval(playClick, 60_000 / Math.max(30, bpm));
    return () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; };
  }, [running, bpm, beats]);
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
  if (slug === "bpm-delay-calculator") return <div className="calculator-workspace"><span className="panel-label">TEMPO INPUT</span><label className="large-input">BPM<input type="number" min="20" max="400" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><div className="timing-grid">{timings.map((item) => <article key={item.label}><span>{item.label}</span><strong>{Math.round((60_000 / bpm) * item.factor)} ms</strong><small>Dotted {Math.round((60_000 / bpm) * item.factor * 1.5)} · Triplet {Math.round((60_000 / bpm) * item.factor * 2 / 3)}</small></article>)}</div></div>;
  if (slug === "note-frequency") return <div className="calculator-workspace"><span className="panel-label">EQUAL TEMPERAMENT</span><div className="frequency-controls"><label>Note<select value={note} onChange={(event) => setNote(event.target.value)}>{Object.keys(noteIndexes).map((item) => <option key={item}>{item}</option>)}</select></label><label>Octave<input type="number" min="0" max="9" value={octave} onChange={(event) => setOctave(Number(event.target.value))} /></label><label>A4 reference<input type="number" min="400" max="480" value={a4} onChange={(event) => setA4(Number(event.target.value))} /></label></div><div className="frequency-result"><strong>{frequency.toFixed(3)}</strong><span>Hz</span><p>{note}{octave} with A4 tuned to {a4} Hz</p></div></div>;
  return <div className="calculator-workspace"><span className="panel-label">BROWSER METRONOME</span><div className={running ? "metronome-display running" : "metronome-display"}><i /><strong>{bpm}</strong><span>BPM</span></div><div className="frequency-controls"><label>Tempo<input type="range" min="30" max="240" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><label>Beats per bar<select value={beats} onChange={(event) => setBeats(Number(event.target.value))}>{[2,3,4,5,6,7].map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="workspace-run metronome-button" onClick={toggleMetronome}>{running ? "Stop metronome" : "Start metronome"}</button></div>;
}
