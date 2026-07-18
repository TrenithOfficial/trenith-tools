"use client";

import { decodeAudioWithFallback } from "./audio-transcode.ts";

export type ProgressHandler = (percent: number, message: string) => void;
export type AudioJoinOptions = { skipUnreadable?: boolean };
export type AudioJoinResult = { blob?: Blob; filename: string; savedToDisk?: boolean; warnings: string[] };

type BrowserWritable = {
  write(data: BufferSource | Blob | { type: "write"; position: number; data: BufferSource | Blob }): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
};

type BrowserSaveHandle = { createWritable(): Promise<BrowserWritable> };
type SavePickerWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<BrowserSaveHandle> };

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

function safeStem(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "trenith-output";
}

export function audioBufferToWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

async function decodeAudioFile(context: AudioContext, file: File, compatibilityProgress?: (message: string) => void) {
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    const wav = await decodeAudioWithFallback(file, compatibilityProgress);
    try {
      return await context.decodeAudioData(wav.slice(0));
    } catch {
      throw new Error(`${file.name} could not be decoded by the browser or the compatibility engine.`);
    }
  }
}

function writeText(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function wavHeader(dataLength: bigint, channels: number, sampleRate: number, totalFrames: bigint) {
  const bytesPerFrame = channels * 2;
  if (dataLength <= 0xffff_ffffn - 36n) {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    writeText(view, 0, "RIFF"); view.setUint32(4, Number(36n + dataLength), true); writeText(view, 8, "WAVE");
    writeText(view, 12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * bytesPerFrame, true); view.setUint16(32, bytesPerFrame, true); view.setUint16(34, 16, true);
    writeText(view, 36, "data"); view.setUint32(40, Number(dataLength), true);
    return buffer;
  }
  const buffer = new ArrayBuffer(80);
  const view = new DataView(buffer);
  writeText(view, 0, "RF64"); view.setUint32(4, 0xffff_ffff, true); writeText(view, 8, "WAVE");
  writeText(view, 12, "ds64"); view.setUint32(16, 28, true); view.setBigUint64(20, 72n + dataLength, true); view.setBigUint64(28, dataLength, true); view.setBigUint64(36, totalFrames, true); view.setUint32(44, 0, true);
  writeText(view, 48, "fmt "); view.setUint32(52, 16, true); view.setUint16(56, 1, true); view.setUint16(58, channels, true);
  view.setUint32(60, sampleRate, true); view.setUint32(64, sampleRate * bytesPerFrame, true); view.setUint16(68, bytesPerFrame, true); view.setUint16(70, 16, true);
  writeText(view, 72, "data"); view.setUint32(76, 0xffff_ffff, true);
  return buffer;
}

async function writePcm(buffer: AudioBuffer, channels: number, writable: BrowserWritable) {
  const framesPerChunk = 32_768;
  for (let start = 0; start < buffer.length; start += framesPerChunk) {
    const frames = Math.min(framesPerChunk, buffer.length - start);
    const bytes = new ArrayBuffer(frames * channels * 2);
    const view = new DataView(bytes);
    let offset = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
        const sample = Math.max(-1, Math.min(1, source[start + frame] ?? 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    await writable.write(bytes);
  }
}

async function joinAudioToDisk(files: File[], progress: ProgressHandler, options: AudioJoinOptions): Promise<AudioJoinResult> {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (!picker) throw new Error("This large job needs Chrome or Edge desktop so Trenith can stream the output directly to a file. Smaller jobs still work in other modern browsers.");
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not support local audio processing.");
  const filename = `${safeStem(files[0].name)}-joined.wav`;
  const handle = await picker({ suggestedName: filename, types: [{ description: "WAV or RF64 audio", accept: { "audio/wav": [".wav"] } }] });
  const writable = await handle.createWritable();
  const context = new AudioContextClass({ sampleRate: 44_100 });
  const valid: Array<{ file: File; frames: number; channels: number }> = [];
  const warnings: string[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      progress(Math.round((index / files.length) * 38), `Checking ${index + 1} of ${files.length}: ${files[index].name}`);
      try {
        const decoded = await decodeAudioFile(context, files[index], (message) => progress(Math.round((index / files.length) * 38), message));
        valid.push({ file: files[index], frames: decoded.length, channels: decoded.numberOfChannels });
      } catch {
        warnings.push(`${files[index].name} could not be decoded by this browser.`);
      }
    }
    if (warnings.length && !options.skipUnreadable) {
      await writable.abort?.("Validation failed");
      throw new Error(`${warnings[0]}${warnings.length > 1 ? ` Plus ${warnings.length - 1} more unreadable file${warnings.length === 2 ? "" : "s"}.` : ""} Enable “Skip unreadable files” to continue without them.`);
    }
    if (valid.length < 2) throw new Error("Fewer than two readable audio files remain after validation.");
    const channels = Math.min(2, Math.max(...valid.map((item) => item.channels)));
    const totalFrames = valid.reduce((total, item) => total + BigInt(item.frames), 0n);
    const dataLength = totalFrames * BigInt(channels * 2);
    await writable.write(wavHeader(dataLength, channels, context.sampleRate, totalFrames));
    for (let index = 0; index < valid.length; index += 1) {
      progress(40 + Math.round((index / valid.length) * 58), `Writing ${index + 1} of ${valid.length}: ${valid[index].file.name}`);
      const decoded = await decodeAudioFile(context, valid[index].file, (message) => progress(40 + Math.round((index / valid.length) * 58), message));
      await writePcm(decoded, channels, writable);
    }
    await writable.close();
    progress(100, dataLength > 0xffff_ffffn ? "Large RF64-compatible WAV saved" : "Streaming WAV saved");
    return { filename, savedToDisk: true, warnings };
  } catch (error) {
    await writable.abort?.(error).catch(() => undefined);
    throw error;
  } finally {
    await context.close();
  }
}

export async function joinAudioFiles(files: File[], progress: ProgressHandler, options: AudioJoinOptions = {}): Promise<AudioJoinResult> {
  if (files.length < 2) throw new Error("Choose at least two audio files to join.");
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const largeJob = files.length > 60 || totalBytes > 120 * 1024 * 1024;
  if (largeJob) return joinAudioToDisk(files, progress, options);
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not support local audio processing.");

  const context = new AudioContextClass({ sampleRate: 44_100 });
  try {
    const decoded: AudioBuffer[] = [];
    const warnings: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      progress(Math.round((index / files.length) * 58), `Decoding ${files[index].name}`);
      try { decoded.push(await decodeAudioFile(context, files[index], (message) => progress(Math.round((index / files.length) * 58), message))); }
      catch {
        warnings.push(`${files[index].name} could not be decoded by this browser.`);
        if (!options.skipUnreadable) throw new Error(`${files[index].name} could not be decoded. Remove or replace it, or enable “Skip unreadable files”.`);
      }
    }

    if (decoded.length < 2) throw new Error("Fewer than two readable audio files remain after validation.");

    const channelCount = Math.min(2, Math.max(...decoded.map((buffer) => buffer.numberOfChannels)));
    const totalFrames = decoded.reduce((total, buffer) => total + buffer.length, 0);
    const output = context.createBuffer(channelCount, totalFrames, context.sampleRate);
    let frameOffset = 0;

    decoded.forEach((buffer, bufferIndex) => {
      progress(60 + Math.round((bufferIndex / files.length) * 30), `Joining track ${bufferIndex + 1} of ${files.length}`);
      for (let channel = 0; channel < channelCount; channel += 1) {
        output.getChannelData(channel).set(buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)), frameOffset);
      }
      frameOffset += buffer.length;
    });

    progress(94, "Encoding lossless WAV");
    const blob = audioBufferToWav(output);
    progress(100, "Audio join complete");
    return { blob, filename: `${safeStem(files[0].name)}-joined.wav`, warnings };
  } finally {
    await context.close();
  }
}

