"use client";

// Loads the private FFmpeg WebAssembly engine once per tab, splits across the
// 16 MB hosting chunks, and owns the reset/capacity rules every media tool
// relies on. Kept separate from the job runner so the two can import freely.

import type { FFmpeg as FFmpegClient } from "@ffmpeg/ffmpeg";

type FFmpegModule = { FFmpeg: new () => FFmpegClient };

const ENGINE_UNAVAILABLE = "The local media engine is unavailable. Refresh the page and try again.";

let ffmpegPromise: Promise<FFmpegClient> | null = null;

// The @ffmpeg/ffmpeg client is served from /ffmpeg (see scripts/prepare-wasm.sh)
// and imported at runtime so the bundlers never analyse its worker constructor.
async function loadFfmpegModule(): Promise<FFmpegModule> {
  const moduleUrl = `${window.location.origin}/ffmpeg/index.js`;
  try {
    return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ moduleUrl) as FFmpegModule;
  } catch {
    throw new Error(ENGINE_UNAVAILABLE);
  }
}

async function fetchPart(index: number) {
  const response = await fetch(`/ffmpeg/ffmpeg-core.wasm.part${index}`);
  if (!response.ok) throw new Error(ENGINE_UNAVAILABLE);
  return response.arrayBuffer();
}

async function loadChunkedWasm(progress?: (percent: number, message: string) => void) {
  // The build writes a manifest beside the chunks so every part downloads in
  // parallel; probing one by one stays as the fallback for older deployments.
  let parts = 0;
  try {
    const manifest = await fetch("/ffmpeg/ffmpeg-core.wasm.json");
    if (manifest.ok) parts = Math.max(0, Math.min(16, Number((await manifest.json() as { parts?: number }).parts) || 0));
  } catch { parts = 0; }
  const chunks: ArrayBuffer[] = [];
  if (parts > 0) {
    let done = 0;
    const loaded = await Promise.all(Array.from({ length: parts }, (_, index) => fetchPart(index).then((buffer) => {
      done += 1;
      progress?.(4 + Math.round(done / parts * 10), `Loading the private media engine (${done}/${parts})`);
      return buffer;
    })));
    chunks.push(...loaded);
  } else {
    for (let index = 0; index < 16; index += 1) {
      const response = await fetch(`/ffmpeg/ffmpeg-core.wasm.part${index}`);
      if (!response.ok) {
        if (index === 0) throw new Error(ENGINE_UNAVAILABLE);
        break;
      }
      chunks.push(await response.arrayBuffer());
    }
  }
  return URL.createObjectURL(new Blob(chunks, { type: "application/wasm" }));
}

export async function getFfmpeg(progress?: (percent: number, message: string) => void) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      progress?.(4, "Loading the private media engine (first use only)");
      const { FFmpeg } = await loadFfmpegModule();
      const ffmpeg = new FFmpeg();
      const wasmURL = await loadChunkedWasm(progress);
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
  if (error && typeof error === "object" && (error as { controlled?: boolean }).controlled === true) return true;
  return error instanceof Error && /could not encode|not readable|empty audio|did not produce|too large|could not be rewritten|no cleaned output|could not be read by the media engine|did not produce the expected output|media engine reported|could not complete this job|not available in the in-browser engine|without re-encoding|ran out of memory|No audio or video stream/i.test(error.message);
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

