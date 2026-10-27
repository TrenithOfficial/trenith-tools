import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { PDFDocument, PDFName, PDFString, PDFDict } from "pdf-lib";
import {
  canCleanMetadata, categorize, classifyFields, cleanerFor, exiftoolArgs, inspectMetadata, mediaStripArgs, routeFor,
  stripEpubMetadata, stripHtmlText, stripOdfMetadata, stripOoxmlMetadata, stripPdfMetadata, stripRtfText, stripSvgText, stripWithExiftool, stripZipArchive, unsupportedReason,
} from "../lib/metadata-clean.ts";
import { parseFfmpegProbe } from "../lib/media-probe.ts";
import { parseMetadata } from "@uswriting/exiftool";

const wasmBytesPromise = readFile(new URL("../public/zeroperl.wasm", import.meta.url));
const wasmFetch = async () => new Response(await wasmBytesPromise, { headers: { "content-type": "application/wasm" } });
const fixture = async (name) => new File([await readFile(new URL(`./fixtures/${name}`, import.meta.url))], name);

async function identifying(blob, name) {
  const fields = await inspectMetadata(blob, name, wasmFetch);
  return classifyFields(fields);
}

test("cleaner routing sends each format family to the engine that can rewrite it", () => {
  assert.equal(cleanerFor("song.mp3"), "media");
  assert.equal(cleanerFor("track.FLAC"), "media");
  assert.equal(cleanerFor("voice.wav"), "media");
  assert.equal(cleanerFor("clip.mp4"), "media");
  assert.equal(cleanerFor("clip.MOV"), "media");
  assert.equal(cleanerFor("clip.avi"), "media");
  assert.equal(cleanerFor("clip.wmv"), "media");
  assert.equal(cleanerFor("report.pdf"), "pdf");
  assert.equal(cleanerFor("letter.docx"), "ooxml");
  assert.equal(cleanerFor("sheet.xlsx"), "ooxml");
  assert.equal(cleanerFor("deck.pptx"), "ooxml");
  assert.equal(cleanerFor("text.odt"), "odf");
  assert.equal(cleanerFor("book.epub"), "epub");
  assert.equal(cleanerFor("logo.svg"), "svg");
  assert.equal(cleanerFor("page.html"), "html");
  assert.equal(cleanerFor("memo.rtf"), "rtf");
  assert.equal(cleanerFor("bundle.zip"), "zip");
  assert.equal(cleanerFor("photo.jpg"), "exiftool");
  assert.equal(cleanerFor("photo.avif"), "exiftool");
  assert.equal(cleanerFor("photo.jxl"), "exiftool");
  assert.equal(cleanerFor("shot.CR3"), "raw");
  assert.equal(cleanerFor("bitmap.bmp"), "plain");
  assert.equal(cleanerFor("legacy.doc"), "unsupported");
  assert.match(unsupportedReason("legacy.doc"), /docx/);
  assert.equal(canCleanMetadata("legacy.doc"), false);
  assert.equal(canCleanMetadata("photo.heic"), true);
  assert.equal(routeFor("no-extension"), "unsupported");
});

test("field classifier separates identifying metadata from format structure", () => {
  assert.equal(categorize("GPS:GPSLatitude"), "Location");
  assert.equal(categorize("IFD0:Artist"), "Identity");
  assert.equal(categorize("ExifIFD:SerialNumber"), "Device");
  assert.equal(categorize("IFD0:Make"), "Device");
  assert.equal(categorize("ExifIFD:DateTimeOriginal"), "Timestamps");
  assert.equal(categorize("PNG:Software"), "Software");
  assert.equal(categorize("PNG:Comment"), "Descriptive");
  assert.equal(categorize("XMP-xmp:CreatorTool"), "Software");
  assert.equal(categorize("IFD0:Orientation"), null);
  assert.equal(categorize("ExifIFD:ColorSpace"), null);
  assert.equal(categorize("PNG:ImageWidth"), null);
  assert.equal(categorize("RIFF:VP8Version"), null);
  assert.equal(categorize("QuickTime:HandlerDescription"), null);
  assert.equal(categorize("Matroska:MuxingApp"), "Software");
  const report = classifyFields([["Matroska:MuxingApp", "Lavf"], ["QuickTime:CreateDate", "0000:00:00 00:00:00"], ["IFD0:Artist", "Me"], ["PNG:BitDepth", "8"]]);
  assert.deepEqual(report.identifying, [["IFD0:Artist", "Me"]]);
  assert.equal(report.other.length, 3);
  assert.deepEqual(report.categories, { Identity: 1 });
});

