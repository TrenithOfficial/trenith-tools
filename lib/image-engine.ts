// On-device image engine for the editor and the resize/convert/compress tools.
// Everything runs in the browser tab — no upload — and aims for quality: crops
// exactly, resamples in halving steps for crisp downscales, flattens
// transparency only when the target format needs it, and never silently mislabels
// bytes. The pure helpers (unit math, BMP/ICO encoders, size math) carry no DOM
// dependency so they are unit-tested directly in Node.

export type ImageOutputFormat =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif"
  | "image/bmp"
  | "image/x-icon"
  | "image/gif";

export type LengthUnit = "px" | "in" | "cm" | "%";

export const OUTPUT_FORMATS: { value: ImageOutputFormat; label: string; ext: string; lossy: boolean; opaque: boolean; native: boolean }[] = [
  { value: "image/jpeg", label: "JPG", ext: "jpg", lossy: true, opaque: true, native: true },
  { value: "image/png", label: "PNG", ext: "png", lossy: false, opaque: false, native: true },
  { value: "image/webp", label: "WebP", ext: "webp", lossy: true, opaque: false, native: true },
  { value: "image/avif", label: "AVIF", ext: "avif", lossy: true, opaque: false, native: true },
  { value: "image/bmp", label: "BMP", ext: "bmp", lossy: false, opaque: true, native: false },
  { value: "image/x-icon", label: "ICO", ext: "ico", lossy: false, opaque: false, native: false },
  { value: "image/gif", label: "GIF", ext: "gif", lossy: false, opaque: true, native: false },
];

export function formatMeta(format: ImageOutputFormat) {
  return OUTPUT_FORMATS.find((f) => f.value === format) ?? OUTPUT_FORMATS[0];
}

// --- Unit / DPI math (pure) -------------------------------------------------

const CM_PER_INCH = 2.54;

// Convert a length in `unit` to pixels. Inches/cm need the DPI; percent needs a
// reference (the source dimension). px passes through.
export function unitToPx(value: number, unit: LengthUnit, dpi: number, referencePx: number): number {
  if (!Number.isFinite(value)) return NaN;
  switch (unit) {
    case "px": return value;
    case "in": return value * dpi;
    case "cm": return (value / CM_PER_INCH) * dpi;
    case "%": return (value / 100) * referencePx;
  }
}

export function pxToUnit(px: number, unit: LengthUnit, dpi: number, referencePx: number): number {
  switch (unit) {
    case "px": return px;
    case "in": return px / dpi;
    case "cm": return (px / dpi) * CM_PER_INCH;
    case "%": return referencePx ? (px / referencePx) * 100 : 0;
  }
}

// Round to whole pixels, never below 1. Used everywhere a canvas dimension is set.
export function toPixelDim(px: number): number {
  return Math.max(1, Math.round(px));
}

// --- Size math (pure) -------------------------------------------------------

// Browsers cap canvas dimensions (and total area). Staying well under the common
// limits keeps exports from silently returning a null blob on huge images.
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 16384 * 16384;

export interface FitResult { width: number; height: number; scale: number; clamped: boolean }

