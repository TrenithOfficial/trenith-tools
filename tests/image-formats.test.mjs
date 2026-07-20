import { test } from "node:test";
import assert from "node:assert/strict";
import UTIF from "utif2";
import gifencMod from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifencMod;

// Pin the exact third-party API the image engine's decodeTiff / GIF encode paths
// call, so a dependency bump that changes those shapes fails here rather than in
// the browser. (HEIC uses WASM + File and is verified in the browser instead.)

test("utif2 round-trips RGBA through TIFF (decode/decodeImage/toRGBA8)", () => {
  const w = 4, h = 3;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { rgba[i * 4] = i * 10; rgba[i * 4 + 1] = 255 - i * 10; rgba[i * 4 + 2] = 128; rgba[i * 4 + 3] = 255; }
  const tiff = UTIF.encodeImage(rgba, w, h);
  const ifds = UTIF.decode(tiff);
  assert.ok(ifds.length >= 1, "at least one IFD");
  UTIF.decodeImage(tiff, ifds[0]);
  assert.equal(ifds[0].width, w);
  assert.equal(ifds[0].height, h);
  const out = UTIF.toRGBA8(ifds[0]);
  assert.equal(out.length, w * h * 4);
  assert.equal(out[0], 0);   // first pixel R
  assert.equal(out[1], 255); // first pixel G
});

test("gifenc encodes a valid GIF from RGBA (quantize/applyPalette/writeFrame)", () => {
  const w = 8, h = 8;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) { rgba[i * 4] = i % 2 ? 255 : 0; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 0; rgba[i * 4 + 3] = 255; }
  const palette = quantize(rgba, 256);
  const index = applyPalette(rgba, palette);
  const gif = GIFEncoder();
  gif.writeFrame(index, w, h, { palette });
  gif.finish();
  const bytes = gif.bytes();
  const magic = String.fromCharCode(...bytes.slice(0, 6));
  assert.ok(magic === "GIF89a" || magic === "GIF87a", `GIF magic was ${magic}`);
  assert.ok(bytes.length > 20 && bytes[bytes.length - 1] === 0x3b, "ends with GIF trailer 0x3b");
});