test("ExifTool arguments keep colour and orientation and never trip the stderr failure path", () => {
  const args = exiftoolArgs("photo.jpg");
  assert.ok(args.includes("-all="));
  assert.ok(args.includes("--icc_profile:all"));
  assert.ok(args.includes("-q") && args.includes("-m"));
  assert.ok(args.includes("-orientation"));
  assert.ok(exiftoolArgs("scan.tiff").some((arg) => arg === "-IFD0:Make="), "TIFF deletes identifying IFD0 tags by name");
  const raw = exiftoolArgs("shot.cr3", "raw");
  assert.ok(!raw.includes("-all="), "RAW never uses -all= so maker notes survive");
  assert.ok(raw.includes("-GPS:all="));
});

for (const name of ["tagged.jpg", "tagged.png", "tagged.webp", "tagged.tiff", "tagged.avif"]) {
  test(`ExifTool engine strips every identifying field from ${name} while keeping colour profile and orientation`, async () => {
    const source = await fixture(name);
    const before = await identifying(source, name);
    assert.ok(before.identifying.length >= 5, `${name} fixture carries identifying metadata (${before.identifying.length})`);
    assert.ok(before.categories.Location, "fixture has GPS");
    const cleaned = await stripWithExiftool(source, wasmFetch);
    assert.ok(cleaned.size > 100);
    const after = await identifying(cleaned, name);
    assert.deepEqual(after.identifying, [], `${name} still carries ${JSON.stringify(after.identifying)}`);
    const raw = await parseMetadata(new File([cleaned], name), { args: ["-json", "-G1", "-s", "-n", "-m", "-q", "-q"], fetch: wasmFetch, transform: (value) => JSON.parse(value)[0] });
    assert.equal(raw.success, true);
    assert.ok(Object.keys(raw.data).some((key) => key.startsWith("ICC")), "colour profile kept");
    if (name !== "tagged.avif") assert.equal(String(raw.data["IFD0:Orientation"]), "6", "orientation kept");
  });
}

test("PDF cleaner removes Info, XMP, annotation authors and orphaned objects from earlier saves", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([200, 200]);
  document.setTitle("Confidential Title");
  document.setAuthor("Private Author");
  document.setCreator("SecretWriter");
  // A highlight-style annotation with a commenter name and timestamps.
  const annotation = document.context.obj({ Type: "Annot", Subtype: "Text", Rect: [10, 10, 50, 50], T: PDFString.of("Reviewer Name"), M: PDFString.of("D:20260717100000Z"), Contents: PDFString.of("note") });
  const annotationRef = document.context.register(annotation);
  page.node.set(PDFName.of("Annots"), document.context.obj([annotationRef]));
  // An orphaned object nobody references any more, like a deleted page's text.
  document.context.register(document.context.obj({ Secret: PDFString.of("ORPHANED-PRIVATE-TEXT") }));
  const source = new File([await document.save({ useObjectStreams: false })], "report.pdf", { type: "application/pdf" });
  assert.ok(Buffer.from(await source.arrayBuffer()).includes("ORPHANED-PRIVATE-TEXT"));
  const before = await identifying(source, "report.pdf");
  assert.ok(before.identifying.length >= 2);

  const cleaned = await stripPdfMetadata(source);
  const bytes = Buffer.from(await cleaned.arrayBuffer());
  const reloaded = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(reloaded.getPageCount(), 1);
  assert.equal(reloaded.getTitle(), undefined);
  assert.equal(reloaded.getAuthor(), undefined);
  const serialized = reloaded.context.enumerateIndirectObjects().map(([, object]) => object.toString()).join("\n");
  assert.ok(!serialized.includes("ORPHANED-PRIVATE-TEXT"), "unreachable objects are physically removed");
  assert.ok(!serialized.includes("Reviewer Name"));
  assert.ok(!serialized.includes("Confidential Title"));
  assert.ok(!serialized.includes("/Metadata"), "no XMP stream survives");
  const annots = reloaded.getPage(0).node.Annots();
  const dict = reloaded.context.lookup(annots.get(0));
  assert.ok(dict instanceof PDFDict);
  assert.equal(dict.get(PDFName.of("T")).decodeText(), "Author");
  assert.equal(dict.get(PDFName.of("M")), undefined);
  const after = await identifying(cleaned, "report.pdf");
  assert.deepEqual(after.identifying, []);
});

