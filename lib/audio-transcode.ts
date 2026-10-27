"use client";

import { assertEngineCapacity, getFfmpeg, isControlledEngineError, resetFfmpeg, MAX_ENGINE_INPUT_BYTES } from "./ffmpeg-loader.ts";
import { bytesToBlob, probeMedia, runFfmpeg, safeStem, type EngineProgress } from "./media-engine.ts";
import type { MediaProbe } from "./media-probe.ts";

export { assertEngineCapacity, getFfmpeg, isControlledEngineError, resetFfmpeg, MAX_ENGINE_INPUT_BYTES };

export type AudioOutputFormat = "mp3" | "wav" | "flac" | "ogg" | "opus" | "m4a" | "aiff" | "alac" | "ac3" | "wma" | "wv" | "webm";

export type AudioOptions = {
  // 0 keeps the source value. Resampling or remixing only happens on request.
  sampleRate: 0 | 22050 | 44100 | 48000 | 96000;
  channels: 0 | 1 | 2;
  // Bit depth for PCM/lossless targets (WAV, AIFF, FLAC, WavPack, ALAC).
  bitDepth: 16 | 24 | 32;
  // Keep title/artist/album tags and cover art instead of stripping them.
  keepTags: boolean;
};

export const defaultAudioOptions: AudioOptions = { sampleRate: 0, channels: 0, bitDepth: 16, keepTags: true };

export type AudioProfile = {
  extension: string;
  key: AudioOutputFormat;
  label: string;
  mime: string;
  lossless: boolean;
  // Containers that can carry an attached cover-art picture.
  coverArt: boolean;
  args: (bitrate: number, options: AudioOptions) => string[];
};

function pcmCodec(prefix: "pcm_s" | "pcm_f", bitDepth: number, endian: "le" | "be") {
  if (bitDepth >= 32) return `pcm_f32${endian}`;
  return `${prefix}${bitDepth === 24 ? 24 : 16}${endian}`;
}

export const audioProfiles: Record<AudioOutputFormat, AudioProfile> = {
  mp3: { key: "mp3", extension: "mp3", label: "MP3", mime: "audio/mpeg", lossless: false, coverArt: true, args: (bitrate) => ["-c:a", "libmp3lame", "-b:a", `${bitrate}k`, "-id3v2_version", "3"] },
  m4a: { key: "m4a", extension: "m4a", label: "M4A / AAC", mime: "audio/mp4", lossless: false, coverArt: true, args: (bitrate) => ["-c:a", "aac", "-b:a", `${bitrate}k`, "-movflags", "+faststart"] },
  opus: { key: "opus", extension: "opus", label: "Opus", mime: "audio/ogg", lossless: false, coverArt: false, args: (bitrate) => ["-c:a", "libopus", "-b:a", `${Math.min(256, bitrate)}k`, "-vbr", "on"] },
  ogg: { key: "ogg", extension: "ogg", label: "Ogg Vorbis", mime: "audio/ogg", lossless: false, coverArt: false, args: (bitrate) => ["-c:a", "libvorbis", "-b:a", `${bitrate}k`] },
  wav: { key: "wav", extension: "wav", label: "WAV", mime: "audio/wav", lossless: true, coverArt: false, args: (_, options) => ["-c:a", pcmCodec("pcm_s", options.bitDepth, "le")] },
  flac: { key: "flac", extension: "flac", label: "FLAC", mime: "audio/flac", lossless: true, coverArt: true, args: (_, options) => ["-c:a", "flac", "-compression_level", "8", "-sample_fmt", options.bitDepth >= 24 ? "s32" : "s16"] },
  alac: { key: "alac", extension: "m4a", label: "ALAC (Apple Lossless)", mime: "audio/mp4", lossless: true, coverArt: true, args: (_, options) => ["-c:a", "alac", "-sample_fmt", options.bitDepth >= 24 ? "s32p" : "s16p", "-movflags", "+faststart"] },
  aiff: { key: "aiff", extension: "aiff", label: "AIFF", mime: "audio/aiff", lossless: true, coverArt: false, args: (_, options) => ["-c:a", pcmCodec("pcm_s", Math.min(24, options.bitDepth), "be")] },
  wv: { key: "wv", extension: "wv", label: "WavPack", mime: "audio/x-wavpack", lossless: true, coverArt: false, args: (_, options) => ["-c:a", "wavpack", "-sample_fmt", options.bitDepth >= 24 ? "s32p" : "s16p"] },
  ac3: { key: "ac3", extension: "ac3", label: "AC3 (Dolby Digital)", mime: "audio/ac3", lossless: false, coverArt: false, args: (bitrate) => ["-c:a", "ac3", "-b:a", `${Math.min(640, Math.max(96, bitrate))}k`] },
  wma: { key: "wma", extension: "wma", label: "WMA", mime: "audio/x-ms-wma", lossless: false, coverArt: false, args: (bitrate) => ["-c:a", "wmav2", "-b:a", `${Math.min(192, bitrate)}k`] },
  webm: { key: "webm", extension: "webm", label: "WebM (Opus)", mime: "audio/webm", lossless: false, coverArt: false, args: (bitrate) => ["-c:a", "libopus", "-b:a", `${Math.min(256, bitrate)}k`, "-vbr", "on"] },
};

