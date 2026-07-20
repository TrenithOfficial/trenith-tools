"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decodeImage, renderImage, sourceSize, resolveTargetSize, fitWithinCanvas,
  OUTPUT_FORMATS, formatMeta, extensionFor, pxToUnit, unitToPx, toPixelDim,
  type ImageSource, type ImageOutputFormat, type LengthUnit,
} from "../lib/image-engine";
import { trenithContactUrl } from "../lib/site";

type Crop = { x: number; y: number; width: number; height: number };
type DragMode = "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
const HANDLES: DragMode[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MAX_PREVIEW = 560;
const ASPECTS: { label: string; value: number | null }[] = [
  { label: "Free", value: null }, { label: "1:1", value: 1 }, { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 }, { label: "16:9", value: 16 / 9 }, { label: "9:16", value: 9 / 16 },
];

function stem(name: string) {
  return (name.replace(/\.[^./\\]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "image");
}

export function ImageEditor({ slug }: { slug: string }) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [fileName, setFileName] = useState("image");
  const [srcW, setSrcW] = useState(0);
  const [srcH, setSrcH] = useState(0);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 0, height: 0 });
  const [cropAspect, setCropAspect] = useState<number | null>(null);

  const [unit, setUnit] = useState<LengthUnit>("px");
  const [dpi, setDpi] = useState(300);
  const [resizeW, setResizeW] = useState("");
  const [resizeH, setResizeH] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const [allowUpscale, setAllowUpscale] = useState(false);

  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  const [format, setFormat] = useState<ImageOutputFormat>(slug === "image-converter" ? "image/png" : "image/jpeg");
  const [quality, setQuality] = useState(90);
  const [bg, setBg] = useState("#ffffff");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; filename: string; size: number; width: number; height: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; start: Crop } | null>(null);

  // Load a chosen file: decode, reset the crop to the whole image.
  const loadFile = useCallback(async (file: File) => {
    setError(""); setResult(null);
    try {
      const decoded = await decodeImage(file);
      const { width, height } = sourceSize(decoded);
      if (!width || !height) throw new Error("This image could not be decoded.");
      setSource(decoded); setFileName(stem(file.name));
      setSrcW(width); setSrcH(height);
      setCrop({ x: 0, y: 0, width, height });
      setResizeW(""); setResizeH(""); setRotate(0); setFlipH(false); setFlipV(false); setCropAspect(null);
    } catch {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (["heic", "heif", "tif", "tiff"].includes(ext)) {
        setError(`${ext.toUpperCase()} decoding is being added in the next update. For now use JPG, PNG, WebP, GIF, BMP or AVIF.`);
      } else {
        setError("This file could not be opened as an image. Try a JPG, PNG, WebP, GIF, BMP or AVIF.");
      }
      setSource(null);
    }
  }, []);

  // Paint the source into the preview canvas at a fitted display size.
  const displayScale = useMemo(() => (srcW ? Math.min(1, MAX_PREVIEW / srcW, MAX_PREVIEW / srcH) : 1), [srcW, srcH]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const dispW = Math.max(1, Math.round(srcW * displayScale));
    const dispH = Math.max(1, Math.round(srcH * displayScale));
    canvas.width = dispW; canvas.height = dispH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, dispW, dispH);
  }, [source, srcW, srcH, displayScale]);

  const clampCrop = useCallback((next: Crop): Crop => {
    let { x, y, width, height } = next;
    width = Math.max(8, Math.min(width, srcW));
    height = Math.max(8, Math.min(height, srcH));
    x = Math.max(0, Math.min(x, srcW - width));
    y = Math.max(0, Math.min(y, srcH - height));
    return { x, y, width, height };
  }, [srcW, srcH]);

  // Single non-curried handler (reads the handle from data-mode) so the ref write
  // happens in a real event handler, not a function invoked during render.
  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation();
    const mode = (event.currentTarget.dataset.mode || "move") as DragMode;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { mode, startX: event.clientX, startY: event.clientY, start: crop };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const { mode, startX, startY, start } = drag.current;
    const dx = (event.clientX - startX) / displayScale;
    const dy = (event.clientY - startY) / displayScale;
    const next = { ...start };
    if (mode === "move") { next.x = start.x + dx; next.y = start.y + dy; }
    else {
      if (mode.includes("w")) { next.x = start.x + dx; next.width = start.width - dx; }
      if (mode.includes("e")) { next.width = start.width + dx; }
      if (mode.includes("n")) { next.y = start.y + dy; next.height = start.height - dy; }
      if (mode.includes("s")) { next.height = start.height + dy; }
      if (cropAspect) next.height = next.width / cropAspect;
      if (next.width < 8) next.width = 8;
      if (next.height < 8) next.height = 8;
    }
    setCrop(clampCrop(next));
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (drag.current) (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    drag.current = null;
  };

  const applyCropAspect = (value: number | null) => {
    setCropAspect(value);
    if (value) setCrop((c) => clampCrop({ ...c, height: c.width / value }));
  };

  // Crop width/height edited numerically in the current unit.
  const cropUnit = (px: number, ref: number) => Number(pxToUnit(px, unit, dpi, ref).toFixed(unit === "px" ? 0 : 2));
  const setCropDim = (which: "width" | "height", raw: string) => {
    const ref = which === "width" ? srcW : srcH;
    const px = unit === "px" ? Number(raw) : unitToPx(Number(raw), unit, dpi, ref);
    if (!Number.isFinite(px)) return;
    setCrop((c) => {
      const next = { ...c, [which]: px } as Crop;
      if (cropAspect) { if (which === "width") next.height = px / cropAspect; else next.width = px * cropAspect; }
      return clampCrop(next);
    });
  };

  // Output size preview (after crop, resize, rotate).
  const outputSize = useMemo(() => {
    if (!srcW) return { width: 0, height: 0, clamped: false };
    const tw = resizeW ? unitToPx(Number(resizeW), unit, dpi, crop.width) : undefined;
    const th = resizeH ? unitToPx(Number(resizeH), unit, dpi, crop.height) : undefined;
    const wanted = resolveTargetSize(toPixelDim(crop.width), toPixelDim(crop.height), { width: tw, height: th, lockAspect, allowUpscale });
    const fitted = fitWithinCanvas(wanted.width, wanted.height);
    const swap = rotate === 90 || rotate === 270;
    return { width: swap ? fitted.height : fitted.width, height: swap ? fitted.width : fitted.height, clamped: fitted.clamped };
  }, [srcW, resizeW, resizeH, unit, dpi, crop.width, crop.height, lockAspect, allowUpscale, rotate]);

  const meta = formatMeta(format);

  const run = async () => {
    if (!source) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const tw = resizeW ? unitToPx(Number(resizeW), unit, dpi, crop.width) : undefined;
      const th = resizeH ? unitToPx(Number(resizeH), unit, dpi, crop.height) : undefined;
      const out = await renderImage(source, {
        crop, targetWidth: tw, targetHeight: th, lockAspect, allowUpscale,
        rotate, flipH, flipV, format, quality: quality / 100, background: bg,
      });
      const filename = `${fileName}-${out.width}x${out.height}.${extensionFor(format, out.type)}`;
      setResult({ url: URL.createObjectURL(out.blob), filename, size: out.blob.size, width: out.width, height: out.height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image could not be exported.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const dispW = Math.round(srcW * displayScale);
  const dispH = Math.round(srcH * displayScale);

  return (
    <div className="image-editor">
      <section className="workspace-panel editor-stage-panel">
        <div className="panel-heading-row"><div><span className="panel-label">EDIT</span><h2>{source ? "Crop, transform and export" : "Choose an image"}</h2></div>{source && <button className="text-button" onClick={() => { setSource(null); setResult(null); }}>Change image</button>}</div>
        {!source ? (
          <label className="editor-dropzone">
            <input type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif,.tif,.tiff" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
            <span className="editor-drop-icon" aria-hidden>⤓</span>
            <strong>Choose an image or drag one here</strong>
            <small>JPG, PNG, WebP, GIF, BMP, AVIF · processed on your device, never uploaded</small>
          </label>
        ) : (
          <div className="editor-stage" ref={stageRef} style={{ width: dispW, height: dispH }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
            <canvas ref={canvasRef} className="editor-canvas" />
            <div className="editor-crop" style={{ left: crop.x * displayScale, top: crop.y * displayScale, width: crop.width * displayScale, height: crop.height * displayScale }} data-mode="move" onPointerDown={beginDrag}>
              {HANDLES.map((h) => <span key={h} data-mode={h} className={`crop-handle handle-${h}`} onPointerDown={beginDrag} />)}
            </div>
          </div>
        )}
        {source && <p className="editor-source-note">Source: {srcW} × {srcH} px{displayScale < 1 ? ` · shown at ${Math.round(displayScale * 100)}%` : ""}</p>}
        {error && <div className="workspace-error" role="alert">{error}</div>}
      </section>

      <aside className="workspace-panel editor-controls">
        <span className="panel-label">SETTINGS</span>
        <div className="editor-unit-row">
          <label>Units<select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)}><option value="px">px</option><option value="in">inch</option><option value="cm">cm</option><option value="%">%</option></select></label>
          {(unit === "in" || unit === "cm") && <label>DPI<input type="number" min={1} max={2400} value={dpi} onChange={(e) => setDpi(Math.max(1, Number(e.target.value) || 1))} /></label>}
        </div>

        <fieldset className="editor-group" disabled={!source}>
          <legend>Crop</legend>
          <div className="editor-aspect-row">{ASPECTS.map((a) => <button key={a.label} type="button" className={cropAspect === a.value ? "chip active" : "chip"} onClick={() => applyCropAspect(a.value)}>{a.label}</button>)}</div>
          <div className="editor-dim-grid">
            <label>Width<input type="number" min={1} value={source ? cropUnit(crop.width, srcW) : ""} onChange={(e) => setCropDim("width", e.target.value)} /></label>
            <label>Height<input type="number" min={1} value={source ? cropUnit(crop.height, srcH) : ""} onChange={(e) => setCropDim("height", e.target.value)} /></label>
          </div>
          {source && <small className="editor-hint">Crop is {Math.round(crop.width)} × {Math.round(crop.height)} px{unit !== "px" ? ` (${cropUnit(crop.width, srcW)} × ${cropUnit(crop.height, srcH)} ${unit === "%" ? "%" : unit})` : ""}. <button type="button" className="text-button" onClick={() => setCrop({ x: 0, y: 0, width: srcW, height: srcH })}>Reset</button></small>}
        </fieldset>

        <fieldset className="editor-group" disabled={!source}>
          <legend>Transform</legend>
          <div className="editor-transform-row">
            <button type="button" className="chip" onClick={() => setRotate((r) => ((r + 270) % 360) as 0 | 90 | 180 | 270)}>⟲ 90°</button>
            <button type="button" className="chip" onClick={() => setRotate((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)}>⟳ 90°</button>
            <button type="button" className={flipH ? "chip active" : "chip"} onClick={() => setFlipH((v) => !v)}>Flip H</button>
            <button type="button" className={flipV ? "chip active" : "chip"} onClick={() => setFlipV((v) => !v)}>Flip V</button>
          </div>
        </fieldset>

        <fieldset className="editor-group" disabled={!source}>
          <legend>Resize output (optional)</legend>
          <div className="editor-dim-grid">
            <label>Width<input type="number" min={1} placeholder="auto" value={resizeW} onChange={(e) => { setResizeW(e.target.value); if (lockAspect) setResizeH(""); }} /></label>
            <label>Height<input type="number" min={1} placeholder="auto" value={resizeH} onChange={(e) => { setResizeH(e.target.value); if (lockAspect) setResizeW(""); }} /></label>
          </div>
          <label className="check-label"><input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} /><span>Lock aspect ratio</span></label>
          <label className="check-label"><input type="checkbox" checked={allowUpscale} onChange={(e) => setAllowUpscale(e.target.checked)} /><span>Allow upscaling (may soften)</span></label>
        </fieldset>

        <fieldset className="editor-group" disabled={!source}>
          <legend>Export</legend>
          <label>Format<select value={format} onChange={(e) => setFormat(e.target.value as ImageOutputFormat)}>{OUTPUT_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}{f.lossy ? "" : " · lossless"}</option>)}</select></label>
          {meta.lossy && <label>Quality · {quality}%<input type="range" min={30} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></label>}
          {meta.opaque && <label className="editor-bg-row">Background<input type="color" value={bg} onChange={(e) => setBg(e.target.value)} /><small>Used where the image is transparent</small></label>}
        </fieldset>

        {source && <p className="editor-output-line">Output: <strong>{outputSize.width} × {outputSize.height} px</strong> · {meta.label}{outputSize.clamped ? " · scaled to fit the max canvas" : ""}</p>}

        {result && (
          <div className="output-ready">
            <div><span>✓</span><div><strong>{result.filename}</strong><small>{result.width} × {result.height} · {(result.size / 1024 / 1024).toFixed(2)} MB</small></div></div>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview URL, next/image can't optimize it */}
            <img className="editor-result-preview" src={result.url} alt="Exported result preview" />
            <a className="workspace-download" href={result.url} download={result.filename}>Download <span>↓</span></a>
          </div>
        )}

        <button className="workspace-run" onClick={run} disabled={!source || busy}>{busy ? "Rendering…" : result ? "Export again" : "Export image"}<span>→</span></button>
        <small>Processed entirely in this browser tab. Nothing is uploaded, and closing the tab clears the image.</small>
        <div className="result-business-cta compact"><div><strong>Need image pipelines at scale?</strong><p>Trenith builds private media processing, automation and cloud systems.</p></div><a href={trenithContactUrl} target="_blank" rel="noreferrer">Talk to Trenith ↗</a></div>
      </aside>
    </div>
  );
}