async function docxFixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/><Override PartName="/word/people.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Secret Plan</dc:title><dc:creator>Private Person</dc:creator><cp:lastModifiedBy>Another Person</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><Template>C:\\Users\\private\\Normal.dotm</Template><TotalTime>412</TotalTime><Company>Secret Corp</Company></Properties>`);
  zip.file("docProps/custom.xml", `<?xml version="1.0"?><Properties><property name="Tracker">abc</property></Properties>`);
  zip.file("docProps/thumbnail.jpeg", await readFile(new URL("./fixtures/tagged.jpg", import.meta.url)));
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2011/relationships/people" Target="people.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/></Relationships>`);
  zip.file("word/people.xml", `<?xml version="1.0"?><w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:person w15:author="Private Person"><w15:presenceInfo w15:providerId="AD" w15:userId="S::private@example.com::guid"/></w15:person></w15:people>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p w:rsidR="00A1B2C3" w:rsidRDefault="00A1B2C3"><w:ins w:id="1" w:author="Private Person" w:date="2026-07-17T10:00:00Z"><w:r><w:t>Hello</w:t></w:r></w:ins></w:p></w:body></w:document>`);
  zip.file("word/settings.xml", `<?xml version="1.0"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:attachedTemplate r:id="rId9"/><w:rsids><w:rsidRoot w:val="00A1B2C3"/><w:rsid w:val="00A1B2C3"/></w:rsids></w:settings>`);
  zip.file("word/media/image1.jpeg", await readFile(new URL("./fixtures/tagged.jpg", import.meta.url)));
  return new File([await zip.generateAsync({ type: "uint8array" })], "letter.docx");
}

test("OOXML cleaner scrubs properties, people, thumbnail, revision ids, authors and embedded media", async () => {
  const source = await docxFixture();
  const result = await stripOoxmlMetadata(source, wasmFetch);
  const reread = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const core = await reread.file("docProps/core.xml").async("string");
  const app = await reread.file("docProps/app.xml").async("string");
  const documentXml = await reread.file("word/document.xml").async("string");
  const settings = await reread.file("word/settings.xml").async("string");
  const rels = await reread.file("_rels/.rels").async("string");
  const documentRels = await reread.file("word/_rels/document.xml.rels").async("string");
  const contentTypes = await reread.file("[Content_Types].xml").async("string");
  assert.ok(!core.includes("dc:creator") && !core.includes("Secret Plan") && !core.includes("dcterms:created"));
  assert.match(core, /<cp:coreProperties[^>]*><\/cp:coreProperties>/);
  assert.ok(!app.includes("Company") && !app.includes("Template") && !app.includes("TotalTime"));
  assert.ok(app.includes("Microsoft Office Word"));
  assert.equal(reread.file("docProps/custom.xml"), null);
  assert.equal(reread.file("docProps/thumbnail.jpeg"), null);
  assert.equal(reread.file("word/people.xml"), null);
  assert.ok(!rels.includes("thumbnail") && !rels.includes("custom-properties"), "dangling relationships removed");
  assert.ok(!documentRels.includes("people.xml"));
  assert.ok(documentRels.includes("media/image1.jpeg"));
  assert.ok(!contentTypes.includes("custom.xml") && !contentTypes.includes("people.xml"), "content-type overrides removed");
  assert.ok(!documentXml.includes("Private Person") && documentXml.includes('w:author="Author"') && !documentXml.includes("w:date=") && !documentXml.includes("w:rsid"));
  assert.ok(documentXml.includes("<w:t>Hello</w:t>"));
  assert.ok(!settings.includes("attachedTemplate") && !settings.includes("w:rsids"));
  const image = await reread.file("word/media/image1.jpeg").async("uint8array");
  const imageReport = await identifying(new Blob([image]), "image1.jpeg");
  assert.deepEqual(imageReport.identifying, [], "embedded image EXIF/GPS removed");
  assert.equal(result.embedded, 1);
  reread.forEach((path, entry) => { assert.equal(entry.date.getUTCFullYear(), 1980, `${path} timestamp should be normalized`); });
});

test("Excel absolute save path and threaded-comment people are anonymized", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x15ac="http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac"><mc:AlternateContent><mc:Choice Requires="x15ac"><x15ac:absPath url="C:\\Users\\private\\Documents\\" /></mc:Choice></mc:AlternateContent><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/comments1.xml", `<?xml version="1.0"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Private Person</author></authors><commentList/></comments>`);
  zip.file("xl/persons/person.xml", `<?xml version="1.0"?><personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"><person displayName="Private Person" id="{1}" userId="private@example.com" providerId="PeoplePicker"/></personList>`);
  zip.file("xl/threadedComments/threadedComment1.xml", `<?xml version="1.0"?><ThreadedComments><threadedComment ref="A1" dT="2026-07-17T10:00:00Z" personId="{1}" id="{2}"><text>hi</text></threadedComment></ThreadedComments>`);
  const source = new File([await zip.generateAsync({ type: "uint8array" })], "book.xlsx");
  const result = await stripOoxmlMetadata(source, wasmFetch);
  const reread = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const workbook = await reread.file("xl/workbook.xml").async("string");
  assert.ok(!workbook.includes("absPath") && !workbook.includes("private"));
  assert.ok(workbook.includes('name="Sheet1"'), "sheet names untouched");
  assert.ok((await reread.file("xl/comments1.xml").async("string")).includes("<author>Author</author>"));
  const person = await reread.file("xl/persons/person.xml").async("string");
  assert.ok(person.includes('displayName="Author"') && !person.includes("userId") && !person.includes("private@"));
  assert.ok(!(await reread.file("xl/threadedComments/threadedComment1.xml").async("string")).includes("dT="));
});

