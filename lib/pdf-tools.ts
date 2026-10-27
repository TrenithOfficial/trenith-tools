"use client";

// On-device PDF engines beyond pdf-lib's page operations: a real "compress"
// that re-encodes embedded photos while leaving text, vectors, fonts and links
// untouched; a reachability sweep for objects earlier saves left behind; and
// pdf.js-based page rendering and text extraction.

import type { PDFDict, PDFDocument as PDFDocumentType, PDFNumber, PDFRawStream, PDFRef } from "pdf-lib";

export type ProgressHandler = (percent: number, message: string) => void;

// pdf-lib rejects any encrypted PDF (even ones that open with no password) and
// its raw error tells the user to call a JavaScript API they cannot reach.
export async function loadPdfDocument(bytes: ArrayBuffer, options: { updateMetadata?: boolean } = {}): Promise<PDFDocumentType> {
  const { PDFDocument } = await import("pdf-lib");
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: options.updateMetadata ?? false });
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) {
      throw new Error("This PDF is password-protected or encrypted, so it can't be processed in the browser. Remove its protection first (open it and re-save or print to PDF), then try again.");
    }
    throw error;
  }
}

// pdf-lib re-serializes every indirect object it parsed, including ones no
// longer referenced from the catalog (previous revisions, deleted pages, old
// metadata streams). Remove everything unreachable so it is physically gone.
export async function sweepUnreachable(document: PDFDocumentType): Promise<number> {
  const { PDFArray, PDFDict, PDFRef, PDFStream } = await import("pdf-lib");
  const context = document.context;
  const reachable = new Set<string>();
  const visit = (value: unknown) => {
    if (value instanceof PDFRef) {
      const key = value.toString();
      if (reachable.has(key)) return;
      reachable.add(key);
      visit(context.lookup(value));
      return;
    }
    if (value instanceof PDFStream) { visit(value.dict); return; }
    if (value instanceof PDFDict) { for (const [, entry] of value.entries()) visit(entry); return; }
    if (value instanceof PDFArray) { for (const entry of value.asArray()) visit(entry); }
  };
  const trailer = context.trailerInfo as Record<string, unknown>;
  for (const key of ["Root", "Info", "Encrypt"]) if (trailer[key]) visit(trailer[key]);
  visit(document.catalog);
  let removed = 0;
  for (const [ref] of context.enumerateIndirectObjects()) if (!reachable.has(ref.toString())) { context.delete(ref); removed += 1; }
  return removed;
}

export type CompressOptions = { quality: number; maxPixels: number };
export type CompressResult = { blob: Blob; notes: string[]; imagesTouched: number; before: number; after: number };

export type PixelSource = { kind: "rgba"; data: Uint8ClampedArray<ArrayBuffer> } | { kind: "bitmap"; bitmap: ImageBitmap };
type Encoder = (source: PixelSource, width: number, height: number, quality: number, targetWidth: number, targetHeight: number) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>;

// Canvas-backed JPEG encoder. Injected so the traversal can be unit-tested in
// Node with a stub encoder.
async function canvasJpegEncoder(source: PixelSource, width: number, height: number, quality: number, targetWidth: number, targetHeight: number) {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  // JPEG has no alpha; flatten onto white, which matches how viewers show
  // transparent regions of a page by default.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  if (source.kind === "rgba") {
    const staging = document.createElement("canvas");
    staging.width = width;
    staging.height = height;
    staging.getContext("2d")?.putImageData(new ImageData(source.data, width, height), 0, 0);
    context.drawImage(staging, 0, 0, width, height, 0, 0, targetWidth, targetHeight);
  } else {
    context.drawImage(source.bitmap, 0, 0, width, height, 0, 0, targetWidth, targetHeight);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: targetWidth, height: targetHeight };
}

