"use client";

// Video and audio conversion on the private FFmpeg engine. The argument
// builders are pure (unit-tested in Node); the runners stage files through
// runFfmpeg. Quality rules: never re-encode when a lossless remux already
// satisfies the request, never upscale, and label every output by what the
// engine actually produced.

import { bytesToBlob, probeMedia, runFfmpeg, safeStem, type EngineProgress } from "./media-engine.ts";
import { planRemux, primaryAudio, primaryVideo, type MediaProbe } from "./media-probe.ts";

export type VideoContainer = "mp4" | "webm" | "mkv" | "mov" | "gif";
export type VideoSpeed = "fast" | "balanced" | "best";
export type VideoQuality = "high" | "balanced" | "small";
export type HeightCap = 0 | 2160 | 1440 | 1080 | 720 | 480 | 360;
export type FpsCap = 0 | 60 | 30 | 24 | 15;
export type Rotation = 0 | 90 | 180 | 270;

export type VideoOptions = {
  container: VideoContainer;
  quality: VideoQuality;
  speed: VideoSpeed;
  maxHeight: HeightCap;
  maxFps: FpsCap;
  rotate: Rotation;
  mute: boolean;
  // Force a re-encode even when a lossless remux is possible (e.g. to shrink).
  forceEncode: boolean;
  // Target size in megabytes for the compressor; 0 keeps CRF mode.
  targetMb: number;
  trimStart?: number;
  trimEnd?: number;
  gifFps?: 10 | 12 | 15 | 20;
  gifWidth?: 320 | 480 | 640 | 800;
};

export const defaultVideoOptions: VideoOptions = { container: "mp4", quality: "balanced", speed: "balanced", maxHeight: 0, maxFps: 0, rotate: 0, mute: false, forceEncode: false, targetMb: 0, gifFps: 12, gifWidth: 480 };

export const videoContainers: Array<{ value: VideoContainer; label: string; mime: string; video: string; audio: string; note: string }> = [
  { value: "mp4", label: "MP4 (H.264 + AAC)", mime: "video/mp4", video: "libx264", audio: "aac", note: "Plays everywhere: phones, TVs, editors and the web." },
  { value: "webm", label: "WebM (VP8 + Opus)", mime: "video/webm", video: "libvpx", audio: "libopus", note: "Open web format that every browser plays; encodes quickly on-device." },
  { value: "mkv", label: "MKV (keeps any codec)", mime: "video/x-matroska", video: "libx264", audio: "aac", note: "Stores almost any stream unchanged, ideal for lossless container swaps." },
  { value: "mov", label: "MOV (H.264 + AAC)", mime: "video/quicktime", video: "libx264", audio: "aac", note: "QuickTime container for Apple apps and Final Cut." },
  { value: "gif", label: "GIF (animated)", mime: "image/gif", video: "gif", audio: "", note: "Palette-optimized animation, no audio." },
];

const x264Preset: Record<VideoSpeed, string> = { fast: "ultrafast", balanced: "veryfast", best: "medium" };
const x264Crf: Record<VideoQuality, number> = { high: 18, balanced: 23, small: 28 };
// libvpx-vp9 traps inside the single-threaded WebAssembly build, so WebM uses
// VP8 in constrained-quality mode: a quality floor via -crf plus a bitrate
// ceiling scaled from the source height.
const vp8Crf: Record<VideoQuality, number> = { high: 6, balanced: 12, small: 22 };
const vp8Speed: Record<VideoSpeed, number> = { fast: 5, balanced: 3, best: 1 };
export function vp8BitrateKbps(height: number, quality: VideoQuality): number {
  const pixels = Math.max(240, height || 720);
  const base = pixels >= 2160 ? 16000 : pixels >= 1440 ? 9000 : pixels >= 1080 ? 6000 : pixels >= 720 ? 3200 : pixels >= 480 ? 1600 : 900;
  return Math.round(base * (quality === "high" ? 1 : quality === "balanced" ? 0.6 : 0.35));
}
const audioBitrate: Record<VideoQuality, number> = { high: 192, balanced: 128, small: 96 };