test("OpenDocument cleaner empties meta.xml, drops the thumbnail and keeps mimetype first and stored", async () => {
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
  zip.file("META-INF/manifest.xml", `<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="Thumbnails/thumbnail.png" manifest:media-type="image/png"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`);
  zip.file("meta.xml", `<?xml version="1.0"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><meta:initial-creator>Private Person</meta:initial-creator><dc:creator>Private Person</dc:creator><meta:generator>LibreOffice/7</meta:generator></office:meta></office:document-meta>`);
  zip.file("content.xml", `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"><office:body/></office:document-content>`);
  zip.file("Thumbnails/thumbnail.png", await readFile(new URL("./fixtures/tagged.png", import.meta.url)));
  const result = await stripOdfMetadata(new File([await zip.generateAsync({ type: "uint8array" })], "text.odt"), wasmFetch);
  const bytes = Buffer.from(await result.blob.arrayBuffer());
  // ZIP local header for the first entry starts at byte 30: name "mimetype", method 0 (stored).
  assert.equal(bytes.toString("latin1", 30, 38), "mimetype");
  assert.equal(bytes.readUInt16LE(8), 0, "mimetype stored uncompressed");
  const reread = await JSZip.loadAsync(bytes);
  const meta = await reread.file("meta.xml").async("string");
  assert.ok(!meta.includes("Private Person") && meta.includes("<office:meta/>") && meta.includes('office:version="1.3"'));
  assert.equal(reread.file("Thumbnails/thumbnail.png"), null);
  assert.ok(!(await reread.file("META-INF/manifest.xml").async("string")).includes("Thumbnails"));
});

