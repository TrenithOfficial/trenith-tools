import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { cleanerFor, stripOoxmlMetadata, stripPdfMetadata, stripWithExiftool } from "../lib/metadata-clean.ts";

const wasmBytesPromise = readFile(new URL("../public/zeroperl.wasm", import.meta.url));
const wasmFetch = async () => new Response(await wasmBytesPromise, { headers: { "content-type": "application/wasm" } });

const operationalGroups = new Set(["ExifTool", "File", "System", "Composite"]);

async function inspect(blob, name) {
  const { parseMetadata } = await import("@uswriting/exiftool");
  const result = await parseMetadata(new File([blob], name), {
    args: ["-json", "-G1", "-s", "-n"],
    fetch: wasmFetch,
    transform: (value) => JSON.parse(value),
  });
  assert.equal(result.success, true, `verification parse failed: ${result.error}`);
  return Object.fromEntries(Object.entries(result.data[0]).filter(([key]) => !operationalGroups.has(key.split(":", 1)[0])));
}

// 4x4 JPEG containing EXIF Artist, Copyright and DateTime tags.
const EXIF_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4QBuRXhpZgAASUkqAAgAAAADADIBAgAUAAAAMgAAADsBAgAPAAAARgAAAJiCAgARAAAAVQAAAAAAAAAyMDI2OjA3OjE3IDEwOjAwOjAwAFByaXZhdGUgQXJ0aXN0AFNlY3JldCBDb3B5cmlnaHQA/9sAQwAKBwcIBwYKCAgICwoKCw4YEA4NDQ4dFRYRGCMfJSQiHyIhJis3LyYpNCkhIjBBMTQ5Oz4+PiUuRElDPEg3PT47/9sAQwEKCwsODQ4cEBAcOygiKDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7/8AAEQgABAAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8AyqKKK8w+4P/Z";

test("cleaner routing sends each format family to the engine that can rewrite it", () => {
  assert.equal(cleanerFor("song.mp3"), "media");
  assert.equal(cleanerFor("track.FLAC"), "media");
  assert.equal(cleanerFor("voice.wav"), "media");
  assert.equal(cleanerFor("report.pdf"), "pdf");
  assert.equal(cleanerFor("letter.docx"), "ooxml");
  assert.equal(cleanerFor("sheet.xlsx"), "ooxml");
  assert.equal(cleanerFor("photo.jpg"), "exiftool");
  assert.equal(cleanerFor("clip.mp4"), "exiftool");
  assert.equal(cleanerFor("no-extension"), "exiftool");
});

test("ExifTool engine removes EXIF identity fields from a JPEG", async () => {
  const source = new File([Uint8Array.from(atob(EXIF_JPEG_BASE64), (c) => c.charCodeAt(0))], "photo.jpg", { type: "image/jpeg" });
  const before = await inspect(source, "photo.jpg");
  assert.equal(before["IFD0:Artist"], "Private Artist");
  const cleaned = await stripWithExiftool(source, wasmFetch);
  assert.ok(cleaned.size > 100);
  const after = await inspect(cleaned, "photo.jpg");
  assert.equal(after["IFD0:Artist"], undefined);
  assert.equal(after["IFD0:Copyright"], undefined);
  assert.equal(after["IFD0:ModifyDate"], undefined);
});

test("PDF cleaner removes the Info dictionary and XMP packet", async () => {
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  document.setTitle("Confidential Title");
  document.setAuthor("Private Author");
  document.setCreator("SecretWriter");
  const source = new File([await document.save()], "report.pdf", { type: "application/pdf" });
  const before = await inspect(source, "report.pdf");
  assert.equal(before["XMP-dc:Title"] || before["PDF:Title"], "Confidential Title");
  const cleaned = await stripPdfMetadata(source);
  const reloaded = await PDFDocument.load(await cleaned.arrayBuffer());
  assert.equal(reloaded.getPageCount(), 1);
  const after = await inspect(cleaned, "report.pdf");
  const remaining = Object.keys(after).filter((key) => /title|author|creator|producer|xmp/i.test(key));
  assert.deepEqual(remaining, []);
});

test("OOXML cleaner blanks document properties and drops custom properties", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("docProps/core.xml", `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Secret Plan</dc:title><dc:creator>Private Person</dc:creator><cp:lastModifiedBy>Another Person</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Word</Application><Company>Secret Corp</Company></Properties>`);
  zip.file("docProps/custom.xml", `<?xml version="1.0"?><Properties><property name="Tracker">abc</property></Properties>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>`);
  const source = new File([await zip.generateAsync({ type: "uint8array" })], "letter.docx");

  const cleaned = await stripOoxmlMetadata(source);
  const reread = await JSZip.loadAsync(await cleaned.arrayBuffer());
  const core = await reread.file("docProps/core.xml").async("string");
  const app = await reread.file("docProps/app.xml").async("string");
  assert.ok(!core.includes("dc:creator"), "creator element should be removed entirely");
  assert.ok(!core.includes("dc:title"));
  assert.ok(!core.includes("dcterms:created"));
  assert.ok(!app.includes("Company"));
  assert.ok(app.includes("Word"));
  assert.equal(reread.file("docProps/custom.xml"), null);
  assert.ok(await reread.file("word/document.xml").async("string"));
  reread.forEach((path, entry) => {
    assert.equal(entry.date.getUTCFullYear(), 1980, `${path} timestamp should be normalized`);
  });
});