function fitWithin(width: number, height: number, maxPixels: number) {
  if (!maxPixels || Math.max(width, height) <= maxPixels) return { width, height };
  const scale = maxPixels / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Walk every image XObject and re-encode the ones that can be safely replaced:
// 8-bit RGB/Gray JPEGs and Flate bitmaps without colour-key masks, predictors
// or indexed palettes. Everything else (stencil masks, CMYK, JPX, JBIG2,
// CCITT, 16-bit) is left exactly as it was.
export async function recompressPdfImages(document: PDFDocumentType, options: CompressOptions, progress: ProgressHandler, encode: Encoder = canvasJpegEncoder): Promise<{ touched: number; skipped: number; savedBytes: number }> {
  const lib = await import("pdf-lib");
  const { PDFArray, PDFName, decodePDFRawStream } = lib;
  const RawStream = lib.PDFRawStream;
  const Dict = lib.PDFDict;
  const Num = lib.PDFNumber;
  const context = document.context;
  // Streams parsed from a file are raw; images pdf-lib itself embedded are lazy
  // flate streams. Normalize both to a raw stream with concrete bytes.
  const images = context.enumerateIndirectObjects()
    .filter(([, object]) => object instanceof lib.PDFStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"))
    .map(([ref, object]) => [ref, object instanceof RawStream ? object : RawStream.of((object as PDFRawStream).dict, (object as PDFRawStream).getContents())] as [PDFRef, PDFRawStream]);
  let touched = 0;
  let skipped = 0;
  let savedBytes = 0;
  const quality = Math.max(0.3, Math.min(0.95, options.quality));
  for (let index = 0; index < images.length; index += 1) {
    const [ref, stream] = images[index];
    progress(10 + Math.round((index / Math.max(1, images.length)) * 80), `Recompressing image ${index + 1} of ${images.length}`);
    const dict = stream.dict;
    const width = (dict.lookup(PDFName.of("Width")) as PDFNumber | undefined)?.asNumber() || 0;
    const height = (dict.lookup(PDFName.of("Height")) as PDFNumber | undefined)?.asNumber() || 0;
    const bits = (dict.lookup(PDFName.of("BitsPerComponent")) as PDFNumber | undefined)?.asNumber() || 0;
    const filterValue = dict.lookup(PDFName.of("Filter"));
    const filters = filterValue instanceof PDFName ? [filterValue.decodeText()] : filterValue instanceof PDFArray ? filterValue.asArray().map((entry) => entry instanceof PDFName ? entry.decodeText() : "") : [];
    const colorSpaceValue = dict.lookup(PDFName.of("ColorSpace"));
    let components = 0;
    if (colorSpaceValue instanceof PDFName) components = colorSpaceValue === PDFName.of("DeviceRGB") || colorSpaceValue === PDFName.of("CalRGB") ? 3 : colorSpaceValue === PDFName.of("DeviceGray") || colorSpaceValue === PDFName.of("CalGray") ? 1 : 0;
    else if (colorSpaceValue instanceof PDFArray && colorSpaceValue.size() >= 2 && colorSpaceValue.get(0) === PDFName.of("ICCBased")) {
      const profile = context.lookup(colorSpaceValue.get(1));
      const n = profile instanceof RawStream ? (profile.dict.lookup(PDFName.of("N")) as PDFNumber | undefined)?.asNumber() : undefined;
      components = n === 3 ? 3 : n === 1 ? 1 : 0;
    }
    const isMask = dict.lookup(PDFName.of("ImageMask")) !== undefined;
    const hasColorKey = dict.lookup(PDFName.of("Mask")) instanceof PDFArray;
    const hasSoftMask = dict.lookup(PDFName.of("SMask")) !== undefined || dict.lookup(PDFName.of("Mask")) instanceof RawStream;
    const decodeParms = dict.lookup(PDFName.of("DecodeParms"));
    const predictor = decodeParms instanceof Dict ? (decodeParms.lookup(PDFName.of("Predictor")) as PDFNumber | undefined)?.asNumber() || 1 : 1;
    const decodeArray = dict.lookup(PDFName.of("Decode"));
    const unsupportedFilter = filters.some((filter) => ["JPXDecode", "JBIG2Decode", "CCITTFaxDecode"].includes(filter));
    if (!width || !height || width * height < 40_000 || isMask || hasColorKey || bits !== 8 || !components || unsupportedFilter || predictor > 1 || decodeArray !== undefined) { skipped += 1; continue; }

    let source: PixelSource | null = null;
    try {
      if (filters.includes("DCTDecode")) {
        // Keep JPEG bytes as-is for the decoder; multi-filter chains (e.g.
        // ASCII85 + DCT) are rare and skipped above by the single-filter check.
        if (filters.length !== 1) { skipped += 1; continue; }
        source = { kind: "bitmap", bitmap: await createImageBitmap(new Blob([stream.contents as BlobPart], { type: "image/jpeg" })) };
      } else if (filters.every((filter) => ["FlateDecode", "LZWDecode", "RunLengthDecode", "ASCII85Decode", "ASCIIHexDecode"].includes(filter))) {
        const samples = decodePDFRawStream(stream).decode();
        if (samples.length < width * height * components) { skipped += 1; continue; }
        const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
        for (let pixel = 0, offset = 0; pixel < width * height; pixel += 1, offset += 4) {
          if (components === 3) { rgba[offset] = samples[pixel * 3]; rgba[offset + 1] = samples[pixel * 3 + 1]; rgba[offset + 2] = samples[pixel * 3 + 2]; }
          else { rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = samples[pixel]; }
          rgba[offset + 3] = 255;
        }
        source = { kind: "rgba", data: rgba };
      } else { skipped += 1; continue; }
    } catch { skipped += 1; continue; }
    if (!source) { skipped += 1; continue; }

    // A soft mask is sampled against the base image's coordinate grid; keep the
    // pixel size when a mask exists so transparency stays aligned.
    const target = hasSoftMask ? { width, height } : fitWithin(width, height, options.maxPixels);
    let encoded: Awaited<ReturnType<Encoder>> = null;
    try { encoded = await encode(source, width, height, quality, target.width, target.height); } catch { encoded = null; }
    if (source.kind === "bitmap") source.bitmap.close();
    if (!encoded || encoded.bytes.byteLength >= stream.contents.byteLength * 0.95) { skipped += 1; continue; }

    const next = context.obj({}) as PDFDict;
    for (const [key, value] of dict.entries()) {
      if ([PDFName.of("Filter"), PDFName.of("DecodeParms"), PDFName.of("Length"), PDFName.of("Width"), PDFName.of("Height"), PDFName.of("ColorSpace"), PDFName.of("BitsPerComponent")].includes(key)) continue;
      next.set(key, value);
    }
    next.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
    next.set(PDFName.of("Width"), Num.of(encoded.width));
    next.set(PDFName.of("Height"), Num.of(encoded.height));
    next.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
    next.set(PDFName.of("BitsPerComponent"), Num.of(8));
    next.set(PDFName.of("Length"), Num.of(encoded.bytes.byteLength));
    context.assign(ref, RawStream.of(next, encoded.bytes));
    savedBytes += stream.contents.byteLength - encoded.bytes.byteLength;
    touched += 1;
  }
  return { touched, skipped, savedBytes };
}

export async function compressPdfImages(file: File, options: CompressOptions, progress: ProgressHandler): Promise<CompressResult> {
  progress(4, "Reading the document");
  const source = await file.arrayBuffer();
  const document = await loadPdfDocument(source);
  const { touched, skipped } = await recompressPdfImages(document, options, progress);
  progress(92, "Removing orphaned objects and rewriting the structure");
  const swept = await sweepUnreachable(document);
  const saved = await document.save({ useObjectStreams: true, addDefaultPage: false });
  const notes: string[] = [];
  if (touched) notes.push(`${touched} embedded image${touched === 1 ? "" : "s"} re-encoded at ${Math.round(options.quality * 100)}% quality${options.maxPixels ? ` (longest side capped at ${options.maxPixels} px)` : ""}; text, vectors, fonts and links are untouched.`);
  if (skipped) notes.push(`${skipped} image${skipped === 1 ? "" : "s"} kept as-is (masks, CMYK, scans or already compact).`);
  if (swept) notes.push(`${swept} orphaned object${swept === 1 ? "" : "s"} from earlier saves removed.`);
  if (saved.byteLength >= file.size) {
    progress(100, "Already compact — original kept");
    return { blob: new Blob([source], { type: "application/pdf" }), notes: [...notes, "No smaller result was possible, so the original file is returned unchanged."], imagesTouched: touched, before: file.size, after: file.size };
  }
  progress(100, `Optimized · ${Math.round((1 - saved.byteLength / file.size) * 100)}% smaller`);
  return { blob: new Blob([saved as BlobPart], { type: "application/pdf" }), notes, imagesTouched: touched, before: file.size, after: saved.byteLength };
}

// --- pdf.js: rendering and text --------------------------------------------------

type PdfJsModule = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJsModule> | null = null;

export function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
      return pdfjs;
    }).catch((error) => { pdfjsPromise = null; throw error; });
  }
  return pdfjsPromise;
}