export async function convertAudioFileToWav(file: File, progress: ProgressHandler) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not support local audio processing.");
  const context = new AudioContextClass({ sampleRate: 44_100 });
  try {
    progress(18, `Reading ${file.name}`);
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    progress(72, "Encoding lossless WAV");
    const blob = audioBufferToWav(decoded);
    progress(100, "Conversion complete");
    return { blob, filename: `${safeStem(file.name)}.wav` };
  } finally {
    await context.close();
  }
}

export async function trimAudioFile(file: File, startSeconds: number, endSeconds: number, progress: ProgressHandler) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not support local audio processing.");
  const context = new AudioContextClass({ sampleRate: 44_100 });
  try {
    progress(15, `Reading ${file.name}`);
    const source = await decodeAudioFile(context, file, (message) => progress(22, message));
    const safeStart = Math.max(0, Math.min(source.duration, Number(startSeconds) || 0));
    const safeEnd = Math.max(0, Math.min(source.duration, Number(endSeconds) || source.duration));
    if (safeEnd <= safeStart) throw new Error(`End time must be after start time and within ${source.duration.toFixed(2)} seconds.`);
    const startFrame = Math.floor(safeStart * source.sampleRate);
    const endFrame = Math.min(source.length, Math.ceil(safeEnd * source.sampleRate));
    const output = context.createBuffer(source.numberOfChannels, endFrame - startFrame, source.sampleRate);
    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      output.getChannelData(channel).set(source.getChannelData(channel).subarray(startFrame, endFrame));
    }
    progress(82, "Encoding trimmed WAV");
    const blob = audioBufferToWav(output);
    progress(100, "Audio trim complete");
    return { blob, filename: `${safeStem(file.name)}-${safeStart.toFixed(2)}s-${safeEnd.toFixed(2)}s.wav`, duration: source.duration };
  } finally {
    await context.close();
  }
}

