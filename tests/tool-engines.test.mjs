import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { audioProfiles } from "../lib/audio-transcode.ts";
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

test("audio conversion profiles expose six concrete encoders", () => {
  assert.deepEqual(Object.keys(audioProfiles), ["mp3", "wav", "flac", "ogg", "opus", "m4a"]);
  assert.match(audioProfiles.mp3.args(192).join(" "), /libmp3lame/);
  assert.match(audioProfiles.opus.args(128).join(" "), /libopus/);
  assert.match(audioProfiles.m4a.args(192).join(" "), /\baac\b/);
  assert.equal(audioProfiles.flac.lossless, true);
});

test("catalog publishes 48 unique tools including the free SEO and Developer utilities", async () => {
  const { tools, categories } = await import("../lib/catalog.ts");
  assert.equal(tools.length, 48);
  assert.equal(new Set(tools.map((tool) => tool.slug)).size, 48);
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
