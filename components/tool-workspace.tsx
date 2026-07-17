"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ToolDefinition } from "../lib/catalog";
import {
  convertAudioFileToWav,
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
    <input ref={input} className="sr-only" type="file" accept={accept} multiple={multiple} onChange={(event) => add(event.target.files)} />
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
  if (tool.kind === "byok") return <ByokWorkspace tool={tool} />;
  if (tool.slug === "audio-downloader") return <DownloaderWorkspace />;
  if (["tap-bpm", "bpm-delay-calculator", "note-frequency", "metronome"].includes(tool.slug)) return <MusicUtility slug={tool.slug} />;
  return <FileWorkspace tool={tool} />;
}

function DownloaderWorkspace() {
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<AudioResult[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
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
  return <div className="tool-workspace downloader-workspace"><div className="workspace-panel"><span className="panel-label">PUBLIC SOURCE</span><h2>Paste an authorized URL</h2><p>The scanner finds direct audio links that the source page openly exposes. It does not bypass logins, DRM or platform restrictions.</p><form className="scanner-form" onSubmit={scan}><span>⌕</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required placeholder="https://example.com/page-or-file.mp3" /><button disabled={busy}>{busy ? "Scanning…" : "Find audio"}</button></form><small className="responsibility-note">Only download media you own, have permission to use, or are otherwise authorized to save.</small>{error && <div className="workspace-error">{error}</div>}</div>{results.length > 0 && <div className="result-panel"><div className="result-title"><div><span className="panel-label">RESULTS</span><h2>{title}</h2></div><strong>{results.length} file{results.length === 1 ? "" : "s"}</strong></div>{results.map((file) => <article key={file.url}><span className="result-note">♪</span><div><strong>{file.name}</strong><small>{file.format}</small></div><audio controls preload="none" src={file.url} /><a href={`/api/download?url=${encodeURIComponent(file.url)}`} download={file.name}>Download ↓</a></article>)}</div>}</div>;
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

  const isAudioJoin = tool.slug === "audio-joiner";
  const isAudioConvert = tool.slug === "audio-converter";
  const isVideo = tool.slug === "video-joiner";
  const isImagesToPdf = tool.slug === "jpg-to-pdf";
  const isImage = tool.category === "Image";
  const multiple = isAudioJoin || isVideo || tool.slug === "merge-pdf" || isImagesToPdf;
  const accept = isAudioJoin || isAudioConvert ? "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,.webm" : isVideo ? "video/*,.mp4,.webm,.mov,.m4v,.ogv" : isImagesToPdf || isImage ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" : "application/pdf,.pdf";
  const minimum = isAudioJoin || isVideo || tool.slug === "merge-pdf" ? 2 : 1;
  const totalMb = (files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2);

  const outputLabel = useMemo(() => {
    if (isAudioJoin || isAudioConvert) return "Lossless WAV";
    if (isVideo) return "High-quality WebM";
    if (isImage) return imageFormat.replace("image/", "").toUpperCase().replace("JPEG", "JPG");
    if (tool.slug === "split-pdf") return "ZIP with individual PDFs";
    return "Processed PDF";
  }, [isAudioJoin, isAudioConvert, isVideo, isImage, imageFormat, tool.slug]);

  const update = (value: number, label: string) => { setProgress(value); setProgressLabel(label); };
  async function run() {
    setBusy(true); setError(""); setProgress(1);
    try {
      let blob: Blob; let filename = "trenith-output.pdf";
      if (isAudioJoin) { const output = await joinAudioFiles(files, update); blob = output.blob; filename = output.filename; }
      else if (isAudioConvert) { const output = await convertAudioFileToWav(files[0], update); blob = output.blob; filename = output.filename; }
      else if (isVideo) { const output = await joinVideoFiles(files, update); blob = output.blob; filename = output.filename; }
      else if (tool.slug === "merge-pdf") blob = await mergePdfFiles(files, update);
      else if (tool.slug === "split-pdf") { blob = await splitPdfToZip(files[0], update); filename = "trenith-split-pages.zip"; }
      else if (tool.slug === "organize-pdf") blob = await extractPdfPages(files[0], selection, update);
      else if (tool.slug === "rotate-pdf") blob = await transformPdf(files[0], "rotate", "", update);
      else if (tool.slug === "page-numbers") blob = await transformPdf(files[0], "number", "", update);
      else if (tool.slug === "watermark-pdf") blob = await transformPdf(files[0], "watermark", watermark, update);
      else if (tool.slug === "compress-pdf") blob = await transformPdf(files[0], "compress", "", update);
      else if (isImagesToPdf) blob = await imagesToPdf(files, update);
      else if (isImage) { const output = await processImage(files[0], imageWidth, imageQuality / 100, imageFormat); blob = output.blob; filename = output.filename; update(100, `${output.width} × ${output.height} ready`); }
      else throw new Error("This workflow is not available in the current browser.");
      downloadBlob(blob, filename);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The selected files could not be processed."); }
    finally { setBusy(false); }
  }

  return <div className="tool-workspace file-workspace"><section className="workspace-panel file-input-panel"><span className="panel-label">INPUT</span><h2>{multiple ? "Add files in output order" : "Choose a source file"}</h2><p>Source files remain in this browser tab for device-processed tools.</p><div className={multiple && (isAudioJoin || isVideo) ? "picker-grid" : ""}><FilePicker files={files} setFiles={setFiles} accept={accept} multiple={multiple} title={isImagesToPdf ? "Choose JPG or PNG images" : "Choose files"} />{(isAudioJoin || isVideo) && <FilePicker files={files} setFiles={setFiles} accept={accept} folder multiple title="Choose a complete folder" />}</div>{files.length > 0 && <FileList files={files} setFiles={setFiles} />}</section><aside className="workspace-panel output-panel"><span className="panel-label">OUTPUT</span><h2>{outputLabel}</h2><p>{files.length} file{files.length === 1 ? "" : "s"} · {totalMb} MB selected</p>{tool.slug === "organize-pdf" && <label>Page order or ranges<input value={selection} onChange={(event) => setSelection(event.target.value)} placeholder="1-3,5,8" /></label>}{tool.slug === "watermark-pdf" && <label>Watermark text<input value={watermark} onChange={(event) => setWatermark(event.target.value)} maxLength={48} /></label>}{isImage && <><label>Maximum width<input type="number" min="64" max="10000" value={imageWidth} onChange={(event) => setImageWidth(Number(event.target.value))} /></label><label>Output format<select value={imageFormat} onChange={(event) => setImageFormat(event.target.value as typeof imageFormat)}><option value="image/webp">WebP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label><label>Quality · {imageQuality}%<input type="range" min="25" max="100" value={imageQuality} onChange={(event) => setImageQuality(Number(event.target.value))} disabled={imageFormat === "image/png"} /></label></>}{progress > 0 && <Progress value={progress} label={progressLabel} />}{error && <div className="workspace-error">{error}</div>}<button className="workspace-run" onClick={run} disabled={busy || files.length < minimum}>{busy ? "Processing…" : "Process and download"}<span>→</span></button><small>There is no artificial file-count limit. Browser memory, codec support and device capacity still apply.</small></aside></div>;
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

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); audio.current?.close(); }, []);
  const tapBpm = taps.length > 1 ? Math.round(60_000 / ((taps[taps.length - 1] - taps[Math.max(0, taps.length - 6)]) / Math.min(5, taps.length - 1))) : 0;
  const noteIndexes: Record<string, number> = { C: -9, "C#": -8, D: -7, "D#": -6, E: -5, F: -4, "F#": -3, G: -2, "G#": -1, A: 0, "A#": 1, B: 2 };
  const frequency = a4 * 2 ** ((noteIndexes[note] + (octave - 4) * 12) / 12);
  const timings = [{ label: "Whole", factor: 4 }, { label: "Half", factor: 2 }, { label: "Quarter", factor: 1 }, { label: "Eighth", factor: .5 }, { label: "Sixteenth", factor: .25 }];
  const click = () => { const context = audio.current || new AudioContext(); audio.current = context; const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = beatIndex.current % beats === 0 ? 1150 : 820; gain.gain.setValueAtTime(.14, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .045); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .05); beatIndex.current += 1; };
  const toggleMetronome = () => { if (running) { if (timer.current) clearInterval(timer.current); timer.current = null; setRunning(false); return; } click(); timer.current = window.setInterval(click, 60_000 / bpm); setRunning(true); };

  if (slug === "tap-bpm") return <div className="calculator-workspace"><span className="panel-label">TAP TEMPO</span><div className="tempo-readout"><strong>{tapBpm || "—"}</strong><span>BPM</span></div><button className="tap-button" onClick={() => setTaps([...taps.slice(-5), Date.now()])}>TAP THE BEAT</button><button className="reset-button" onClick={() => setTaps([])}>Reset taps</button><p>Uses the latest five intervals for a responsive tempo estimate.</p></div>;
  if (slug === "bpm-delay-calculator") return <div className="calculator-workspace"><span className="panel-label">TEMPO INPUT</span><label className="large-input">BPM<input type="number" min="20" max="400" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><div className="timing-grid">{timings.map((item) => <article key={item.label}><span>{item.label}</span><strong>{Math.round((60_000 / bpm) * item.factor)} ms</strong><small>Dotted {Math.round((60_000 / bpm) * item.factor * 1.5)} · Triplet {Math.round((60_000 / bpm) * item.factor * 2 / 3)}</small></article>)}</div></div>;
  if (slug === "note-frequency") return <div className="calculator-workspace"><span className="panel-label">EQUAL TEMPERAMENT</span><div className="frequency-controls"><label>Note<select value={note} onChange={(event) => setNote(event.target.value)}>{Object.keys(noteIndexes).map((item) => <option key={item}>{item}</option>)}</select></label><label>Octave<input type="number" min="0" max="9" value={octave} onChange={(event) => setOctave(Number(event.target.value))} /></label><label>A4 reference<input type="number" min="400" max="480" value={a4} onChange={(event) => setA4(Number(event.target.value))} /></label></div><div className="frequency-result"><strong>{frequency.toFixed(3)}</strong><span>Hz</span><p>{note}{octave} with A4 tuned to {a4} Hz</p></div></div>;
  return <div className="calculator-workspace"><span className="panel-label">BROWSER METRONOME</span><div className={running ? "metronome-display running" : "metronome-display"}><i /><strong>{bpm}</strong><span>BPM</span></div><div className="frequency-controls"><label>Tempo<input type="range" min="30" max="240" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /></label><label>Beats per bar<select value={beats} onChange={(event) => setBeats(Number(event.target.value))}>{[2,3,4,5,6,7].map((item) => <option key={item}>{item}</option>)}</select></label></div><button className="workspace-run metronome-button" onClick={toggleMetronome}>{running ? "Stop metronome" : "Start metronome"}</button></div>;
}