export async function changeAudioVolume(file: File, percent: number, progress: ProgressHandler) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not support local audio processing.");
  const context = new AudioContextClass({ sampleRate: 44_100 });
  try {
    progress(15, `Reading ${file.name}`);
    const source = await decodeAudioFile(context, file, (message) => progress(22, message));
    const gain = Math.max(0, Math.min(4, percent / 100));
    const output = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const input = source.getChannelData(channel);
      const target = output.getChannelData(channel);
      for (let frame = 0; frame < input.length; frame += 1) target[frame] = Math.max(-1, Math.min(1, input[frame] * gain));
    }
    progress(82, "Encoding adjusted WAV");
    const blob = audioBufferToWav(output);
    progress(100, "Volume change complete");
    return { blob, filename: `${safeStem(file.name)}-${Math.round(gain * 100)}pct.wav` };
  } finally {
    await context.close();
  }
}

function waitForMedia(video: HTMLVideoElement, event: "loadedmetadata" | "ended") {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("A selected video could not be decoded by this browser.")); };
    const cleanup = () => {
      video.removeEventListener(event, done);
      video.removeEventListener("error", failed);
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

export async function joinVideoFiles(files: File[], progress: ProgressHandler) {
  if (files.length < 2) throw new Error("Choose at least two video files to join.");
  if (!("MediaRecorder" in window)) throw new Error("This browser does not support local video recording.");

  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  const firstUrl = URL.createObjectURL(files[0]);
  video.src = firstUrl;
  await waitForMedia(video, "loadedmetadata");

  const canvas = document.createElement("canvas");
  const maxWidth = 1920;
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
  canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
  const paint = canvas.getContext("2d");
  if (!paint) throw new Error("Canvas video processing is unavailable.");

  const canvasStream = canvas.captureStream(30);
  const audioContext = new AudioContext();
  await audioContext.resume();
  const audioDestination = audioContext.createMediaStreamDestination();
  const source = audioContext.createMediaElementSource(video);
  source.connect(audioDestination);
  const outputStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);

  const mimeType = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType, videoBitsPerSecond: 6_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
  recorder.start(1_000);

  let currentUrl = firstUrl;
  try {
    for (let index = 0; index < files.length; index += 1) {
      if (index > 0) {
        URL.revokeObjectURL(currentUrl);
        currentUrl = URL.createObjectURL(files[index]);
        video.src = currentUrl;
        await waitForMedia(video, "loadedmetadata");
      }

      progress(Math.max(1, Math.round((index / files.length) * 94)), `Recording clip ${index + 1} of ${files.length}`);
      const ended = waitForMedia(video, "ended");
      await video.play();
      const paintFrame = () => {
        paint.fillStyle = "#000";
        paint.fillRect(0, 0, canvas.width, canvas.height);
        const ratio = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const width = video.videoWidth * ratio;
        const height = video.videoHeight * ratio;
        paint.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      };
      // An interval keeps painting (and the recording progressing) even when the
      // tab is backgrounded; requestAnimationFrame would pause and stall the join.
      const painter = window.setInterval(() => { try { paintFrame(); } catch { /* skip frame */ } }, 33);
      try { await ended; paintFrame(); } finally { window.clearInterval(painter); }
    }
    recorder.stop();
    await stopped;
    progress(100, "Video join complete");
    return { blob: new Blob(chunks, { type: mimeType || "video/webm" }), filename: `${safeStem(files[0].name)}-joined.webm` };
  } catch (error) {
    if (recorder.state !== "inactive") recorder.stop();
    throw error;
  } finally {
    video.pause();
    URL.revokeObjectURL(currentUrl);
    outputStream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }
}