export function videoFilters(options: VideoOptions, source?: { width?: number; height?: number }): string[] {
  const filters: string[] = [];
  if (options.rotate === 90) filters.push("transpose=1");
  if (options.rotate === 270) filters.push("transpose=2");
  if (options.rotate === 180) filters.push("transpose=1,transpose=1");
  // Never upscale: the cap only applies when the source is taller. The height
  // after rotation is what matters for a portrait result.
  const sourceHeight = options.rotate === 90 || options.rotate === 270 ? source?.width : source?.height;
  if (options.maxHeight && (!sourceHeight || sourceHeight > options.maxHeight)) filters.push(`scale=-2:'min(ih,${options.maxHeight})'`);
  if (options.maxFps) filters.push(`fps=fps='min(source_fps,${options.maxFps})'`);
  return filters;
}

export type VideoPlan = { mode: "remux" | "encode" | "gif"; reasons: string[]; args: string[]; outputName: string; mime: string; label: string };

// Build the complete FFmpeg command for one conversion. `probe` may be null
// when the file could not be inspected; the plan then always re-encodes.
export function planVideoConversion(file: { name: string }, probe: MediaProbe | null, options: VideoOptions, input: string, output: string): VideoPlan {
  const container = videoContainers.find((entry) => entry.value === options.container) || videoContainers[0];
  const video = probe ? primaryVideo(probe) : undefined;
  const audio = probe ? primaryAudio(probe) : undefined;
  // Input-side seeking is fast and, when re-encoding, frame-accurate (the
  // decoded lead-in is discarded). `-t` is used instead of `-to` because after
  // an input seek FFmpeg measures output time from the seek point.
  const start = Math.max(0, options.trimStart || 0);
  const trim = start > 0 ? ["-ss", start.toFixed(3)] : [];
  const span = options.trimEnd && options.trimEnd > start ? ["-t", (options.trimEnd - start).toFixed(3)] : [];
  const base = ["-i", input, ...span, "-map_metadata", "-1", "-map_chapters", "-1"];

  if (options.container === "gif") {
    const fps = options.gifFps || 12;
    const width = options.gifWidth || 480;
    const rotation = videoFilters({ ...options, maxHeight: 0, maxFps: 0 }, video);
    const chain = [...rotation, `fps=${fps}`, `scale='min(iw,${width})':-1:flags=lanczos`, "split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"].join(",");
    return { mode: "gif", reasons: ["Two-pass palette for accurate colours"], args: [...trim, ...base, "-an", "-filter_complex", chain, "-loop", "0", output], outputName: `${safeStem(file.name)}.gif`, mime: "image/gif", label: "Rendering GIF" };
  }

  const filters = videoFilters(options, video);
  const needsEncode = options.forceEncode || options.targetMb > 0 || filters.length > 0 || !probe;
  const remux = probe && !needsEncode ? planRemux(probe, options.container, true) : { remux: false, reasons: [] as string[] };
  // Trimming a stream copy cuts at keyframes; honest but not frame-exact. A
  // remux with a trim is still lossless, so keep it unless an edit forces an encode.
  if (remux.remux) {
    const args = [...trim, ...base, "-map", "0:v:0", ...(options.mute || !audio ? ["-an"] : ["-map", "0:a:0"]), "-c", "copy", "-sn", "-dn", "-ignore_unknown"];
    if (trim.length || span.length) args.push("-avoid_negative_ts", "make_zero");
    if (options.container === "mp4" || options.container === "mov") args.push("-movflags", "+faststart");
    args.push(output);
    return { mode: "remux", reasons: ["Codecs already fit the container — streams copied without re-encoding"], args, outputName: `${safeStem(file.name)}.${options.container}`, mime: container.mime, label: "Copying streams losslessly" };
  }

  const reasons = [...remux.reasons];
  if (filters.length) reasons.push("Resize, frame-rate or rotation requires re-encoding");
  if (options.targetMb > 0) reasons.push("Target size requires a bitrate-controlled encode");
  if (options.forceEncode && !reasons.length) reasons.push("Re-encode requested");
  const args = [...trim, ...base, "-map", "0:v:0", ...(options.mute || !audio ? ["-an"] : ["-map", "0:a:0"]), "-sn", "-dn"];
  if (filters.length) args.push("-vf", filters.join(","));
  if (options.container === "webm") {
    const sourceHeight = options.rotate === 90 || options.rotate === 270 ? video?.width : video?.height;
    const height = options.maxHeight && sourceHeight && sourceHeight > options.maxHeight ? options.maxHeight : sourceHeight || 720;
    args.push("-c:v", "libvpx", "-crf", String(vp8Crf[options.quality]), "-b:v", `${vp8BitrateKbps(height, options.quality)}k`, "-deadline", options.speed === "fast" ? "realtime" : "good", "-cpu-used", String(vp8Speed[options.speed]), "-auto-alt-ref", "0", "-pix_fmt", "yuv420p");
    if (!options.mute && audio) args.push("-c:a", "libopus", "-b:a", `${audioBitrate[options.quality]}k`);
  } else {
    args.push("-c:v", "libx264", "-preset", x264Preset[options.speed], "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1");
    if (options.targetMb > 0 && probe?.durationSeconds) {
      const audioKbps = options.mute || !audio ? 0 : audioBitrate[options.quality];
      const totalKbps = Math.max(150, Math.floor((options.targetMb * 8 * 1024 * 0.97) / probe.durationSeconds) - audioKbps);
      args.push("-b:v", `${totalKbps}k`, "-maxrate", `${Math.round(totalKbps * 1.4)}k`, "-bufsize", `${totalKbps * 2}k`);
    } else {
      args.push("-crf", String(x264Crf[options.quality]));
    }
    if (!options.mute && audio) args.push("-c:a", "aac", "-b:a", `${audioBitrate[options.quality]}k`, "-ar", "48000");
    if (options.container === "mp4" || options.container === "mov") args.push("-movflags", "+faststart");
  }
  args.push(output);
  return { mode: "encode", reasons, args, outputName: `${safeStem(file.name)}.${options.container}`, mime: container.mime, label: `Encoding ${container.label.split(" ")[0]}` };
}