export const audioFormatOrder: AudioOutputFormat[] = ["mp3", "m4a", "wav", "flac", "alac", "aiff", "ogg", "opus", "webm", "wv", "ac3", "wma"];

// Shared argument builder (pure, unit-tested): metadata policy, optional
// resample/remix, cover-art carry-over and the codec arguments.
export function buildAudioArgs(format: AudioOutputFormat, bitrate: number, options: AudioOptions, input: string, output: string, extras: { hasCoverArt?: boolean; filters?: string[]; trimStart?: number; trimEnd?: number } = {}): string[] {
  const profile = audioProfiles[format];
  const start = Math.max(0, extras.trimStart || 0);
  const args: string[] = [];
  if (start > 0) args.push("-ss", start.toFixed(3));
  args.push("-i", input);
  if (extras.trimEnd && extras.trimEnd > start) args.push("-t", (extras.trimEnd - start).toFixed(3));
  args.push("-map", "0:a:0");
  const keepCover = options.keepTags && profile.coverArt && extras.hasCoverArt;
  if (keepCover) args.push("-map", "0:v:0", "-c:v", "copy", "-disposition:v:0", "attached_pic");
  else args.push("-vn");
  args.push("-sn", "-dn", "-map_chapters", "-1");
  if (!options.keepTags) args.push("-map_metadata", "-1", "-bitexact");
  if (extras.filters?.length) args.push("-af", extras.filters.join(","));
  if (options.sampleRate) args.push("-ar", String(options.sampleRate));
  if (options.channels) args.push("-ac", String(options.channels));
  args.push(...profile.args(Math.max(32, Math.min(640, bitrate)), options), output);
  return args;
}

export type AudioJobResult = { blob: Blob; filename: string; format: AudioProfile; lossless: boolean; notes: string[] };

async function safeProbe(file: File, progress?: EngineProgress): Promise<MediaProbe | null> {
  try { return await probeMedia(file, file.name, progress); } catch { return null; }
}

function hasCoverArt(probe: MediaProbe | null) {
  return Boolean(probe?.streams.some((stream) => stream.type === "video" && stream.attachedPic));
}

async function runAudioJob(file: File, format: AudioOutputFormat, args: string[], progress: EngineProgress, label: string, notes: string[]): Promise<AudioJobResult> {
  const profile = audioProfiles[format];
  const outputName = `${safeStem(file.name)}.${profile.extension}`;
  const result = await runFfmpeg({
    inputs: [{ data: file, name: file.name }],
    outputs: [outputName],
    args: (inputs, outputs) => args.map((arg) => arg === "INPUT" ? inputs[0] : arg === "OUTPUT" ? outputs[0] : arg),
    progress,
    label,
    progressRange: [14, 96],
  });
  progress(100, `${profile.label} ready`);
  return { blob: bytesToBlob(result.outputs.get(outputName)!, profile.mime), filename: outputName, format: profile, lossless: profile.lossless, notes };
}