// Fit (width,height) inside the canvas limits, preserving aspect. Returns the
// possibly-reduced size and whether a clamp happened (so the UI can say so).
export function fitWithinCanvas(width: number, height: number): FitResult {
  let scale = 1;
  scale = Math.min(scale, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  const area = width * height;
  if (area * scale * scale > MAX_CANVAS_AREA) scale = Math.min(scale, Math.sqrt(MAX_CANVAS_AREA / area));
  const clamped = scale < 1;
  return { width: toPixelDim(width * scale), height: toPixelDim(height * scale), scale, clamped };
}

// Resolve the requested output size from optional width/height + aspect lock.
// Missing dimension is derived from the source aspect; upscaling is refused
// unless explicitly allowed so quality is never invented.
export function resolveTargetSize(
  srcW: number,
  srcH: number,
  opts: { width?: number; height?: number; lockAspect?: boolean; allowUpscale?: boolean },
): { width: number; height: number } {
  const aspect = srcW / srcH;
  let w = opts.width && opts.width > 0 ? opts.width : undefined;
  let h = opts.height && opts.height > 0 ? opts.height : undefined;
  if (opts.lockAspect !== false) {
    if (w && !h) h = w / aspect;
    else if (h && !w) w = h * aspect;
    else if (w && h) h = w / aspect; // width wins when both given under aspect lock
  }
  if (!w && !h) { w = srcW; h = srcH; }
  else if (w && !h) h = w / aspect;
  else if (h && !w) w = h * aspect;
  let outW = toPixelDim(w!);
  let outH = toPixelDim(h!);
  if (!opts.allowUpscale) {
    const shrink = Math.min(1, srcW / outW, srcH / outH);
    outW = toPixelDim(outW * shrink);
    outH = toPixelDim(outH * shrink);
  }
  return { width: outW, height: outH };
}

// The sequence of intermediate sizes for a high-quality downscale: halve the
// longer side each step until within 2x of the target, then the caller does the
// final draw. Progressive halving avoids the aliasing a single big downscale
// causes. Returns [] when no stepping is needed (upscale or already close).
export function downscaleSteps(fromW: number, fromH: number, toW: number, toH: number): Array<{ width: number; height: number }> {
  const steps: Array<{ width: number; height: number }> = [];
  let w = fromW;
  let h = fromH;
  if (toW >= w && toH >= h) return steps;
  while (w > toW * 2 && h > toH * 2) {
    w = Math.max(toW, Math.floor(w / 2));
    h = Math.max(toH, Math.floor(h / 2));
    steps.push({ width: w, height: h });
  }
  return steps;
}

// --- Dependency-free encoders (pure) ---------------------------------------

// 24-bit BMP from RGBA pixels. BMP has no alpha in the common 24-bit form, so a
// background is composited in first (done by the caller for opaque formats).
// Rows are bottom-up and padded to a 4-byte boundary — the two facts a
// hand-rolled BMP most often gets wrong.
export function encodeBmp(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const rowSize = width * 3;
  const padding = (4 - (rowSize % 4)) % 4;
  const pixelArraySize = (rowSize + padding) * height;
  const fileSize = 54 + pixelArraySize;
  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);
  // BITMAPFILEHEADER
  out[0] = 0x42; out[1] = 0x4d;                 // "BM"
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);                 // pixel data offset
  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);              // positive = bottom-up
  view.setUint16(26, 1, true);                  // planes
  view.setUint16(28, 24, true);                 // bits per pixel
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);                // 72 DPI in px/m
  view.setInt32(42, 2835, true);
  let offset = 54;
  for (let y = height - 1; y >= 0; y -= 1) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + x * 4;
      out[offset++] = rgba[p + 2]; // B
      out[offset++] = rgba[p + 1]; // G
      out[offset++] = rgba[p];     // R
    }
    for (let pad = 0; pad < padding; pad += 1) out[offset++] = 0;
  }
  return out;
}

// ICO wrapping a PNG payload. Modern Windows reads PNG-in-ICO, so this stays
// small and keeps alpha. ICO dimensions max out at 256 (stored as 0).
export function encodeIcoFromPng(pngBytes: Uint8Array, width: number, height: number): Uint8Array {
  const header = new Uint8Array(6 + 16);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0, true);   // reserved
  view.setUint16(2, 1, true);   // type: icon
  view.setUint16(4, 1, true);   // image count
  header[6] = width >= 256 ? 0 : width;
  header[7] = height >= 256 ? 0 : height;
  header[8] = 0;                // palette
  header[9] = 0;                // reserved
  view.setUint16(10, 1, true);  // color planes
  view.setUint16(12, 32, true); // bits per pixel
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, 6 + 16, true); // offset to image data
  const out = new Uint8Array(header.length + pngBytes.length);
  out.set(header, 0);
  out.set(pngBytes, header.length);
  return out;
}