export type ConversionResult = { blob: Blob; filename: string; mode: VideoPlan["mode"]; reasons: string[]; probe: MediaProbe | null; seconds: number };

export async function convertVideo(file: File, options: VideoOptions, progress: EngineProgress): Promise<ConversionResult> {
  const started = performance.now();
  let probe: MediaProbe | null = null;
  try { probe = await probeMedia(file, file.name, progress); } catch (error) {
    // No streams at all is a hard failure; a parse failure still gets a blind encode.
    if (error instanceof Error && /No audio or video stream|could not be read/.test(error.message)) throw error;
  }
  if (probe && !primaryVideo(probe)) throw new Error("No video stream was found in this file. Use the audio converter for audio-only files.");
  const plan = planVideoConversion(file, probe, options, "INPUT", "OUTPUT");
  progress(9, plan.mode === "remux" ? "Copying streams losslessly" : plan.label);
  const result = await runFfmpeg({
    inputs: [{ data: file, name: file.name }],
    outputs: [plan.outputName],
    args: (inputs, outputs) => plan.args.map((arg) => arg === "INPUT" ? inputs[0] : arg === "OUTPUT" ? outputs[0] : arg),
    progress,
    label: plan.label,
    progressRange: [10, 97],
  });
  const bytes = result.outputs.get(plan.outputName)!;
  progress(100, plan.mode === "remux" ? "Lossless copy complete" : `${plan.label.replace(/^Encoding |^Rendering /, "")} complete`);
  return { blob: bytesToBlob(bytes, plan.mime), filename: plan.outputName, mode: plan.mode, reasons: plan.reasons, probe, seconds: (performance.now() - started) / 1000 };
}

// --- Audio extraction from video ------------------------------------------------

export type ExtractTarget = "mp3" | "m4a" | "wav" | "flac" | "opus" | "ogg";
const extractMime: Record<ExtractTarget, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", flac: "audio/flac", opus: "audio/ogg", ogg: "audio/ogg" };
// Source codec → container pairs where the audio can be copied bit-for-bit.
const extractCopy: Record<ExtractTarget, string[]> = { mp3: ["mp3"], m4a: ["aac", "alac"], wav: ["pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"], flac: ["flac"], opus: ["opus"], ogg: ["vorbis", "opus", "flac"] };

