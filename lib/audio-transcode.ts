"use client";

export type AudioOutputFormat = "mp3" | "wav" | "flac" | "ogg" | "opus" | "m4a";

export type AudioProfile = {
  extension: AudioOutputFormat;
  label: string;
  mime: string;
  lossless: boolean;
  args: (bitrate: number) => string[];
};

export const audioProfiles: Record<AudioOutputFormat, AudioProfile> = {
  mp3: { extension: "mp3", label: "MP3", mime: "audio/mpeg", lossless: false, args: (bitrate) => ["-c:a", "libmp3lame", "-b:a", `${bitrate}k`] },
  wav: { extension: "wav", label: "WAV", mime: "audio/wav", lossless: true, args: () => ["-c:a", "pcm_s16le"] },
  flac: { extension: "flac", label: "FLAC", mime: "audio/flac", lossless: true, args: () => ["-c:a", "flac", "-compression_level", "5"] },
  ogg: { extension: "ogg", label: "Ogg Vorbis", mime: "audio/ogg", lossless: false, args: (bitrate) => ["-c:a", "libvorbis", "-b:a", `${bitrate}k`] },
  opus: { extension: "opus", label: "Opus", mime: "audio/ogg; codecs=opus", lossless: false, args: (bitrate) => ["-c:a", "libopus", "-b:a", `${bitrate}k`, "-vbr", "on"] },
  m4a: { extension: "m4a", label: "M4A / AAC", mime: "audio/mp4", lossless: false, args: (bitrate) => ["-c:a", "aac", "-b:a", `${bitrate}k`, "-movflags", "+faststart"] },
};

let ffmpegPromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null = null;

function safeStem(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "trenith-audio";
}

function safeExtension(name: string) {
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : "bin";
}

async function loadChunkedWasm() {
  const chunks: ArrayBuffer[] = [];
  for (let index = 0; index < 16; index += 1) {
    const response = await fetch(`/ffmpeg/ffmpeg-core.wasm.part${index}`);
    if (!response.ok) {
      if (index === 0) throw new Error("The local media engine is unavailable. Refresh the page and try again.");
      break;
    }
    chunks.push(await response.arrayBuffer());
  }
  return URL.createObjectURL(new Blob(chunks, { type: "application/wasm" }));
}

export async function getFfmpeg(progress?: (percent: number, message: string) => void) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      progress?.(4, "Loading the private media engine (first use only)");
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const ffmpeg = new FFmpeg();
      const wasmURL = await loadChunkedWasm();
      try {
        await ffmpeg.load({ coreURL: "/ffmpeg/ffmpeg-core.js", wasmURL, classWorkerURL: `${window.location.origin}/ffmpeg/worker.js` });
      } finally {
        URL.revokeObjectURL(wasmURL);
      }
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error instanceof Error ? error : new Error(typeof error === "string" && error ? error : "The private media engine could not start. Refresh the page and try again.");
    });
  }
  return ffmpegPromise;
}

// A worker abort/OOM leaves the cached singleton pointing at a dead worker, which
// would silently break every later conversion until a full page reload. Reset the
// cache (and terminate the corpse in the background) so the next getFfmpeg() builds
// a fresh engine. Not awaited: a crashed worker may never resolve terminate().
export function resetFfmpeg() {
  const current = ffmpegPromise;
  ffmpegPromise = null;
  if (current) void current.then((ffmpeg) => { try { ffmpeg.terminate(); } catch { /* already gone */ } }).catch(() => undefined);
}

// True for our own controlled failures (bad input / nonzero exit / empty output),
// where the engine is still healthy and must NOT be torn down. Anything else is
// treated as a worker crash and triggers a reset.
export function isControlledEngineError(error: unknown): boolean {
  return error instanceof Error && /could not encode|not readable|empty audio|did not produce|too large|could not be rewritten|no cleaned output/i.test(error.message);
}

// The engine holds the whole source plus its output inside 32-bit WebAssembly
// memory, so very large files can never fit. Fail fast with an honest message
// instead of downloading the engine and then dying with a generic error.
export const MAX_ENGINE_INPUT_BYTES = 1536 * 1024 * 1024;

export function assertEngineCapacity(file: File) {
  if (file.size > MAX_ENGINE_INPUT_BYTES) {
    const gigabytes = (file.size / 1024 / 1024 / 1024).toFixed(1);
    throw new Error(`${file.name} is ${gigabytes} GB. The in-browser engine can process files up to about 1.5 GB; trim or split the recording first, or convert it with a desktop tool.`);
  }
}

export async function transcodeAudio(
  file: File,
  format: AudioOutputFormat,
  bitrate: number,
  progress: (percent: number, message: string) => void,
) {
  const profile = audioProfiles[format];
  assertEngineCapacity(file);
  const ffmpeg = await getFfmpeg(progress);
  const token = crypto.randomUUID().replaceAll("-", "");
  const inputName = `input-${token}.${safeExtension(file.name)}`;
  const outputName = `output-${token}.${profile.extension}`;
  const onProgress = ({ progress: ratio }: { progress: number }) => {
    if (Number.isFinite(ratio) && ratio >= 0) progress(Math.min(94, 18 + Math.round(ratio * 74)), `Encoding ${profile.label}`);
  };

  ffmpeg.on("progress", onProgress);
  try {
    progress(12, `Reading ${file.name}`);
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    const exitCode = await ffmpeg.exec(["-hide_banner", "-i", inputName, "-map", "0:a:0", "-vn", ...profile.args(Math.max(32, Math.min(512, bitrate))), outputName]);
    if (exitCode !== 0) throw new Error(`The media engine could not encode ${profile.label}. Try WAV or replace the source with a standard MP3, WAV or FLAC file.`);
    const data = await ffmpeg.readFile(outputName);
    if (typeof data === "string" || !data.byteLength) throw new Error("The media engine returned an empty audio file.");
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    progress(100, `${profile.label} conversion complete`);
    return {
      blob: new Blob([bytes.buffer], { type: profile.mime }),
      filename: `${safeStem(file.name)}.${profile.extension}`,
      format: profile,
    };
  } catch (error) {
    if (!isControlledEngineError(error)) resetFfmpeg();
    throw error;
  } finally {
    ffmpeg.off("progress", onProgress);
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
  }
}

export async function decodeAudioWithFallback(file: File, progress?: (message: string) => void) {
  assertEngineCapacity(file);
  const ffmpeg = await getFfmpeg((_, message) => progress?.(message));
  const token = crypto.randomUUID().replaceAll("-", "");
  const inputName = `decode-${token}.${safeExtension(file.name)}`;
  const outputName = `decode-${token}.wav`;
  try {
    progress?.(`Compatibility decoding ${file.name}`);
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    const exitCode = await ffmpeg.exec(["-hide_banner", "-i", inputName, "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", outputName]);
    if (exitCode !== 0) throw new Error(`${file.name} is not readable even in compatibility mode.`);
    const data = await ffmpeg.readFile(outputName);
    if (typeof data === "string") throw new Error(`${file.name} did not produce audio data.`);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  } catch (error) {
    if (!isControlledEngineError(error)) resetFfmpeg();
    throw error;
  } finally {
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
  }
}