async function openWithPdfJs(bytes: ArrayBuffer) {
  const pdfjs = await loadPdfJs();
  try {
    return await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      cMapUrl: "/pdf/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdf/standard_fonts/",
      wasmUrl: "/pdf/wasm/",
      iccUrl: "/pdf/iccs/",
    }).promise;
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.name + error.message)) throw new Error("This PDF needs a password to open, so it can't be processed in the browser.");
    throw error;
  }
}

export type RenderOptions = { format: "image/jpeg" | "image/png" | "image/webp"; dpi: number; quality: number; pages?: number[] };
export type RenderedPage = { blob: Blob; name: string; page: number; width: number; height: number };

export async function renderPdfPages(file: File, options: RenderOptions, progress: ProgressHandler): Promise<RenderedPage[]> {
  progress(3, "Loading the renderer");
  const pdf = await openWithPdfJs(await file.arrayBuffer());
  const pageNumbers = options.pages?.length ? options.pages.filter((page) => page >= 1 && page <= pdf.numPages) : Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  if (!pageNumbers.length) throw new Error(`Enter pages between 1 and ${pdf.numPages}.`);
  const results: RenderedPage[] = [];
  const extension = options.format === "image/jpeg" ? "jpg" : options.format === "image/png" ? "png" : "webp";
  const stem = file.name.replace(/\.pdf$/i, "").replace(/[^a-z0-9-_]+/gi, "-") || "page";
  for (let index = 0; index < pageNumbers.length; index += 1) {
    const pageNumber = pageNumbers[index];
    progress(8 + Math.round((index / pageNumbers.length) * 88), `Rendering page ${pageNumber} of ${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    // PDF points are 72 per inch; browsers cap canvas sides near 16384 px.
    let scale = options.dpi / 72;
    const base = page.getViewport({ scale: 1 });
    const longest = Math.max(base.width, base.height) * scale;
    if (longest > 16000) scale *= 16000 / longest;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport, background: "#ffffff" }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, options.format, options.quality));
    if (!blob) throw new Error(`Page ${pageNumber} could not be exported by this browser.`);
    results.push({ blob, name: `${stem}-page-${String(pageNumber).padStart(3, "0")}.${extension}`, page: pageNumber, width: canvas.width, height: canvas.height });
    page.cleanup();
  }
  await pdf.loadingTask.destroy();
  progress(100, `${results.length} page${results.length === 1 ? "" : "s"} rendered`);
  return results;
}

export async function extractPdfText(file: File, progress: ProgressHandler): Promise<{ text: string; pages: number; empty: boolean }> {
  progress(3, "Loading the text engine");
  const pdf = await openWithPdfJs(await file.arrayBuffer());
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    progress(8 + Math.round((pageNumber / pdf.numPages) * 88), `Reading page ${pageNumber} of ${pdf.numPages}`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
      text += item.str;
      if (item.hasEOL) text += "\n";
      lastY = y;
    }
    chunks.push(text.replace(/[ \t]+\n/g, "\n").trim());
    page.cleanup();
  }
  const pages = pdf.numPages;
  await pdf.loadingTask.destroy();
  const text = chunks.map((chunk, index) => `--- Page ${index + 1} ---\n${chunk}`).join("\n\n");
  const empty = chunks.every((chunk) => !chunk);
  progress(100, empty ? "No text layer found — this looks like a scan" : "Text extracted");
  return { text, pages, empty };
}