export async function transcodeAudio(file: File, format: AudioOutputFormat, bitrate: number, progress: EngineProgress, options: AudioOptions = defaultAudioOptions): Promise<AudioJobResult> {
  assertEngineCapacity(file);
  const profile = audioProfiles[format];
  const probe = await safeProbe(file, progress);
  const notes: string[] = [];
  const cover = hasCoverArt(probe);
  if (cover && options.keepTags && profile.coverArt) notes.push("Cover art carried over.");
  if (cover && (!options.keepTags || !profile.coverArt)) notes.push(options.keepTags ? `${profile.label} cannot carry cover art; the picture was not copied.` : "Tags and cover art removed as requested.");
  const source = probe?.streams.find((stream) => stream.type === "audio");
  if (source && !profile.lossless && ["flac", "alac", "pcm_s16le", "pcm_s24le", "wavpack", "tta", "ape"].includes(source.codec)) notes.push("Lossless source encoded to a lossy format — keep the original if you need archival quality.");
  if (source && profile.lossless && ["mp3", "aac", "vorbis", "opus", "wmav2", "ac3"].includes(source.codec)) notes.push("A lossy source cannot regain detail; the lossless output preserves exactly what the source contains.");
  const args = buildAudioArgs(format, bitrate, options, "INPUT", "OUTPUT", { hasCoverArt: cover });
  return runAudioJob(file, format, args, progress, `Encoding ${profile.label}`, notes);
}

// Cut without re-encoding: every audio frame is independently decodable, so a
// stream copy is accurate to one frame (about 26 ms for MP3, 20 ms for Opus).
export async function trimAudioLossless(file: File, startSeconds: number, endSeconds: number, progress: EngineProgress): Promise<{ blob: Blob; filename: string }> {
  assertEngineCapacity(file);
  const extension = (file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "bin").toLowerCase();
  const start = Math.max(0, startSeconds || 0);
  const outputName = `${safeStem(file.name)}-${start.toFixed(2)}s-${(endSeconds || 0).toFixed(2)}s.${extension}`;
  const result = await runFfmpeg({
    inputs: [{ data: file, name: file.name }],
    outputs: [outputName],
    args: (inputs, outputs) => [...(start > 0 ? ["-ss", start.toFixed(3)] : []), "-i", inputs[0], ...(endSeconds > start ? ["-t", (endSeconds - start).toFixed(3)] : []), "-map", "0:a:0", "-vn", "-sn", "-dn", "-c:a", "copy", "-avoid_negative_ts", "make_zero", outputs[0]],
    progress,
    label: "Cutting without re-encoding",
    progressRange: [14, 96],
  });
  progress(100, "Lossless cut complete");
  return { blob: bytesToBlob(result.outputs.get(outputName)!, file.type || "application/octet-stream"), filename: outputName };
}

export async function trimAudioToFormat(file: File, startSeconds: number, endSeconds: number, format: AudioOutputFormat, bitrate: number, progress: EngineProgress, options: AudioOptions = defaultAudioOptions): Promise<AudioJobResult> {
  assertEngineCapacity(file);
  const probe = await safeProbe(file, progress);
  const args = buildAudioArgs(format, bitrate, options, "INPUT", "OUTPUT", { hasCoverArt: hasCoverArt(probe), trimStart: startSeconds, trimEnd: endSeconds });
  return runAudioJob(file, format, args, progress, `Cutting and encoding ${audioProfiles[format].label}`, []);
}

export async function changeAudioVolumeToFormat(file: File, percent: number, format: AudioOutputFormat, bitrate: number, progress: EngineProgress, options: AudioOptions = defaultAudioOptions): Promise<AudioJobResult> {
  assertEngineCapacity(file);
  const probe = await safeProbe(file, progress);
  const gain = Math.max(0, Math.min(4, percent / 100));
  const args = buildAudioArgs(format, bitrate, options, "INPUT", "OUTPUT", { hasCoverArt: hasCoverArt(probe), filters: [`volume=${gain.toFixed(3)}`] });
  return runAudioJob(file, format, args, progress, `Adjusting volume and encoding ${audioProfiles[format].label}`, gain > 1 ? ["Gains above 100% can clip loud passages; the output is hard-limited at full scale."] : []);
}

export async function decodeAudioWithFallback(file: File, progress?: (message: string) => void) {
  assertEngineCapacity(file);
  const outputName = "decoded.wav";
  const result = await runFfmpeg({
    inputs: [{ data: file, name: file.name }],
    outputs: [outputName],
    args: (inputs, outputs) => ["-i", inputs[0], "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", outputs[0]],
    progress: (_, message) => progress?.(message),
    label: `Compatibility decoding ${file.name}`,
  });
  return result.outputs.get(outputName)!.buffer as ArrayBuffer;
}
