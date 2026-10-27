"use client";

// Shared job runner on top of the private FFmpeg WebAssembly engine. Every
// media tool (converters, trimmer, metadata strip, video join) goes through
// runFfmpeg so input staging, log capture, progress mapping, output collection
// and virtual-filesystem cleanup are handled in exactly one place.

import { assertEngineCapacity, getFfmpeg, isControlledEngineError, resetFfmpeg } from "./ffmpeg-loader.ts";
import { parseFfmpegProbe, type MediaProbe } from "./media-probe.ts";

export type EngineProgress = (percent: number, message: string) => void;

export class MediaJobError extends Error {
  readonly controlled = true;
  readonly log: string;
  constructor(message: string, log = "") {
    super(message);
    this.name = "MediaJobError";
    this.log = log;
  }
}

// `data` may be a function of the staged input names, for list files that must
// reference other staged inputs (the concat demuxer).
export type FfmpegInput = { data: Blob | ((inputNames: string[]) => Blob); name: string };

export type FfmpegJob = {
  inputs: FfmpegInput[];
  // Receives the staged input names (same order as `inputs`) and the output
  // names, and returns the full argument list without the leading binary.
  args: (inputNames: string[], outputNames: string[]) => string[];
  outputs: string[];
  progress?: EngineProgress;
  label?: string;
  // The percent window the engine's own progress ratio is mapped into.
  progressRange?: [number, number];
  // Lets the caller tolerate a non-zero exit (used by the probe, which has no output).
  allowFailure?: boolean;
  timeoutMs?: number;
};

export type FfmpegResult = { outputs: Map<string, Uint8Array>; log: string; exitCode: number };

function token() {
  return crypto.randomUUID().replaceAll("-", "");
}

export function extensionOf(name: string): string {
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : "";
}

export function safeStem(name: string, fallback = "trenith-output") {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || fallback;
}

export async function runFfmpeg(job: FfmpegJob): Promise<FfmpegResult> {
  for (const input of job.inputs) if (input.data instanceof File) assertEngineCapacity(input.data);
  let staged = 0;
  const ffmpeg = await getFfmpeg(job.progress);
  const id = token();
  const inputNames = job.inputs.map((input, index) => `in-${id}-${index}.${extensionOf(input.name) || "bin"}`);
  const outputNames = job.outputs.map((output, index) => `out-${id}-${index}.${extensionOf(output) || "bin"}`);
  const [from, to] = job.progressRange || [10, 95];
  let log = "";
  const onLog = ({ message }: { type: string; message: string }) => { if (log.length < 400_000) log += `${message}\n`; };
  const onProgress = ({ progress }: { progress: number }) => {
    if (!job.progress || !Number.isFinite(progress) || progress < 0) return;
    job.progress(Math.min(to, from + Math.round(Math.min(1, progress) * (to - from))), job.label || "Processing");
  };
  ffmpeg.on("log", onLog);
  ffmpeg.on("progress", onProgress);
  try {
    for (let index = 0; index < job.inputs.length; index += 1) {
      job.progress?.(Math.max(1, from - 4), `Reading ${job.inputs[index].name}`);
      const source = job.inputs[index].data;
      const data = typeof source === "function" ? source(inputNames) : source;
      await ffmpeg.writeFile(inputNames[index], new Uint8Array(await data.arrayBuffer()));
      staged += 1;
    }
    const args = ["-hide_banner", "-nostdin", ...job.args(inputNames, outputNames)];
    const exitCode = await ffmpeg.exec(args, job.timeoutMs);
    const outputs = new Map<string, Uint8Array>();
    if (exitCode !== 0 && !job.allowFailure) throw new MediaJobError(describeFailure(log), log);
    for (let index = 0; index < outputNames.length; index += 1) {
      try {
        const data = await ffmpeg.readFile(outputNames[index]);
        if (typeof data !== "string" && data.byteLength) {
          const copy = new Uint8Array(data.byteLength);
          copy.set(data);
          outputs.set(job.outputs[index], copy);
        }
      } catch { /* a missing output is reported by the caller */ }
    }
    if (!job.allowFailure && outputs.size !== job.outputs.length) throw new MediaJobError("The media engine did not produce the expected output file.", log);
    return { outputs, log, exitCode };
  } catch (error) {
    if (!isControlledEngineError(error)) resetFfmpeg();
    throw error;
  } finally {
    ffmpeg.off("log", onLog);
    ffmpeg.off("progress", onProgress);
    await Promise.allSettled([...inputNames.slice(0, Math.max(staged, 0)), ...outputNames].map((name) => ffmpeg.deleteFile(name)));
  }
}

// Translate FFmpeg's stderr into one honest sentence for the person waiting.
export function describeFailure(log: string): string {
  const tail = log.split("\n").filter(Boolean).slice(-12).join("\n");
  if (/Invalid data found when processing input|moov atom not found|Unknown format|could not find codec parameters/i.test(tail)) return "This file could not be read by the media engine. It may be damaged, DRM-protected or an unsupported container.";
  if (/Unknown encoder|Encoder .* not found/i.test(tail)) return "The requested encoder is not available in the in-browser engine.";
  if (/codec not currently supported in container|Could not find tag for codec/i.test(tail)) return "One of the tracks cannot be stored in the chosen container without re-encoding.";
  if (/memory|allocat|Out of memory/i.test(tail)) return "The browser ran out of memory for this job. Try a shorter clip, a smaller resolution or a desktop browser.";
  if (/does not contain any stream/i.test(tail)) return "No audio or video stream was found in this file.";
  const line = tail.split("\n").find((entry) => /error|invalid|failed/i.test(entry));
  return line ? `The media engine reported: ${line.replace(/^\[[^\]]+\]\s*/, "").slice(0, 160)}` : "The media engine could not complete this job.";
}

const probeCache = new WeakMap<Blob, Promise<MediaProbe>>();

// Container, duration and per-stream description without ffprobe: run the
// decoder setup only and read the summary FFmpeg prints before exiting.
export function probeMedia(file: Blob, name: string, progress?: EngineProgress): Promise<MediaProbe> {
  const cached = probeCache.get(file);
  if (cached) return cached;
  const pending = runFfmpeg({
    inputs: [{ data: file, name }],
    args: (inputs) => ["-i", inputs[0]],
    outputs: [],
    allowFailure: true,
    progress,
    label: `Inspecting ${name}`,
    progressRange: [4, 8],
  }).then((result) => {
    const probe = parseFfmpegProbe(result.log);
    if (!probe.streams.length) throw new MediaJobError(describeFailure(result.log), result.log);
    return probe;
  });
  probeCache.set(file, pending);
  pending.catch(() => probeCache.delete(file));
  return pending;
}

export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes.buffer as ArrayBuffer], { type });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}