export function extensionFor(format: ImageOutputFormat, actualType?: string): string {
  // Trust what the browser actually encoded when it differs (e.g. it fell back to
  // PNG because it lacks a WebP/AVIF encoder), so bytes are never mislabeled.
  if (actualType && actualType.startsWith("image/")) {
    const known = OUTPUT_FORMATS.find((f) => f.value === actualType);
    if (known) return known.ext;
  }
  return formatMeta(format).ext;
}

// --- Browser rendering (DOM only inside these functions) --------------------

export type ImageSource = ImageBitmap | HTMLImageElement;

// Sniff the container by magic bytes (not filename, so it works for any Blob) to
// route HEIC/HEIF and TIFF — which browsers can't decode natively, except Safari
// for HEIC — to the on-demand decoders.
async function sniffContainer(file: Blob): Promise<"heic" | "tiff" | "native"> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) ||
      (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a)) return "tiff";
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) { // "ftyp"
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif"].includes(brand)) return "heic";
  }
  return "native";
}

async function decodeTiff(file: Blob): Promise<ImageSource> {
  const buffer = await file.arrayBuffer();
  const mod = await import("utif2");
  const UTIF = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error("This TIFF file has no readable image.");
  UTIF.decodeImage(buffer, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const width = ifds[0].width;
  const height = ifds[0].height;
  if (!width || !height) throw new Error("This TIFF file could not be decoded.");
  const pixels = new Uint8ClampedArray(rgba); // copy into an ArrayBuffer-backed clamped array
  return await createImageBitmap(new ImageData(pixels, width, height));
}

// Decode a file to a drawable source. createImageBitmap decodes off the render
// pipeline (keeps working in a backgrounded tab) and applies EXIF orientation so
// phone photos come out upright; the element decoder is the fallback. HEIC and
// TIFF are handled by decoders loaded on demand, so their weight only ships when
// such a file is actually opened.
export async function decodeImage(file: Blob): Promise<ImageSource> {
  const container = await sniffContainer(file);
  if (container === "heic") {
    // libheif's libde265 HEVC decoder (LGPL); decode only. The /csp entry avoids
    // relying on unsafe-eval so it works under the site's Content-Security-Policy.
    const { heicTo } = await import("heic-to/csp");
    return await heicTo({ blob: file, type: "bitmap" });
  }
  if (container === "tiff") return await decodeTiff(file);

  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall through to the element decoder */ }
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

export function sourceSize(source: ImageSource): { width: number; height: number } {
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  return { width, height };
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is unavailable in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export interface RenderOps {
  crop?: { x: number; y: number; width: number; height: number };
  targetWidth?: number;
  targetHeight?: number;
  lockAspect?: boolean;
  allowUpscale?: boolean;
  rotate?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  format: ImageOutputFormat;
  quality?: number; // 0..1 for lossy formats
  background?: string; // flatten transparency for opaque formats
}

export interface RenderResult { blob: Blob; width: number; height: number; type: string; clamped: boolean }

// The gifenc surface used by the GIF encode path (the package ships no types).
type GifencModule = {
  quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): number[][];
  applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][]): Uint8Array;
  GIFEncoder(): { writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: number[][] }): void; finish(): void; bytes(): Uint8Array };
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The browser could not export this image."))), type, quality));
}

