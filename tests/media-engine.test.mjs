import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { concatCompatibility, parseFfmpegProbe, planRemux, primaryAudio, primaryVideo } from "../lib/media-probe.ts";
import { planAudioExtract, planVideoConversion, defaultVideoOptions, videoFilters, estimateEncodeMinutes } from "../lib/media-convert.ts";
import { audioFormatOrder, audioProfiles, buildAudioArgs, defaultAudioOptions } from "../lib/audio-transcode.ts";
import { describeFailure } from "../lib/media-engine.ts";
import { recompressPdfImages, sweepUnreachable } from "../lib/pdf-tools.ts";

const mp4Log = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in-1.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2avc1mp41
    title           : SecretTitle
    encoder         : Lavf60.16.100
  Duration: 00:02:30.04, start: 0.000000, bitrate: 2203 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 2071 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)
    Metadata:
      handler_name    : VideoHandler
      vendor_id       : [0][0][0][0]
  Stream #0:1[0x2](eng): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 127 kb/s (default)
    Metadata:
      handler_name    : SoundHandler`;

const mp3Log = `Input #0, mp3, from 'track.mp3':
  Metadata:
    title           : Song
  Duration: 00:03:12.52, start: 0.025057, bitrate: 192 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 192 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 600x600 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)`;

test("probe parser reads container, duration, streams, languages and attached pictures", () => {
  const probe = parseFfmpegProbe(mp4Log);
  assert.deepEqual(probe.formats, ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"]);
  assert.equal(probe.durationSeconds, 150.04);
  assert.equal(probe.bitrateKbps, 2203);
  assert.deepEqual(probe.metadataKeys, ["major_brand", "minor_version", "compatible_brands", "title", "encoder"]);
  const video = primaryVideo(probe);
  assert.equal(video.codec, "h264");
  assert.equal(video.profile, "High");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.fps, 29.97);
  assert.equal(video.pixelFormat, "yuv420p");
  assert.equal(video.language, undefined);
  const audio = primaryAudio(probe);
  assert.equal(audio.codec, "aac");
  assert.equal(audio.sampleRate, 48000);
  assert.equal(audio.channels, 2);
  assert.equal(audio.language, "eng");
  assert.equal(audio.isDefault, true);
  const music = parseFfmpegProbe(mp3Log);
  assert.equal(primaryVideo(music), undefined, "cover art is not a video stream");
  assert.equal(music.streams[1].attachedPic, true);
  assert.equal(primaryAudio(music).codec, "mp3");
});

test("remux planning copies streams only when every kept stream fits the container", () => {
  const probe = parseFfmpegProbe(mp4Log);
  assert.equal(planRemux(probe, "mp4", true).remux, true);
  assert.equal(planRemux(probe, "mov", true).remux, true);
  assert.equal(planRemux(probe, "mkv", true).remux, true);
  const webm = planRemux(probe, "webm", true);
  assert.equal(webm.remux, false);
  assert.match(webm.reasons.join(" "), /H264 video cannot be stored in WEBM/);
  assert.equal(planRemux(parseFfmpegProbe(mp3Log), "mp3", false).remux, true);
});

test("video conversion plans: lossless copy by default, encode when edits or containers require it", () => {
  const probe = parseFfmpegProbe(mp4Log);
  const copy = planVideoConversion({ name: "clip.mp4" }, probe, { ...defaultVideoOptions, container: "mkv" }, "IN", "OUT");
  assert.equal(copy.mode, "remux");
  assert.ok(copy.args.includes("copy") && !copy.args.includes("libx264"));
  assert.equal(copy.outputName, "clip.mkv");

  const encode = planVideoConversion({ name: "clip.mp4" }, probe, { ...defaultVideoOptions, container: "mp4", maxHeight: 720 }, "IN", "OUT");
  assert.equal(encode.mode, "encode");
  assert.ok(encode.args.includes("libx264") && encode.args.join(" ").includes("scale=-2:'min(ih,720)'"));
  assert.ok(encode.args.join(" ").includes("-crf 23"));
  assert.ok(encode.args.join(" ").includes("+faststart"));

  const webm = planVideoConversion({ name: "clip.mp4" }, probe, { ...defaultVideoOptions, container: "webm" }, "IN", "OUT");
  assert.ok(webm.args.includes("libvpx") && !webm.args.includes("libvpx-vp9") && webm.args.includes("libopus"), "WebM uses VP8: VP9 traps in the single-threaded wasm build");
  assert.ok(webm.args.join(" ").includes("-b:v 3600k"), `1080p balanced VP8 ceiling: ${webm.args.join(" ")}`);

  const sized = planVideoConversion({ name: "clip.mp4" }, probe, { ...defaultVideoOptions, container: "mp4", forceEncode: true, targetMb: 20 }, "IN", "OUT");
  const bitrateIndex = sized.args.indexOf("-b:v");
  assert.ok(bitrateIndex > 0, "target size uses a bitrate budget");
  const kbps = Number.parseInt(sized.args[bitrateIndex + 1], 10);
  assert.ok(kbps > 800 && kbps < 1200, `bitrate budget ${kbps} kbps for 20 MB over 150 s`);

  const trimmed = planVideoConversion({ name: "clip.mp4" }, probe, { ...defaultVideoOptions, container: "mp4", trimStart: 10, trimEnd: 25 }, "IN", "OUT");
  assert.equal(trimmed.mode, "remux");
  assert.deepEqual(trimmed.args.slice(0, 2), ["-ss", "10.000"]);
  assert.ok(trimmed.args.join(" ").includes("-t 15.000"), "input seek plus duration, never -to");
  assert.ok(trimmed.args.includes("make_zero"));

  const muted = planVideoConversion({ name: "clip.mp4" }, probe, { ...defaultVideoOptions, container: "mp4", mute: true }, "IN", "OUT");
  assert.ok(muted.args.includes("-an"));

  const gif = planVideoConversion({ name: "clip.mp4" }, probe, { ...defaultVideoOptions, container: "gif", gifFps: 15, gifWidth: 320 }, "IN", "OUT");
  assert.equal(gif.mode, "gif");
  assert.ok(gif.args.join(" ").includes("palettegen") && gif.args.join(" ").includes("fps=15") && gif.args.join(" ").includes("min(iw,320)"));

  const blind = planVideoConversion({ name: "clip.avi" }, null, { ...defaultVideoOptions, container: "mp4" }, "IN", "OUT");
  assert.equal(blind.mode, "encode", "no probe means no lossless promise");
});

test("video filters never upscale and rotate before scaling", () => {
  assert.deepEqual(videoFilters({ ...defaultVideoOptions, maxHeight: 1080 }, { width: 1280, height: 720 }), []);
  assert.deepEqual(videoFilters({ ...defaultVideoOptions, maxHeight: 720 }, { width: 1920, height: 1080 }), ["scale=-2:'min(ih,720)'"]);
  assert.deepEqual(videoFilters({ ...defaultVideoOptions, rotate: 90, maxHeight: 1080 }, { width: 1920, height: 1080 }), ["transpose=1", "scale=-2:'min(ih,1080)'"]);
  assert.deepEqual(videoFilters({ ...defaultVideoOptions, maxFps: 30 }), ["fps=fps='min(source_fps,30)'"]);
  assert.ok(estimateEncodeMinutes(600, 1080, "mp4", "balanced") > estimateEncodeMinutes(600, 480, "mp4", "balanced"));
});

test("audio extraction copies matching codecs bit-for-bit and encodes the rest", () => {
  const probe = parseFfmpegProbe(mp4Log);
  const copy = planAudioExtract(probe, "m4a", 192, "IN", "OUT");
  assert.equal(copy.lossless, true);
  assert.ok(copy.args.join(" ").includes("-c:a copy"));
  const mp3 = planAudioExtract(probe, "mp3", 192, "IN", "OUT");
  assert.equal(mp3.lossless, false);
  assert.ok(mp3.args.includes("libmp3lame"));
  assert.equal(planAudioExtract(probe, "flac", 192, "IN", "OUT").lossless, true);
});

test("lossless concatenation requires identical codec parameters", () => {
  const a = parseFfmpegProbe(mp4Log);
  const b = parseFfmpegProbe(mp4Log.replace("1920x1080", "1280x720"));
  assert.equal(concatCompatibility([a, a]).compatible, true);
  const mismatch = concatCompatibility([a, b]);
  assert.equal(mismatch.compatible, false);
  assert.match(mismatch.reason, /Clip 2/);
  assert.equal(concatCompatibility([a]).compatible, false);
});

test("audio profiles cover twelve encoders and the argument builder honours every option", () => {
  assert.deepEqual(audioFormatOrder, ["mp3", "m4a", "wav", "flac", "alac", "aiff", "ogg", "opus", "webm", "wv", "ac3", "wma"]);
  assert.equal(Object.keys(audioProfiles).length, 12);
  assert.match(audioProfiles.mp3.args(192, defaultAudioOptions).join(" "), /libmp3lame/);
  assert.match(audioProfiles.alac.args(0, defaultAudioOptions).join(" "), /\balac\b/);
  assert.match(audioProfiles.wav.args(0, { ...defaultAudioOptions, bitDepth: 24 }).join(" "), /pcm_s24le/);
  assert.match(audioProfiles.wav.args(0, { ...defaultAudioOptions, bitDepth: 32 }).join(" "), /pcm_f32le/);
  assert.match(audioProfiles.aiff.args(0, defaultAudioOptions).join(" "), /pcm_s16be/);
  assert.equal(audioProfiles.flac.lossless, true);
  const args = buildAudioArgs("mp3", 256, { sampleRate: 48000, channels: 1, bitDepth: 16, keepTags: true }, "IN", "OUT", { hasCoverArt: true });
  assert.ok(args.join(" ").includes("-map 0:v:0 -c:v copy -disposition:v:0 attached_pic"), "cover art carried into MP3");
  assert.ok(args.join(" ").includes("-ar 48000") && args.join(" ").includes("-ac 1"));
  assert.ok(!args.includes("-map_metadata"), "tags kept by default");
  const stripped = buildAudioArgs("opus", 128, { ...defaultAudioOptions, keepTags: false }, "IN", "OUT", { hasCoverArt: true });
  assert.ok(stripped.join(" ").includes("-map_metadata -1") && stripped.includes("-vn"), "Opus cannot carry a picture and tags were refused");
  const trimmed = buildAudioArgs("flac", 0, defaultAudioOptions, "IN", "OUT", { trimStart: 5, trimEnd: 12.5, filters: ["volume=1.500"] });
  assert.deepEqual(trimmed.slice(0, 5), ["-ss", "5.000", "-i", "IN", "-t"]);
  assert.equal(trimmed[5], "7.500");
  assert.ok(trimmed.join(" ").includes("-af volume=1.500"));
});

test("engine failures are explained in plain language", () => {
  assert.match(describeFailure("x\n[mov,mp4] moov atom not found\nin.mp4: Invalid data found when processing input"), /could not be read/);
  assert.match(describeFailure("Unknown encoder 'libfdk_aac'"), /encoder is not available/);
  assert.match(describeFailure("[mp4 @ 0x1] Could not find tag for codec subrip in stream #2"), /without re-encoding/);
});

test("PDF image recompression replaces eligible images, keeps masks intact and sweeps orphans", async () => {
  const draft = await PDFDocument.create();
  const page = draft.addPage([400, 400]);
  // A 300x300 RGB Flate image (eligible) drawn on the page.
  const width = 300; const height = 300;
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < rgb.length; index += 1) rgb[index] = (index * 7) % 256;
  const image = await draft.embedPng(await pngFromRgb(rgb, width, height));
  page.drawImage(image, { x: 20, y: 20, width: 200, height: 200 });
  // An ineligible 1-bit stencil mask stays untouched.
  const stencil = draft.context.register(PDFRawStream.of(draft.context.obj({ Type: "XObject", Subtype: "Image", Width: 8, Height: 8, ImageMask: true, Filter: "FlateDecode" }), new Uint8Array([120, 156, 99, 96, 0, 0, 0, 2, 0, 1])));
  page.node.Resources().lookup(PDFName.of("XObject")).set(PDFName.of("Im9"), stencil);
  draft.context.register(draft.context.obj({ Orphan: "yes" }));
  // Images are embedded on save; reload so the test exercises the real
  // "parsed from a file" path with raw streams.
  const document = await PDFDocument.load(await draft.save({ useObjectStreams: false }), { updateMetadata: false });
  const before = document.context.enumerateIndirectObjects().length;

  let encodedCalls = 0;
  const stubEncoder = async (source, w, h, quality, targetW, targetH) => { encodedCalls += 1; return { bytes: new Uint8Array(500), width: targetW, height: targetH }; };
  const result = await recompressPdfImages(document, { quality: 0.7, maxPixels: 150 }, () => undefined, stubEncoder);
  assert.equal(encodedCalls, 1, "only the eligible RGB image was encoded");
  assert.equal(result.touched, 1);
  assert.ok(result.skipped >= 1, "the stencil mask was skipped");
  const replaced = document.context.enumerateIndirectObjects().find(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Filter")) === PDFName.of("DCTDecode"));
  assert.ok(replaced, "replacement stream uses DCTDecode");
  assert.equal(replaced[1].dict.get(PDFName.of("Width")).asNumber(), 150, "downscaled to the pixel cap");
  assert.equal(replaced[1].dict.get(PDFName.of("ColorSpace")), PDFName.of("DeviceRGB"));
  const swept = await sweepUnreachable(document);
  assert.ok(swept >= 1, "orphaned dictionary removed");
  assert.ok(document.context.enumerateIndirectObjects().length < before);
  const saved = await document.save();
  assert.equal((await PDFDocument.load(saved)).getPageCount(), 1);
});

// Minimal PNG writer (no deps) so the test can embed a real RGB image.
async function pngFromRgb(rgb, width, height) {
  const { deflateSync } = await import("node:zlib");
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) { raw[y * (width * 3 + 1)] = 0; rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((value, index) => { raw[y * (width * 3 + 1) + 1 + index] = value; }); }
  const chunk = (type, data) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const typed = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(typed) >>> 0); return Buffer.concat([length, typed, crc]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return crc ^ -1;
}

test("engine jobs run one at a time even when callers fire them concurrently", async () => {
  const { serializeEngineJob } = await import("../lib/media-engine.ts");
  const order = [];
  const job = (name, ms) => serializeEngineJob(async () => { order.push(`${name}:start`); await new Promise((resolve) => setTimeout(resolve, ms)); order.push(`${name}:end`); return name; });
  const results = await Promise.all([job("a", 30), job("b", 5), job("c", 1)]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.deepEqual(order, ["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  await assert.rejects(serializeEngineJob(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await serializeEngineJob(async () => "after-failure"), "after-failure", "a failed job does not block the queue");
});