test("EPUB cleaner keeps title and author but drops dates, generator tags, bookmarks and image metadata", async () => {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("META-INF/calibre_bookmarks.txt", "encoding=json+base64:\nW3sidGl0bGUiOiAiUmVhZGluZyIsICJwb3MiOiAiMTIifV0=");
  zip.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:1</dc:identifier><dc:title>Book Title</dc:title><dc:creator>Known Author</dc:creator><dc:language>en</dc:language><dc:date>2026-07-17</dc:date><meta name="calibre:timestamp" content="2026-07-17T10:00:00+00:00"/><meta name="generator" content="Secret Converter 3"/><meta property="dcterms:modified">2026-07-17T10:00:00Z</meta></metadata><manifest><item id="img" href="cover.jpg" media-type="image/jpeg"/></manifest><spine/></package>`);
  zip.file("OEBPS/cover.jpg", await readFile(new URL("./fixtures/tagged.jpg", import.meta.url)));
  const result = await stripEpubMetadata(new File([await zip.generateAsync({ type: "uint8array" })], "book.epub"), wasmFetch);
  const reread = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const opf = await reread.file("OEBPS/content.opf").async("string");
  assert.ok(opf.includes("Book Title") && opf.includes("Known Author"));
  assert.ok(!opf.includes("dc:date") && !opf.includes("calibre") && !opf.includes("Secret Converter"));
  assert.ok(opf.includes('property="dcterms:modified">1980-01-01T00:00:00Z<'));
  assert.equal(reread.file("META-INF/calibre_bookmarks.txt"), null);
  const cover = await reread.file("OEBPS/cover.jpg").async("uint8array");
  assert.deepEqual((await identifying(new Blob([cover]), "cover.jpg")).identifying, []);
  assert.equal(result.embedded, 1);
});

test("SVG, HTML and RTF text cleaners remove metadata blocks, comments and editor traces", () => {
  const svg = `<?xml version="1.0"?><!-- Generator: Adobe Illustrator 27, SVG Export --><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" sodipodi:docname="/Users/private/logo.svg" inkscape:export-filename="/Users/private/out.png" viewBox="0 0 10 10"><title>Logo</title><metadata><rdf:RDF xmlns:rdf="x"><cc:Work xmlns:cc="y"><dc:creator xmlns:dc="z">Private Person</dc:creator></cc:Work></rdf:RDF></metadata><sodipodi:namedview id="base" inkscape:zoom="1"/><rect width="10" height="10" inkscape:label="Layer 1"/></svg>`;
  const cleanedSvg = stripSvgText(svg);
  assert.ok(!cleanedSvg.includes("Private") && !cleanedSvg.includes("Illustrator") && !cleanedSvg.includes("sodipodi") && !cleanedSvg.includes("inkscape:"));
  assert.ok(cleanedSvg.includes("<title>Logo</title>") && cleanedSvg.includes('<rect width="10" height="10"'));

  const html = `<!DOCTYPE html><!-- saved from url=(0040)https://intranet.example.com/private/page --><html><head><meta charset="utf-8"><meta name="author" content="Private Person"><meta name="generator" content="Secret CMS 2"><meta name="description" content="Public summary"><title>Page</title><xml><o:DocumentProperties><o:Author>Private Person</o:Author></o:DocumentProperties></xml></head><body><p>Hello</p></body></html>`;
  const cleanedHtml = stripHtmlText(html);
  assert.ok(!cleanedHtml.includes("Private") && !cleanedHtml.includes("Secret CMS") && !cleanedHtml.includes("intranet"));
  assert.ok(cleanedHtml.includes('name="description"') && cleanedHtml.includes("<title>Page</title>") && cleanedHtml.includes("<p>Hello</p>"));

  const rtf = `{\\rtf1\\ansi{\\info{\\title Secret}{\\author Private Person}{\\operator Someone}{\\creatim\\yr2026\\mo7\\dy17}{\\company {Nested {Braces}}}}{\\*\\userprops {\\propname Tracker}\\proptype30{\\staticval abc}}{\\*\\revtbl {Unknown;}{Private Person;}}\\pard Hello \\{escaped\\} world}`;
  const cleanedRtf = stripRtfText(rtf);
  assert.ok(!cleanedRtf.includes("Private Person") && !cleanedRtf.includes("Secret") && !cleanedRtf.includes("Tracker"));
  assert.ok(cleanedRtf.includes("{Author;}") && cleanedRtf.includes("Hello \\{escaped\\} world"));
  assert.equal((cleanedRtf.match(/\{/g) || []).length, (cleanedRtf.match(/\}/g) || []).length - 0, "braces stay balanced");
});