async function encodeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, format: ImageOutputFormat, quality: number): Promise<{ blob: Blob; type: string }> {
  if (format === "image/bmp") {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { blob: new Blob([encodeBmp(data.data, canvas.width, canvas.height) as BlobPart], { type: "image/bmp" }), type: "image/bmp" };
  }
  if (format === "image/x-icon") {
    if (canvas.width > 256 || canvas.height > 256) throw new Error("ICO icons are limited to 256×256 — set a smaller size first.");
    const png = await canvasToBlob(canvas, "image/png", 1);
    const ico = encodeIcoFromPng(new Uint8Array(await png.arrayBuffer()), canvas.width, canvas.height);
    return { blob: new Blob([ico as BlobPart], { type: "image/x-icon" }), type: "image/x-icon" };
  }
  if (format === "image/gif") {
    // GIF is 256-colour indexed. The canvas is already background-flattened (GIF
    // is an opaque format here), so 3-channel quantization is enough.
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // gifenc ships no type declarations; type the small surface we use locally.
    // @ts-expect-error gifenc has no bundled type declarations
    const mod = (await import("gifenc")) as GifencModule & { default?: GifencModule };
    // Prefer the named exports (the ESM build the bundler picks); only fall back
    // to `default` when an interop layer nested them there.
    const lib = (mod as { GIFEncoder?: unknown }).GIFEncoder ? mod : mod.default!;
    const { GIFEncoder, quantize, applyPalette } = lib;
    const palette = quantize(data.data, 256);
    const index = applyPalette(data.data, palette);
    const gif = GIFEncoder();
    gif.writeFrame(index, canvas.width, canvas.height, { palette });
    gif.finish();
    return { blob: new Blob([gif.bytes() as BlobPart], { type: "image/gif" }), type: "image/gif" };
  }
  const blob = await canvasToBlob(canvas, format, quality);
  // toBlob silently falls back to PNG when it can't encode the type (older Safari
  // for AVIF/WebP). Surface that instead of handing back a mislabeled file.
  if ((format === "image/avif" || format === "image/webp") && blob.type !== format) {
    throw new Error(`${formatMeta(format).label} isn't supported by this browser — try WebP, PNG or JPG.`);
  }
  return { blob, type: blob.type || format };
}

// Full pipeline: crop → high-quality stepped resample → rotate/flip → encode.
export async function renderImage(source: ImageSource, ops: RenderOps): Promise<RenderResult> {
  const { width: srcW, height: srcH } = sourceSize(source);
  if (!srcW || !srcH) throw new Error("This image could not be decoded by the browser.");

  const crop = ops.crop ?? { x: 0, y: 0, width: srcW, height: srcH };
  const cx = Math.max(0, Math.min(crop.x, srcW - 1));
  const cy = Math.max(0, Math.min(crop.y, srcH - 1));
  const cw = Math.max(1, Math.min(crop.width, srcW - cx));
  const ch = Math.max(1, Math.min(crop.height, srcH - cy));

  const wanted = resolveTargetSize(cw, ch, { width: ops.targetWidth, height: ops.targetHeight, lockAspect: ops.lockAspect, allowUpscale: ops.allowUpscale });
  const fitted = fitWithinCanvas(wanted.width, wanted.height);

  // Draw the crop region 1:1 into a working canvas, then halve toward the target.
  let work = makeCanvas(toPixelDim(cw), toPixelDim(ch));
  context2d(work).drawImage(source, cx, cy, cw, ch, 0, 0, work.width, work.height);
  for (const step of downscaleSteps(work.width, work.height, fitted.width, fitted.height)) {
    const next = makeCanvas(step.width, step.height);
    context2d(next).drawImage(work, 0, 0, work.width, work.height, 0, 0, step.width, step.height);
    work = next;
  }

  const resized = makeCanvas(fitted.width, fitted.height);
  context2d(resized).drawImage(work, 0, 0, work.width, work.height, 0, 0, fitted.width, fitted.height);

  const rotate = ((((ops.rotate ?? 0) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const swap = rotate === 90 || rotate === 270;
  const outW = swap ? fitted.height : fitted.width;
  const outH = swap ? fitted.width : fitted.height;
  const out = makeCanvas(outW, outH);
  const octx = context2d(out);
  if (formatMeta(ops.format).opaque) { octx.fillStyle = ops.background || "#ffffff"; octx.fillRect(0, 0, outW, outH); }
  octx.save();
  octx.translate(outW / 2, outH / 2);
  octx.rotate((rotate * Math.PI) / 180);
  octx.scale(ops.flipH ? -1 : 1, ops.flipV ? -1 : 1);
  octx.drawImage(resized, -fitted.width / 2, -fitted.height / 2);
  octx.restore();

  const encoded = await encodeCanvas(out, octx, ops.format, ops.quality ?? 0.9);
  return { blob: encoded.blob, width: outW, height: outH, type: encoded.type, clamped: fitted.clamped };
}
