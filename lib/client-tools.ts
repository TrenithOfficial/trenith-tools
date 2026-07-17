"use client";

export type ProgressHandler = (percent: number, message: string) => void;

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

function audioBufferToWav(buffer: AudioBuffer) {
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

export async function joinAudioFiles(files: File[], progress: ProgressHandler) {
  if (files.length < 2) throw new Error("Choose at least two audio files to join.");
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not support local audio processing.");

  const context = new AudioContextClass({ sampleRate: 44_100 });
  try {
    const decoded: AudioBuffer[] = [];
    for (let index = 0; index < files.length; index += 1) {
      progress(Math.round((index / files.length) * 58), `Decoding ${files[index].name}`);
      decoded.push(await context.decodeAudioData(await files[index].arrayBuffer()));
    }

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
    return { blob, filename: `${safeStem(files[0].name)}-joined.wav` };
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

      progress(Math.round((index / files.length) * 94), `Recording clip ${index + 1} of ${files.length}`);
      const ended = waitForMedia(video, "ended");
      await video.play();
      await new Promise<void>((resolve, reject) => {
        const render = () => {
          try {
            paint.fillStyle = "#000";
            paint.fillRect(0, 0, canvas.width, canvas.height);
            const ratio = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
            const width = video.videoWidth * ratio;
            const height = video.videoHeight * ratio;
            paint.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
            if (video.ended) resolve(); else requestAnimationFrame(render);
          } catch (error) { reject(error); }
        };
        render();
      });
      await ended;
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
  const indexes = new Set<number>();
  value.split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Math.max(1, Number(range[1]));
      const end = Math.min(totalPages, Number(range[2]));
      for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) indexes.add(page - 1);
    } else if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page >= 1 && page <= totalPages) indexes.add(page - 1);
    }
  });
  return [...indexes];
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

export async function processImage(file: File, width: number, quality: number, format: "image/jpeg" | "image/png" | "image/webp") {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, width / image.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    if (format === "image/jpeg") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, quality));
    if (!blob) throw new Error("The browser could not export this image.");
    const extension = format.split("/")[1].replace("jpeg", "jpg");
    return { blob, filename: `${safeStem(file.name)}-${canvas.width}w.${extension}`, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