test("ZIP archives are cleaned entry by entry, including a document nested inside", async () => {
  const zip = new JSZip();
  zip.file("photos/one.jpg", await readFile(new URL("./fixtures/tagged.jpg", import.meta.url)));
  zip.file("notes.txt", "plain text");
  zip.file("docs/letter.docx", await (await docxFixture()).arrayBuffer());
  const result = await stripZipArchive(new File([await zip.generateAsync({ type: "uint8array" })], "bundle.zip"), wasmFetch);
  const reread = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const photo = await reread.file("photos/one.jpg").async("uint8array");
  assert.deepEqual((await identifying(new Blob([photo]), "one.jpg")).identifying, []);
  const nested = await JSZip.loadAsync(await reread.file("docs/letter.docx").async("uint8array"));
  assert.equal(nested.file("docProps/custom.xml"), null);
  assert.equal(await reread.file("notes.txt").async("string"), "plain text");
  assert.ok(result.embedded >= 3, `cleaned ${result.embedded} entries including nested media`);
});

test("FFmpeg strip arguments drop every tag and chapter, keep streams and restore languages", () => {
  const probe = parseFfmpegProbe(`Input #0, matroska,webm, from 'in.mkv':
  Metadata:
    title           : SecretTitle
    encoder         : libebml v1.4.2 + libmatroska v1.6.4
  Duration: 00:01:02.04, start: 0.000000, bitrate: 1200 kb/s
  Stream #0:0(eng): Video: h264 (High), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 23.98 fps, 23.98 tbr, 1k tbn (default)
  Stream #0:1(jpn): Audio: aac (LC), 48000 Hz, stereo, fltp (default)
  Stream #0:2(eng): Subtitle: subrip`);
  const args = mediaStripArgs("mkv", probe, "in.mkv", "out.mkv", true);
  assert.ok(args.includes("-map_metadata") && args.includes("-map_chapters") && args.includes("-bitexact"));
  assert.ok(args.join(" ").includes("-c copy"));
  assert.ok(args.join(" ").includes("-metadata:s:1 language=jpn"));
  assert.ok(args.join(" ").includes("-metadata:s:2 language=eng"));
  assert.ok(!mediaStripArgs("mkv", probe, "in.mkv", "out.mkv", false).includes("language=eng") || mediaStripArgs("mkv", probe, "in.mkv", "out.mkv", false).includes("-sn"));
  assert.ok(mediaStripArgs("mp4", probe, "in.mp4", "out.mp4", true).includes("+faststart"));
  assert.ok(mediaStripArgs("mp3", null, "in.mp3", "out.mp3", true).includes("-id3v2_version"));
});
