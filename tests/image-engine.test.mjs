import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unitToPx, pxToUnit, toPixelDim, fitWithinCanvas, resolveTargetSize,
  downscaleSteps, encodeBmp, encodeIcoFromPng, extensionFor, MAX_CANVAS_SIDE,
} from "../lib/image-engine.ts";

test("unit ↔ px conversion honours DPI and percent reference", () => {
  assert.equal(unitToPx(100, "px", 300, 4000), 100);
  assert.equal(unitToPx(2, "in", 300, 0), 600);
  assert.equal(unitToPx(2.54, "cm", 300, 0), 300);   // 1 inch
  assert.equal(unitToPx(50, "%", 96, 4000), 2000);
  assert.equal(pxToUnit(600, "in", 300, 0), 2);
  assert.equal(Math.round(pxToUnit(300, "cm", 300, 0) * 100) / 100, 2.54);
  assert.equal(pxToUnit(1000, "%", 96, 4000), 25);
});

test("toPixelDim never drops below 1 and rounds", () => {
  assert.equal(toPixelDim(0.2), 1);
  assert.equal(toPixelDim(10.6), 11);
});

test("fitWithinCanvas clamps oversized images, passes normal ones", () => {
  const ok = fitWithinCanvas(4000, 3000);
  assert.equal(ok.clamped, false);
  assert.equal(ok.width, 4000);
  const big = fitWithinCanvas(40000, 20000);
  assert.equal(big.clamped, true);
  assert.ok(big.width <= MAX_CANVAS_SIDE && big.height <= MAX_CANVAS_SIDE);
  assert.ok(Math.abs(big.width / big.height - 2) < 0.01, "aspect preserved");
});

test("resolveTargetSize derives the missing side and refuses upscaling by default", () => {
  // width only, aspect-locked → height derived
  assert.deepEqual(resolveTargetSize(4000, 2000, { width: 1000 }), { width: 1000, height: 500 });
  // both given, aspect lock → width wins, height corrected
  assert.deepEqual(resolveTargetSize(4000, 2000, { width: 1000, height: 999, lockAspect: true }), { width: 1000, height: 500 });
  // asking bigger than source without allowUpscale → clamped down to source
  assert.deepEqual(resolveTargetSize(800, 600, { width: 1600, lockAspect: false }), { width: 800, height: 600 });
  // upscaling allowed
  assert.deepEqual(resolveTargetSize(800, 600, { width: 1600, allowUpscale: true }), { width: 1600, height: 1200 });
});

test("downscaleSteps halves toward the target, empty when not downscaling", () => {
  assert.deepEqual(downscaleSteps(4000, 4000, 4000, 4000), []);
  assert.deepEqual(downscaleSteps(500, 500, 1000, 1000), []); // upscale → no steps
  const steps = downscaleSteps(4000, 4000, 500, 500);
  assert.ok(steps.length >= 2, "multiple halving steps for a big reduction");
  for (let i = 1; i < steps.length; i += 1) assert.ok(steps[i].width < steps[i - 1].width);
  const last = steps[steps.length - 1];
  assert.ok(last.width <= 1000 && last.width >= 500, "stops within 2x of target");
});

test("encodeBmp writes a valid 24-bit bottom-up BMP", () => {
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255, // row0: red, green
    0, 0, 255, 255, 255, 255, 255, 255, // row1: blue, white
  ]);
  const bmp = encodeBmp(rgba, 2, 2);
  assert.equal(bmp[0], 0x42); assert.equal(bmp[1], 0x4d); // "BM"
  const view = new DataView(bmp.buffer);
  assert.equal(view.getUint32(10, true), 54);   // pixel offset
  assert.equal(view.getInt32(18, true), 2);      // width
  assert.equal(view.getInt32(22, true), 2);      // height
  assert.equal(view.getUint16(28, true), 24);    // bpp
  // row size = 2*3=6, padded to 8; file = 54 + 8*2 = 70
  assert.equal(bmp.length, 70);
  // bottom-up: first stored row is source row1 (blue,white). Blue pixel as BGR:
  assert.equal(bmp[54], 255); assert.equal(bmp[55], 0); assert.equal(bmp[56], 0);
});

test("encodeIcoFromPng wraps PNG bytes with a valid ICO header", () => {
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
  const ico = encodeIcoFromPng(png, 32, 32);
  const view = new DataView(ico.buffer);
  assert.equal(view.getUint16(0, true), 0); // reserved
  assert.equal(view.getUint16(2, true), 1); // type icon
  assert.equal(view.getUint16(4, true), 1); // count
  assert.equal(ico[6], 32); assert.equal(ico[7], 32);
  assert.equal(view.getUint32(14, true), png.length);
  assert.equal(view.getUint32(18, true), 22); // data offset
  assert.equal(ico.length, 22 + png.length);
  assert.deepEqual(ico.slice(22), png);
  // 256 is stored as 0 in the byte fields
  const big = encodeIcoFromPng(png, 256, 256);
  assert.equal(big[6], 0); assert.equal(big[7], 0);
});

test("extensionFor trusts the actually-encoded type over the request", () => {
  assert.equal(extensionFor("image/webp", "image/png"), "png"); // browser fell back
  assert.equal(extensionFor("image/jpeg"), "jpg");
  assert.equal(extensionFor("image/x-icon"), "ico");
});
