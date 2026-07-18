"use client";

import { assertEngineCapacity, getFfmpeg } from "./audio-transcode.ts";

export type CleanerRoute = "exiftool" | "pdf" | "ooxml" | "media";
export type WasmFetch = (...args: unknown[]) => Promise<Response>;

// ExifTool cannot rewrite these container families, so they are cleaned by the
// FFmpeg engine (lossless stream copy with all metadata and chapters dropped)
// or by direct archive/document rewriting instead.
const mediaExtensions = new Set(["mp3", "flac", "ogg", "oga", "opus", "wav", "aif", "aiff", "aifc", "webm", "mka", "mkv"]);
const ooxmlExtensions = new Set(["docx", "xlsx", "pptx"]);

function extensionOf(name: string) {
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : "";
}

export function cleanerFor(name: string): CleanerRoute {
  const extension = extensionOf(name);
  if (extension === "pdf") return "pdf";
  if (ooxmlExtensions.has(extension)) return "ooxml";
  if (mediaExtensions.has(extension)) return "media";
  return "exiftool";
}

export async function stripWithExiftool(file: File, wasmFetch: WasmFetch): Promise<Blob> {
  const { writeMetadata, dispose } = await import("@uswriting/exiftool");
  // The library appends its own -o output argument, so -overwrite_original must
  // never be combined with it: ExifTool rejects the pair and the write fails.
  const cleaned = await writeMetadata(file, {}, { args: ["-all="], fetch: wasmFetch });
  if (!cleaned.success) {
    // A failed write can leave the embedded Perl interpreter unusable, which
    // would poison every following file in the batch. Discard it.
    await dispose().catch(() => undefined);
    throw new Error(String(cleaned.error || "Metadata removal failed.").split("\n")[0]);
  }
  return new Blob([cleaned.data as BlobPart], { type: file.type || "application/octet-stream" });
}

export async function stripPdfMetadata(file: File): Promise<Blob> {
  const { PDFDocument, PDFName } = await import("pdf-lib");
  const document = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false, updateMetadata: false });
  document.catalog.delete(PDFName.of("Metadata"));
  document.catalog.delete(PDFName.of("PieceInfo"));
  const trailerInfo = document.context.trailerInfo as { Info?: unknown };
  if (trailerInfo.Info) {
    const infoRef = trailerInfo.Info;
    delete trailerInfo.Info;
    try { document.context.delete(infoRef as Parameters<typeof document.context.delete>[0]); } catch { /* unreferenced Info is simply omitted */ }
  }
  return new Blob([await document.save({ useObjectStreams: true }) as BlobPart], { type: "application/pdf" });
}

const coreProperties = ["dc:title", "dc:subject", "dc:creator", "cp:keywords", "dc:description", "cp:lastModifiedBy", "cp:revision", "dcterms:created", "dcterms:modified", "cp:category", "cp:contentStatus", "cp:lastPrinted", "dc:identifier", "cp:version", "dc:language"];
const appProperties = ["Company", "Manager", "HyperlinkBase"];

function removeXmlElements(xml: string, names: string[]) {
  let output = xml;
  for (const name of names) {
    const escaped = name.replace(":", "\\:");
    output = output
      .replace(new RegExp(`<${escaped}(?:\\s[^>]*)?>[\\s\\S]*?</${escaped}>`, "g"), "")
      .replace(new RegExp(`<${escaped}(?:\\s[^>]*)?/>`, "g"), "");
  }
  return output;
}

export async function stripOoxmlMetadata(file: File): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const core = zip.file("docProps/core.xml");
  if (core) zip.file("docProps/core.xml", removeXmlElements(await core.async("string"), coreProperties));
  const app = zip.file("docProps/app.xml");
  if (app) zip.file("docProps/app.xml", removeXmlElements(await app.async("string"), appProperties));
  if (zip.file("docProps/custom.xml")) zip.remove("docProps/custom.xml");
  // Normalize every entry timestamp so the archive does not leak original or
  // current modification times through ZIP headers.
  const dosEpoch = new Date(Date.UTC(1980, 0, 1));
  zip.forEach((_, entry) => { entry.date = dosEpoch; });
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: file.type || "application/octet-stream" });
}

export async function stripMediaMetadata(file: File, progress?: (message: string) => void): Promise<Blob> {
  assertEngineCapacity(file);
  const ffmpeg = await getFfmpeg((_, message) => progress?.(message));
  const token = crypto.randomUUID().replaceAll("-", "");
  const extension = extensionOf(file.name) || "bin";
  const inputName = `strip-${token}-in.${extension}`;
  const outputName = `strip-${token}-out.${extension}`;
  try {
    progress?.(`Rewriting ${file.name} without metadata`);
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    const exitCode = await ffmpeg.exec(["-hide_banner", "-i", inputName, "-map", "0", "-map_metadata", "-1", "-map_chapters", "-1", "-bitexact", "-c", "copy", outputName]);
    if (exitCode !== 0) throw new Error(`${file.name} could not be rewritten without metadata by the media engine.`);
    const data = await ffmpeg.readFile(outputName);
    if (typeof data === "string" || !data.byteLength) throw new Error(`${file.name} produced no cleaned output.`);
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy.buffer], { type: file.type || "application/octet-stream" });
  } finally {
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
  }
}

export async function stripFileMetadata(file: File, wasmFetch: WasmFetch, progress?: (message: string) => void): Promise<Blob> {
  const route = cleanerFor(file.name);
  if (route === "pdf") return stripPdfMetadata(file);
  if (route === "ooxml") return stripOoxmlMetadata(file);
  if (route === "media") return stripMediaMetadata(file, progress);
  return stripWithExiftool(file, wasmFetch);
}