export function parsePageSelection(value: string, totalPages: number) {
  const indexes: number[] = [];
  const add = (page: number) => { if (page >= 1 && page <= totalPages) indexes.push(page - 1); };
  value.split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const rawStart = Number(range[1]);
      const rawEnd = Number(range[2]);
      if ((rawStart < 1 && rawEnd < 1) || (rawStart > totalPages && rawEnd > totalPages)) return;
      const start = Math.max(1, Math.min(totalPages, rawStart));
      const end = Math.max(1, Math.min(totalPages, rawEnd));
      const direction = start <= end ? 1 : -1;
      for (let page = start; direction > 0 ? page <= end : page >= end; page += direction) add(page);
    } else if (/^\d+$/.test(part)) {
      add(Number(part));
    }
  });
  return indexes;
}

export async function mergePdfFiles(files: File[], progress: ProgressHandler) {
  if (files.length < 2) throw new Error("Choose at least two PDF files to merge.");
  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.create();
  for (let index = 0; index < files.length; index += 1) {
    progress(Math.round((index / files.length) * 90), `Adding ${files[index].name}`);
    const source = await PDFDocument.load(await files[index].arrayBuffer(), { ignoreEncryption: false });
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  progress(100, "PDF merge complete");
  return new Blob([await output.save({ useObjectStreams: true }) as BlobPart], { type: "application/pdf" });
}

export async function extractPdfPages(file: File, selection: string, progress: ProgressHandler) {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  const indexes = parsePageSelection(selection, source.getPageCount());
  if (!indexes.length) throw new Error(`Enter pages between 1 and ${source.getPageCount()}, for example 1-3,5.`);
  progress(45, "Extracting selected pages");
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indexes);
  pages.forEach((page) => output.addPage(page));
  progress(100, "Page extraction complete");
  return new Blob([await output.save({ useObjectStreams: true }) as BlobPart], { type: "application/pdf" });
}