export function planAudioExtract(probe: MediaProbe | null, target: ExtractTarget, bitrate: number, input: string, output: string): { args: string[]; lossless: boolean } {
  const audio = probe ? primaryAudio(probe) : undefined;
  const args = ["-i", input, "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1"];
  if (audio && extractCopy[target].includes(audio.codec)) {
    args.push("-c:a", "copy");
    if (target === "m4a") args.push("-movflags", "+faststart");
    args.push(output);
    return { args, lossless: true };
  }
  const kbps = Math.max(64, Math.min(320, bitrate));
  const encoders: Record<ExtractTarget, string[]> = {
    mp3: ["-c:a", "libmp3lame", "-b:a", `${kbps}k`],
    m4a: ["-c:a", "aac", "-b:a", `${kbps}k`, "-movflags", "+faststart"],
    wav: ["-c:a", "pcm_s16le"],
    flac: ["-c:a", "flac", "-compression_level", "5"],
    opus: ["-c:a", "libopus", "-b:a", `${Math.min(256, kbps)}k`, "-vbr", "on"],
    ogg: ["-c:a", "libvorbis", "-b:a", `${kbps}k`],
  };
  args.push(...encoders[target], output);
  return { args, lossless: target === "wav" || target === "flac" };
}

export async function extractAudio(file: File, target: ExtractTarget, bitrate: number, progress: EngineProgress): Promise<{ blob: Blob; filename: string; lossless: boolean }> {
  let probe: MediaProbe | null = null;
  try { probe = await probeMedia(file, file.name, progress); } catch { /* blind extract */ }
  if (probe && !primaryAudio(probe)) throw new Error("This video has no audio track to extract.");
  const plan = planAudioExtract(probe, target, bitrate, "INPUT", "OUTPUT");
  const outputName = `${safeStem(file.name)}.${target}`;
  const result = await runFfmpeg({
    inputs: [{ data: file, name: file.name }],
    outputs: [outputName],
    args: (inputs, outputs) => plan.args.map((arg) => arg === "INPUT" ? inputs[0] : arg === "OUTPUT" ? outputs[0] : arg),
    progress,
    label: plan.lossless ? "Extracting audio without re-encoding" : `Encoding ${target.toUpperCase()}`,
  });
  progress(100, plan.lossless ? "Audio extracted losslessly" : `${target.toUpperCase()} ready`);
  return { blob: bytesToBlob(result.outputs.get(outputName)!, extractMime[target]), filename: outputName, lossless: plan.lossless };
}

// --- Lossless video concatenation -------------------------------------------------

export async function concatVideosLosslessly(files: File[], progress: EngineProgress): Promise<{ blob: Blob; filename: string }> {
  const first = files[0];
  const extension = (first.name.match(/\.([a-z0-9]+)$/i)?.[1] || "mp4").toLowerCase();
  const outputName = `${safeStem(first.name)}-joined.${extension}`;
  // The concat demuxer reads the clip list from the virtual filesystem, so the
  // list is generated from the staged input names once they are known.
  const result = await runFfmpeg({
    inputs: [...files.map((file) => ({ data: file, name: file.name })), { data: (names: string[]) => new Blob([names.slice(0, files.length).map((name) => `file '${name}'`).join("\n")], { type: "text/plain" }), name: "list.txt" }],
    outputs: [outputName],
    args: (inputs, outputs) => ["-f", "concat", "-safe", "0", "-i", "LIST", "-map", "0", "-c", "copy", "-map_metadata", "-1", ...(extension === "mp4" || extension === "mov" || extension === "m4v" ? ["-movflags", "+faststart"] : []), outputs[0]].map((arg) => arg === "LIST" ? inputs[inputs.length - 1] : arg),
    progress,
    label: "Joining clips without re-encoding",
    progressRange: [8, 96],
  });
  return { blob: bytesToBlob(result.outputs.get(outputName)!, extension === "webm" ? "video/webm" : extension === "mkv" ? "video/x-matroska" : "video/mp4"), filename: outputName };
}

export function estimateEncodeMinutes(durationSeconds: number, height: number, container: VideoContainer, speed: VideoSpeed): number {
  // Measured single-thread WebAssembly throughput ranges, in encoded seconds per
  // wall-clock second, for a mid-range laptop. Rough by design: shown as "about".
  const pixels = Math.max(1, height || 720);
  const base = container === "webm" ? (speed === "fast" ? 1.6 : 0.8) : speed === "fast" ? 1.4 : speed === "balanced" ? 0.9 : 0.35;
  const scale = (720 / pixels) ** 1.6;
  return Math.max(0.1, durationSeconds / (base * scale) / 60);
}
