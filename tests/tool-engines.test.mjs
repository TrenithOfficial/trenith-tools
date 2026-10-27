import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { audioProfiles, defaultAudioOptions } from "../lib/audio-transcode.ts";
import { extractPdfPages, imagesToPdf, mergePdfFiles, parsePageSelection, splitPdfToZip, transformPdf } from "../lib/client-tools.ts";

const progress = () => undefined;

async function pdfFile(name, pages) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) document.addPage([200 + index, 300 + index]);
  return new File([await document.save()], name, { type: "application/pdf" });
}

test("page selection preserves requested direction, repeats and valid intersections", () => {
  assert.deepEqual(parsePageSelection("1-3,5,3", 6), [0, 1, 2, 4, 2]);
  assert.deepEqual(parsePageSelection("5-2", 5), [4, 3, 2, 1]);
  assert.deepEqual(parsePageSelection("10-20", 5), []);
  assert.deepEqual(parsePageSelection("10-3", 5), [4, 3, 2]);
  assert.deepEqual(parsePageSelection("0-3", 5), [0, 1, 2]);
});

test("PDF merge, extraction, transform and split engines create readable outputs", async () => {
  const one = await pdfFile("one.pdf", 2);
  const two = await pdfFile("two.pdf", 3);

  const merged = await mergePdfFiles([one, two], progress);
  assert.equal((await PDFDocument.load(await merged.arrayBuffer())).getPageCount(), 5);

  const extracted = await extractPdfPages(two, "3-1,2", progress);
  assert.equal((await PDFDocument.load(await extracted.arrayBuffer())).getPageCount(), 4);

  for (const mode of ["rotate", "number", "watermark", "compress"]) {
    const output = await transformPdf(one, mode, mode === "watermark" ? "TEST" : "", progress);
    assert.equal((await PDFDocument.load(await output.arrayBuffer())).getPageCount(), 2);
    assert.ok(output.size > 100);
  }

  const split = await splitPdfToZip(two, progress);
  const zip = await JSZip.loadAsync(await split.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files), ["page-001.pdf", "page-002.pdf", "page-003.pdf"]);
});

test("images-to-PDF engine creates one page per selected image", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXsAAAAASUVORK5CYII=", "base64");
  const output = await imagesToPdf([new File([png], "a.png", { type: "image/png" }), new File([png], "b.png", { type: "image/png" })], progress);
  assert.equal((await PDFDocument.load(await output.arrayBuffer())).getPageCount(), 2);
});

test("audio conversion profiles expose twelve concrete encoders", () => {
  assert.equal(Object.keys(audioProfiles).length, 12);
  assert.match(audioProfiles.mp3.args(192, defaultAudioOptions).join(" "), /libmp3lame/);
  assert.match(audioProfiles.opus.args(128, defaultAudioOptions).join(" "), /libopus/);
  assert.match(audioProfiles.m4a.args(192, defaultAudioOptions).join(" "), /\baac\b/);
  assert.match(audioProfiles.wma.args(128, defaultAudioOptions).join(" "), /wmav2/);
  assert.equal(audioProfiles.flac.lossless, true);
  assert.equal(audioProfiles.alac.extension, "m4a");
});

test("catalog publishes 56 unique tools including the video, PDF, SEO and Developer utilities", async () => {
  const { tools, categories } = await import("../lib/catalog.ts");
  assert.equal(tools.length, 56);
  assert.equal(new Set(tools.map((tool) => tool.slug)).size, 56);
  for (const slug of ["video-converter", "video-compressor", "video-trimmer", "video-to-audio", "video-to-gif", "pdf-to-image", "pdf-to-text"]) {
    const tool = tools.find((item) => item.slug === slug);
    assert.equal(tool?.kind, "device", `${slug} runs on-device`);
  }
  const serp = tools.find((tool) => tool.slug === "serp-snippet-preview");
  const density = tools.find((tool) => tool.slug === "keyword-density-analyzer");
  assert.equal(serp?.kind, "device");
  assert.equal(density?.kind, "device");
  assert.ok(categories.includes("SEO"));
  // The Developer utilities are on-device tools with no upload or key.
  for (const slug of ["password-generator", "hash-generator", "uuid-generator", "base64-encoder"]) {
    const tool = tools.find((item) => item.slug === slug);
    assert.equal(tool?.category, "Developer", `${slug} is a Developer tool`);
    assert.equal(tool?.kind, "device", `${slug} runs on-device`);
  }
  assert.ok(categories.includes("Developer"));
});

test("the packaged FFmpeg engine ships a chunk manifest that matches the chunks on disk", async () => {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const dir = new URL("../public/ffmpeg/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("ffmpeg-core.wasm.json", dir), "utf8"));
  const parts = (await readdir(dir)).filter((name) => /^ffmpeg-core\.wasm\.part\d+$/.test(name)).sort();
  assert.equal(parts.length, manifest.parts, "manifest part count matches the split output");
  assert.ok(parts.length >= 2, "the engine is split into several hosting-sized chunks");
  let bytes = 0;
  for (const name of parts) {
    const size = (await stat(new URL(name, dir))).size;
    assert.ok(size <= 25 * 1024 * 1024, `${name} stays under the 25 MiB hosting limit`);
    bytes += size;
  }
  assert.equal(bytes, manifest.bytes, "chunks reassemble to the full engine");
  assert.equal(manifest.chunkBytes, 16000000);
});

test("compatible endpoints: base URLs are completed, full URLs are kept", async () => {
  const { chatCompletionsUrl } = await import("../lib/byok.ts");
  assert.equal(chatCompletionsUrl("https://api.groq.com/openai/v1"), "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.example.com/v1/"), "https://api.example.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.example.com"), "https://api.example.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.example.com/v1/chat/completions"), "https://api.example.com/v1/chat/completions");
  assert.equal(chatCompletionsUrl("https://api.example.com/custom/generate"), "https://api.example.com/custom/generate");
  assert.equal(chatCompletionsUrl("not a url"), "not a url");
});