export async function splitPdfToZip(file: File, progress: ProgressHandler) {
  const [{ PDFDocument }, { default: JSZip }] = await Promise.all([import("pdf-lib"), import("jszip")]);
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  const zip = new JSZip();
  for (let index = 0; index < source.getPageCount(); index += 1) {
    progress(Math.round((index / source.getPageCount()) * 80), `Creating page ${index + 1}`);
    const output = await PDFDocument.create();
    const [page] = await output.copyPages(source, [index]);
    output.addPage(page);
    zip.file(`page-${String(index + 1).padStart(3, "0")}.pdf`, await output.save({ useObjectStreams: true }));
  }
  progress(88, "Packaging pages");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  progress(100, "Split complete");
  return blob;
}

export async function transformPdf(
  file: File,
  mode: "rotate" | "number" | "watermark" | "compress",
  value: string,
  progress: ProgressHandler,
) {
  const { PDFDocument, StandardFonts, degrees, rgb } = await import("pdf-lib");
  const document = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  const pages = document.getPages();
  const font = mode === "number" || mode === "watermark" ? await document.embedFont(StandardFonts.HelveticaBold) : null;
  pages.forEach((page, index) => {
    progress(Math.round((index / Math.max(1, pages.length)) * 90), `Processing page ${index + 1}`);
    if (mode === "rotate") page.setRotation(degrees((page.getRotation().angle + 90) % 360));
    if (mode === "number" && font) {
      const label = `${index + 1} / ${pages.length}`;
      const size = 10;
      page.drawText(label, { x: (page.getWidth() - font.widthOfTextAtSize(label, size)) / 2, y: 18, size, font, color: rgb(.25, .28, .34) });
    }
    if (mode === "watermark" && font) {
      const label = value.trim() || "TRENITH";
      const size = Math.max(22, Math.min(70, page.getWidth() / Math.max(5, label.length) * 1.5));
      page.drawText(label, {
        x: (page.getWidth() - font.widthOfTextAtSize(label, size)) / 2,
        y: page.getHeight() / 2,
        size,
        font,
        color: rgb(.22, .28, .65),
        opacity: .18,
        rotate: degrees(-32),
      });
    }
  });
  progress(100, mode === "compress" ? "PDF optimized" : "PDF ready");
  return new Blob([await document.save({ useObjectStreams: true, addDefaultPage: false }) as BlobPart], { type: "application/pdf" });
}

export async function imagesToPdf(files: File[], progress: ProgressHandler) {
  if (!files.length) throw new Error("Choose one or more JPG or PNG images.");
  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.create();
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    progress(Math.round((index / files.length) * 90), `Adding ${file.name}`);
    const bytes = await file.arrayBuffer();
    const image = file.type.includes("png") ? await document.embedPng(bytes) : await document.embedJpg(bytes);
    const portrait = image.height >= image.width;
    const page = document.addPage(portrait ? [595.28, 841.89] : [841.89, 595.28]);
    const margin = 28;
    const scale = Math.min((page.getWidth() - margin * 2) / image.width, (page.getHeight() - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  }
  progress(100, "PDF created");
  return new Blob([await document.save({ useObjectStreams: true }) as BlobPart], { type: "application/pdf" });
}

async function decodeImageSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap decodes off the rendering pipeline, so it keeps working
  // when the tab is backgrounded; HTMLImageElement.decode() can stall there.
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file); } catch { /* fall through to the element decoder */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processImage(file: File, width: number, quality: number, format: "image/jpeg" | "image/png" | "image/webp") {
  const source = await decodeImageSource(file);
  try {
    const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
    const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!sourceWidth || !sourceHeight) throw new Error("This image could not be decoded by the browser.");
    const scale = Math.min(1, width / sourceWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    if (format === "image/jpeg") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality));
    if (!blob) throw new Error("The browser could not export this image.");
    const extension = format.split("/")[1].replace("jpeg", "jpg");
    return { blob, filename: `${safeStem(file.name)}-${canvas.width}w.${extension}`, width: canvas.width, height: canvas.height };
  } finally {
    if ("close" in source) source.close();
  }
}
