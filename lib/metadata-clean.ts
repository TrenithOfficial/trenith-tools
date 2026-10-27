"use client";

// Per-format metadata removal engines. Every route produces a downloadable,
// verified copy without uploading the source. The choice of engine follows what
// each container can safely rewrite:
//   exiftool  images, RAW and camera formats (ExifTool WebAssembly)
//   media     every audio/video container FFmpeg can remux losslessly
//   pdf       pdf-lib rewrite with a reachability sweep of orphaned objects
//   ooxml     Word/Excel/PowerPoint package scrub (properties, people, authors,
//             thumbnails, revision ids, absolute paths) plus embedded media
//   odf       OpenDocument meta.xml and thumbnail scrub plus embedded media
//   epub      OPF timestamps/generator scrub plus embedded media
//   svg/html  text rewrite of metadata blocks, comments and editor attributes
//   rtf       brace-aware removal of the \info and user-property groups
//   zip       recursive clean of every entry, normalized archive timestamps
//   plain     formats with no metadata container (nothing to remove)

import { bytesToBlob, extensionOf, probeMedia, runFfmpeg } from "./media-engine.ts";
import type { MediaProbe } from "./media-probe.ts";
import { loadPdfDocument, sweepUnreachable } from "./pdf-tools.ts";

export type CleanerRoute = "exiftool" | "raw" | "media" | "pdf" | "ooxml" | "odf" | "epub" | "svg" | "html" | "rtf" | "zip" | "plain" | "unsupported";
export type WasmFetch = (...args: unknown[]) => Promise<Response>;
export type CleanResult = { blob: Blob; notes: string[]; embedded: number };
export type CleanOptions = { depth?: number; progress?: (message: string) => void };
export type MetadataField = [string, string];
export type RiskCategory = "Location" | "Identity" | "Device" | "Timestamps" | "Software" | "Descriptive";
export type FieldReport = { identifying: MetadataField[]; other: MetadataField[]; categories: Partial<Record<RiskCategory, number>> };

type JSZipType = import("jszip");
type ZipEntry = import("jszip").JSZipObject;

const DOS_EPOCH = new Date(Date.UTC(1980, 0, 1));
const MAX_ZIP_DEPTH = 3;

// ExifTool can rewrite these image families in place (its documented r/w set).
const exiftoolImages = new Set(["jpg", "jpeg", "jpe", "jfif", "png", "jng", "mng", "webp", "gif", "tif", "tiff", "heic", "heif", "hif", "avif", "jxl", "psd", "psb", "jp2", "j2k", "jpf", "jpx", "jpm", "dng", "mpo", "thm", "xmp", "mie", "exv", "eps", "ps", "ai", "indd", "ind", "indt", "icc", "icm", "pbm", "pgm", "ppm", "hdp", "wdp", "jxr", "flif"]);
// Proprietary RAW: ExifTool writes them, but the maker notes must survive or RAW
// converters lose the data they need. These get a targeted strip instead of -all=.
const rawImages = new Set(["cr2", "cr3", "crw", "nef", "nrw", "arw", "sr2", "srf", "srw", "orf", "ori", "raf", "rw2", "rwl", "pef", "mrw", "mef", "mos", "erf", "fff", "iiq", "x3f", "dcp", "gpr", "dcr"]);
// TIFF-based files refuse IFD0 deletion, so the identifying IFD0 tags are removed by name.
const tiffBased = new Set(["tif", "tiff", "dng"]);
// Audio/video containers FFmpeg can rewrite with a lossless stream copy.
const mediaExtensions = new Set(["mp3", "flac", "ogg", "oga", "opus", "spx", "wav", "aif", "aiff", "aifc", "webm", "mka", "mkv", "mk3d", "mp4", "m4a", "m4b", "m4r", "m4v", "mov", "qt", "3gp", "3g2", "avi", "wmv", "wma", "asf", "ts", "m2ts", "mts", "mpg", "mpeg", "mpe", "vob", "flv", "f4v", "f4a", "ogv", "ac3", "eac3", "dts", "mp2", "amr", "caf", "wv", "tta", "mxf", "lrv", "insp"]);
// QuickTime-family containers where ExifTool is a working fallback writer.
const quickTimeFamily = new Set(["mp4", "m4a", "m4b", "m4v", "mov", "qt", "3gp", "3g2", "f4v", "f4a", "lrv", "insp"]);
const ooxmlExtensions = new Set(["docx", "docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "xlam", "pptx", "pptm", "potx", "potm", "ppsx", "ppsm", "sldx", "sldm"]);
const odfExtensions = new Set(["odt", "ott", "ods", "ots", "odp", "otp", "odg", "otg", "odf", "odm"]);
const plainExtensions = new Set(["bmp", "ico", "cur", "txt", "csv", "tsv", "md", "markdown", "json", "yaml", "yml", "log", "ini", "cfg", "toml", "xml", "rels", "css", "js", "ts", "sql", "srt", "vtt", "sub", "ass", "ssa", "bin", "dat"]);
const unsupportedReasons: Record<string, string> = {
  doc: "Legacy binary Word files cannot be rewritten safely in the browser. Save as .docx first, then clean the .docx.",
  xls: "Legacy binary Excel files cannot be rewritten safely in the browser. Save as .xlsx first, then clean the .xlsx.",
  ppt: "Legacy binary PowerPoint files cannot be rewritten safely in the browser. Save as .pptx first, then clean the .pptx.",
  pages: "Apple iWork packages store metadata in a binary index that cannot be rewritten here. Export to .docx or PDF first.",
  numbers: "Apple iWork packages store metadata in a binary index that cannot be rewritten here. Export to .xlsx or PDF first.",
  key: "Apple iWork packages store metadata in a binary index that cannot be rewritten here. Export to .pptx or PDF first.",
  rar: "RAR archives cannot be rewritten in the browser. Extract the files and clean them individually or as a ZIP.",
  "7z": "7z archives cannot be rewritten in the browser. Extract the files and clean them individually or as a ZIP.",
  gz: "Compressed streams cannot be rewritten in the browser. Extract the file and clean it directly.",
  tar: "TAR archives cannot be rewritten in the browser. Extract the files and clean them individually or as a ZIP.",
  mobi: "MOBI/AZW books use a proprietary container that cannot be rewritten here. Convert to EPUB first.",
  azw: "MOBI/AZW books use a proprietary container that cannot be rewritten here. Convert to EPUB first.",
  azw3: "MOBI/AZW books use a proprietary container that cannot be rewritten here. Convert to EPUB first.",
  ape: "Monkey's Audio has no in-browser writer. Convert it to FLAC first, then clean the FLAC.",
  djvu: "DjVu metadata cannot be rewritten in the browser.",
  exe: "Executable resources are not rewritten by design.",
  dll: "Executable resources are not rewritten by design.",
};

export function routeFor(name: string): CleanerRoute {
  const extension = extensionOf(name);
  if (extension === "pdf") return "pdf";
  if (ooxmlExtensions.has(extension)) return "ooxml";
  if (odfExtensions.has(extension)) return "odf";
  if (extension === "epub") return "epub";
  if (extension === "svg") return "svg";
  if (["html", "htm", "xhtml"].includes(extension)) return "html";
  if (extension === "rtf") return "rtf";
  if (["zip", "cbz"].includes(extension)) return "zip";
  if (mediaExtensions.has(extension)) return "media";
  if (rawImages.has(extension)) return "raw";
  if (exiftoolImages.has(extension)) return "exiftool";
  if (plainExtensions.has(extension)) return "plain";
  if (unsupportedReasons[extension]) return "unsupported";
  // Unknown extensions are handed to ExifTool; it can inspect almost anything,
  // and the verification step decides whether a clean actually succeeded.
  return "unsupported";
}

// Backwards-compatible alias used by earlier call sites and tests.
export const cleanerFor = routeFor;

export function canCleanMetadata(name: string): boolean {
  const route = routeFor(name);
  return route !== "unsupported";
}

export function unsupportedReason(name: string): string {
  const extension = extensionOf(name);
  return unsupportedReasons[extension] || (extension ? `.${extension} files can be inspected but not rewritten in the browser.` : "Files without an extension can be inspected but not rewritten in the browser.");
}

export function routeLabel(route: CleanerRoute): string {
  const labels: Record<CleanerRoute, string> = {
    exiftool: "ExifTool image rewrite (colour profile and orientation kept)",
    raw: "ExifTool targeted RAW strip (maker notes kept for converters)",
    media: "FFmpeg lossless stream copy with every tag and chapter dropped",
    pdf: "PDF rewrite: Info, XMP, page/object metadata, annotation authors and orphaned objects removed",
    ooxml: "Office package scrub: properties, authors, people, thumbnail, revision ids, paths and embedded media",
    odf: "OpenDocument scrub: meta.xml, thumbnail and embedded media",
    epub: "EPUB scrub: timestamps, generator tags, reading positions and embedded media",
    svg: "SVG rewrite: metadata, comments and editor attributes removed",
    html: "HTML rewrite: author/generator meta tags, comments and Office properties removed",
    rtf: "RTF rewrite: \\info and user-property groups removed, revision authors anonymized",
    zip: "ZIP rewrite: every entry cleaned, archive timestamps normalized",
    plain: "No metadata container in this format",
    unsupported: "Inspect only",
  };
  return labels[route];
}

// --- Field classification ----------------------------------------------------

// ExifTool's own bookkeeping and the colour-profile groups describe the file
// format or how the inspection ran, not who made the file or where.
const operationalGroups = new Set(["ExifTool", "File", "System", "Composite", "JFIF", "MPF"]);

const categoryRules: Array<[RiskCategory, RegExp]> = [
  ["Location", /GPS|Latitude|Longitude|Altitude|Location|Sublocation|City|Country|State|Province|Place|Geo|ICBM/i],
  ["Software", /Software|CreatorTool|Application|AppVersion|Encoder|EncodedBy|Encoding(?:Tool|Settings)|HistorySoftwareAgent|ProcessingSoftware|Firmware|ProgramVersion|Generator|WritingApp|MuxingApp|Producer|Tool$/i],
  ["Device", /\bMake$|^Model|CameraModel|Serial|Lens(?!Info|Type)|BodySerial|InternalSerial|DeviceSettingDescription|UniqueCameraModel|CameraID|ImageUniqueID|DocumentID|InstanceID|OriginalDocumentID|DeviceModel|DeviceManufacturer|CameraTemperature|OwnerName|CameraOwnerName|HostComputer|Printer/i],
  ["Identity", /Artist|Author|Creator|By-?line|Copyright|Rights|Owner|Credit|Contact|Email|Phone|Person|LastModifiedBy|Company|Manager|UserName|Writer|Composer|Performer|Publisher|Conductor|Lyricist|Arranger|Operator|Initials|Reviewer|Editor|Annotator|LastSavedBy|RevisionAuthor/i],
  ["Timestamps", /Date|Time(?!Scale|Code|Base|Signature|Line)|Created|Modified|Modify|Timestamp|Revised|TotalEditTime|LastPrinted|Year$/i],
  ["Descriptive", /Title|Subject|Description|Keywords|Comment|Caption|Headline|Rating|Label|Category|Genre|Album|^Track$|TrackName|Notes|Instructions|Lyrics|Synopsis|Grouping|Mood|Tag$|Tags$|Revision|History|Template|UserProp|CustomProp|Marked|UserData|Hyperlink/i],
];

// Tags that describe the file's structure, encoding or colour handling. They are
// shown as "other" fields, never counted as identifying, and never promised removed.
const structuralTags = new Set([
  "duration", "mediaduration", "trackduration", "imagewidth", "imageheight", "imagesize", "megapixels", "bitdepth", "colortype", "framerate", "videoframerate", "audiosamplerate", "audiochannels", "audiobitspersample", "bits", "filetype", "mimetype",
  "orientation", "colorspace", "exifversion", "flashpixversion", "componentsconfiguration", "ycbcrpositioning", "ycbcrsubsampling", "ycbcrcoefficients", "compression", "resolutionunit", "xresolution", "yresolution", "exifbyteorder", "exifimagewidth", "exifimageheight", "interopindex", "interopversion",
  "trackid", "tracklayer", "trackvolume", "matrixstructure", "timescale", "handlertype", "handlerclass", "handlerdescription", "handlervendorid", "mediatimescale", "mediaheaderversion", "trackheaderversion", "movieheaderversion", "majorbrand", "minorversion", "compatiblebrands", "preferredrate", "preferredvolume", "previewtime", "previewduration", "postertime", "selectiontime", "selectionduration", "currenttime", "nexttrackid", "balance", "graphicsmode", "opcolor", "sourceimagewidth", "sourceimageheight", "compressorid", "compressorname", "vendorid", "bitdepth", "videocodec", "audiocodec", "audioformat", "audiovendorid", "mediadataoffset", "mediadatasize", "mediacreatedate", "mediamodifydate", "trackcreatedate", "trackmodifydate", "trackcreatedate", "rotation", "xmptoolkit",
  "bitspersample", "samplesperpixel", "photometricinterpretation", "planarconfiguration", "rowsperstrip", "stripoffsets", "stripbytecounts", "interlace", "filter", "srgbrendering", "gamma", "pixelsperunitx", "pixelsperunity", "pixelunits", "whitepoint", "primarychromaticities", "transferfunction", "referenceblackwhite", "backgroundcolor", "transparentcolor", "palettesize",
  "samplerate", "numchannels", "avgbytespersec", "blockalign", "encoding", "channelmode", "mpegaudioversion", "audiolayer", "audiobitrate", "vbr", "id3size", "msstereo", "emphasis", "originalmedia", "copyrightflag", "padding", "samplesperframe", "vorbisversion", "opusversion", "outputgain", "preskip", "blocksizemin", "blocksizemax", "framesizemin", "framesizemax", "totalsamples", "md5signature", "md5",
  "filesource", "scenetype", "cfapattern", "sensingmethod", "customrendered", "exposuremode", "whitebalance", "scenecapturetype", "contrast", "saturation", "sharpness", "subjectdistancerange", "colormode", "imagecount", "framecount", "animationiterations", "gifversion", "hascolormap", "colorresolutiondepth",
  "webp_flags", "vp8version", "horizontalscale", "verticalscale", "alphaisused", "alphapreprocessing", "alphafiltering", "alphacompression", "imagebitdepth", "imagechannels", "compressionprofile",
  "pagecount", "linearized", "taggedpdf", "language", "lang", "pagemode", "pagelayout", "trapped", "codepage", "wordcount", "charactercount", "paragraphcount", "linecount", "slidecount", "notecount", "hiddenslides", "scalecrop", "linksuptodate", "shareddoc", "hyperlinkschanged", "docsecurity", "pages", "words", "characters", "lines", "paragraphs", "characterswithspaces", "titleofparts", "titlesofparts", "headingpairs", "presentationformat", "mmclips", "notes", "slides", "picture", "coverart", "chapterlist", "pdfversion", "application", "appversion", "docsecurity",
  "sampleformat", "predictor", "tilewidth", "tilelength", "tileoffsets", "tilebytecounts", "fillorder", "subfiletype", "newsubfiletype", "extrasamples", "colormap", "jpegtables", "offsetschema", "encodingprocess", "colortransform", "colorcomponents", "dctencodeversion", "appversion",
  "tagtrackuid", "tracklanguage", "medialanguagecode", "docversion", "docreadversion", "ebmlversion", "ebmlreadversion", "matroskaversion", "matroskareadversion", "doctype", "doctypeversion", "doctypereadversion", "timecodescale", "tracknumber", "tracktype", "codecid", "codecname", "trackused", "tracklacing", "trackdefault", "trackforced", "displaywidth", "displayheight", "displayunit", "pixelwidth", "pixelheight", "audiosamplingfrequency", "audiochannels", "audiobitdepth", "videoframerate", "maxcache", "mincache", "defaultduration", "tracktimecodescale", "trackuid", "segmentuid", "cluster", "clustertimecode",
  "version", "fontname", "fonttype", "fontweight", "fontwidth", "fontstyle",
]);

// Values written by the engines themselves or by every muxer regardless of the
// author: an "Application: Microsoft Office Word" stamp or FFmpeg's generic
// "Lavf" muxer tag identify software families, not a person or device.
function isBenignValue(category: RiskCategory, value: string): boolean {
  if (value === "" || value === "null" || value === "undefined") return true;
  if (category === "Timestamps") return /^(0000[:\-]00[:\-]00|1904[:\-]01[:\-]01|1970[:\-]01[:\-]01|1980[:\-]01[:\-]01|0)(\b|$)/.test(value);
  if (category === "Software") return /^Lav[fc]$/.test(value);
  return false;
}

export function categorize(key: string): RiskCategory | null {
  const tag = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
  const normalized = tag.toLowerCase();
  if (structuralTags.has(normalized)) return null;
  for (const [category, pattern] of categoryRules) if (pattern.test(tag)) return category;
  return null;
}

export function isOperationalKey(key: string): boolean {
  const group = key.split(":", 1)[0];
  return operationalGroups.has(group) || group.startsWith("ICC") || key === "SourceFile" || key === "Directory";
}

type MetadataValue = string | number | boolean | null | MetadataValue[] | { [key: string]: MetadataValue };

function displayValue(value: MetadataValue) {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 240);
  return String(value).slice(0, 240);
}

export function fieldsFromExifJson(input: Record<string, MetadataValue> | undefined): MetadataField[] {
  if (!input) return [];
  return Object.entries(input)
    .filter(([key]) => !isOperationalKey(key))
    .map(([key, value]) => [key, displayValue(value)] as MetadataField)
    .sort(([left], [right]) => left.localeCompare(right));
}

export function classifyFields(fields: MetadataField[]): FieldReport {
  const identifying: MetadataField[] = [];
  const other: MetadataField[] = [];
  const categories: Partial<Record<RiskCategory, number>> = {};
  for (const field of fields) {
    const category = categorize(field[0]);
    if (category && !isBenignValue(category, field[1])) { identifying.push(field); categories[category] = (categories[category] || 0) + 1; }
    else other.push(field);
  }
  return { identifying, other, categories };
}

export async function inspectMetadata(blob: Blob, name: string, wasmFetch: WasmFetch): Promise<MetadataField[]> {
  const { parseMetadata } = await import("@uswriting/exiftool");
  const result = await parseMetadata<Record<string, MetadataValue>[]>(new File([blob], name, { type: blob.type }), { args: ["-json", "-G1", "-s", "-n", "-m", "-q", "-q"], fetch: wasmFetch, transform: (value) => JSON.parse(value) as Record<string, MetadataValue>[] });
  if (!result.success) throw new Error(String(result.error || "The file could not be inspected.").split("\n")[0]);
  return fieldsFromExifJson(result.data[0]);
}

// --- ExifTool --------------------------------------------------------------

const tiffIdentityTags = ["Make", "Model", "Software", "ModifyDate", "Artist", "Copyright", "ImageDescription", "HostComputer", "DocumentName", "PageName", "XPTitle", "XPComment", "XPAuthor", "XPKeywords", "XPSubject", "ProcessingSoftware", "ImageUniqueID", "DateTimeOriginal", "CameraOwnerName", "OwnerName", "SerialNumber", "LensSerialNumber", "BodySerialNumber"];

export function exiftoolArgs(name: string, mode: "full" | "raw" | "quicktime" = "full"): string[] {
  // -m ignores minor errors so slightly malformed files still rewrite; the two
  // -q flags keep informational warnings off stderr, which the WebAssembly
  // wrapper would otherwise treat as a failure. The colour profile is kept
  // (deleting it shifts colours) and orientation/colour space are copied back
  // from the source so the cleaned image still displays identically.
  const quiet = ["-m", "-q", "-q"];
  if (mode === "quicktime") return ["-all=", ...quiet];
  if (mode === "raw") {
    return [...quiet, "-GPS:all=", "-XMP:all=", "-IPTC:all=", "-Photoshop:all=", ...tiffIdentityTags.map((tag) => `-IFD0:${tag}=`), ...["OwnerName", "CameraOwnerName", "SerialNumber", "BodySerialNumber", "LensSerialNumber", "UserComment", "ImageUniqueID", "DateTimeOriginal", "CreateDate", "OffsetTime", "OffsetTimeOriginal", "OffsetTimeDigitized", "SubSecTime", "SubSecTimeOriginal", "SubSecTimeDigitized"].map((tag) => `-ExifIFD:${tag}=`)];
  }
  const args = ["-all=", ...quiet, "--icc_profile:all", "-tagsfromfile", "@", "-orientation", "-exififd:colorspace"];
  if (tiffBased.has(extensionOf(name))) args.push(...tiffIdentityTags.map((tag) => `-IFD0:${tag}=`));
  return args;
}

export async function stripWithExiftool(file: File, wasmFetch: WasmFetch, mode: "full" | "raw" | "quicktime" = "full"): Promise<Blob> {
  const { writeMetadata, dispose } = await import("@uswriting/exiftool");
  // The library appends its own -o output argument, so -overwrite_original must
  // never be combined with it: ExifTool rejects the pair and the write fails.
  const cleaned = await writeMetadata(file, {}, { args: exiftoolArgs(file.name, mode), fetch: wasmFetch });
  if (!cleaned.success) {
    // A failed write can leave the embedded Perl interpreter unusable, which
    // would poison every following file in the batch. Discard it.
    await dispose().catch(() => undefined);
    throw new Error(String(cleaned.error || "Metadata removal failed.").split("\n")[0].replace(/ - \/.*$/, ""));
  }
  return new Blob([cleaned.data as BlobPart], { type: file.type || "application/octet-stream" });
}

// --- FFmpeg media containers -------------------------------------------------

const mediaMime: Record<string, string> = { mp3: "audio/mpeg", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", aiff: "audio/aiff", aif: "audio/aiff", webm: "video/webm", mkv: "video/x-matroska", mka: "audio/x-matroska", mp4: "video/mp4", m4a: "audio/mp4", m4v: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo", wmv: "video/x-ms-wmv", wma: "audio/x-ms-wma", ts: "video/mp2t", mpg: "video/mpeg", mpeg: "video/mpeg", flv: "video/x-flv", ogv: "video/ogg", "3gp": "video/3gpp" };

export function mediaStripArgs(extension: string, probe: MediaProbe | null, input: string, output: string, keepSubtitles: boolean): string[] {
  const args = ["-i", input, "-map", "0", "-ignore_unknown", "-dn", "-map_metadata", "-1", "-map_metadata:s", "-1", "-map_chapters", "-1", "-bitexact", "-fflags", "+bitexact", "-c", "copy"];
  if (!keepSubtitles) args.push("-sn");
  // Language tags are navigation, not identity: put them back so players still
  // pick the right audio or subtitle track after the strip.
  for (const stream of probe?.streams || []) {
    if (stream.language && (stream.type === "audio" || stream.type === "subtitle" || stream.type === "video")) args.push(`-metadata:s:${stream.index}`, `language=${stream.language}`);
  }
  if (quickTimeFamily.has(extension)) args.push("-movflags", "+faststart");
  if (extension === "mp3") args.push("-id3v2_version", "3", "-write_id3v1", "0");
  args.push(output);
  return args;
}

export async function stripMediaMetadata(file: File, progress?: (message: string) => void): Promise<CleanResult> {
  const extension = extensionOf(file.name) || "bin";
  const notes: string[] = [];
  let probe: MediaProbe | null = null;
  try { probe = await probeMedia(file, file.name, (_, message) => progress?.(message)); } catch { /* the strip can still succeed without a probe */ }
  const languages = (probe?.streams || []).filter((stream) => stream.language).length;
  if (languages) notes.push(`${languages} track language tag${languages === 1 ? "" : "s"} restored so players keep the right audio/subtitle selection.`);
  const attempt = (keepSubtitles: boolean) => runFfmpeg({
    inputs: [{ data: file, name: file.name }],
    outputs: [`clean.${extension}`],
    args: (inputs, outputs) => mediaStripArgs(extension, probe, inputs[0], outputs[0], keepSubtitles),
    progress: (_, message) => progress?.(message),
    label: `Rewriting ${file.name} without metadata`,
  });
  let result;
  try {
    result = await attempt(true);
  } catch (error) {
    if (!(probe?.streams.some((stream) => stream.type === "subtitle"))) throw error;
    result = await attempt(false);
    notes.push("Subtitle tracks were dropped because this container cannot store them without re-encoding.");
  }
  const bytes = result.outputs.get(`clean.${extension}`)!;
  return { blob: bytesToBlob(bytes, file.type || mediaMime[extension] || "application/octet-stream"), notes, embedded: 0 };
}

// --- PDF -------------------------------------------------------------------

export async function stripPdfMetadata(file: File): Promise<Blob> {
  const { PDFName, PDFDict, PDFStream, PDFString } = await import("pdf-lib");
  const document = await loadPdfDocument(await file.arrayBuffer());
  const context = document.context;
  const trailerInfo = context.trailerInfo as { Info?: unknown; ID?: unknown };
  delete trailerInfo.Info;
  // The trailer ID pair fingerprints the original document and every save made
  // from it; a cleaned copy should not stay linkable to its source.
  delete trailerInfo.ID;
  document.catalog.delete(PDFName.of("Metadata"));
  document.catalog.delete(PDFName.of("PieceInfo"));

  const scrubKeys = ["Metadata", "PieceInfo", "LastModified"].map((key) => PDFName.of(key));
  for (const [, object] of context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFDict ? object : object instanceof PDFStream ? object.dict : null;
    if (!dict) continue;
    for (const key of scrubKeys) dict.delete(key);
    const subtype = dict.get(PDFName.of("Subtype"));
    const isAnnotation = dict.has(PDFName.of("Rect")) && subtype !== undefined;
    if (isAnnotation) {
      // Markup annotations carry the commenter's name and timestamps.
      if (dict.has(PDFName.of("T"))) dict.set(PDFName.of("T"), PDFString.of("Author"));
      dict.delete(PDFName.of("M"));
      dict.delete(PDFName.of("CreationDate"));
      dict.delete(PDFName.of("NM"));
    }
    if (dict.get(PDFName.of("Type")) === PDFName.of("EmbeddedFile")) {
      const params = dict.lookup(PDFName.of("Params"));
      if (params instanceof PDFDict) for (const key of ["ModDate", "CreationDate", "CheckSum"]) params.delete(PDFName.of(key));
    }
  }

  await sweepUnreachable(document);

  return new Blob([await document.save({ useObjectStreams: true }) as BlobPart], { type: "application/pdf" });
}

// --- ZIP-based documents -----------------------------------------------------

async function loadZip(blob: Blob) {
  const { default: JSZip } = await import("jszip");
  return JSZip.loadAsync(await blob.arrayBuffer());
}

function normalizeZipDates(zip: JSZipType) {
  zip.forEach((_, entry) => { entry.date = DOS_EPOCH; });
}

async function generateZip(zip: JSZipType, mime: string, storedFirst?: string): Promise<Blob> {
  // ODF and EPUB require an uncompressed `mimetype` as the very first entry.
  // Re-adding an existing key keeps its position in insertion order; the
  // explicit STORE option survives generation while loaded entries' original
  // compression does not.
  if (storedFirst) {
    const entry = zip.file(storedFirst);
    if (entry) zip.file(storedFirst, await entry.async("uint8array"), { compression: "STORE", date: DOS_EPOCH });
  }
  normalizeZipDates(zip);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: mime });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeXmlElements(xml: string, names: string[]) {
  let output = xml;
  for (const name of names) {
    const escaped = escapeRegExp(name);
    output = output
      .replace(new RegExp(`<${escaped}(?:\\s[^>]*)?>[\\s\\S]*?</${escaped}>`, "g"), "")
      .replace(new RegExp(`<${escaped}(?:\\s[^>]*)?/>`, "g"), "");
  }
  return output;
}

async function rewriteXml(zip: JSZipType, path: string, transform: (xml: string) => string): Promise<boolean> {
  const entry = zip.file(path);
  if (!entry) return false;
  const xml = await entry.async("string");
  const next = transform(xml);
  if (next !== xml) zip.file(path, next);
  return true;
}

function resolveRelTarget(relsPath: string, target: string): string {
  // `word/_rels/document.xml.rels` describes parts relative to `word/`;
  // `_rels/.rels` describes parts relative to the package root.
  const base = relsPath.replace(/_rels\/[^/]+$/, "");
  const segments = (target.startsWith("/") ? target.slice(1) : `${base}${target}`).split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "..") resolved.pop();
    else if (segment && segment !== ".") resolved.push(segment);
  }
  return resolved.join("/");
}

// Remove relationships whose Type ends with one of the suffixes and return the
// package paths they pointed at, so the parts themselves can be dropped too.
async function removeRelationships(zip: JSZipType, relsPath: string, typeSuffixes: string[]): Promise<string[]> {
  const entry = zip.file(relsPath);
  if (!entry) return [];
  const xml = await entry.async("string");
  const removed: string[] = [];
  const next = xml.replace(/<Relationship\b[^>]*\/>|<Relationship\b[^>]*>[\s\S]*?<\/Relationship>/g, (element) => {
    const type = element.match(/\sType="([^"]+)"/)?.[1] || "";
    const target = element.match(/\sTarget="([^"]+)"/)?.[1] || "";
    const mode = element.match(/\sTargetMode="([^"]+)"/)?.[1] || "";
    if (!typeSuffixes.some((suffix) => type.endsWith(suffix))) return element;
    if (mode !== "External" && target) removed.push(resolveRelTarget(relsPath, target));
    return "";
  });
  if (next !== xml) zip.file(relsPath, next);
  return removed;
}

async function removeParts(zip: JSZipType, paths: string[]) {
  const unique = [...new Set(paths)].filter((path) => zip.file(path));
  for (const path of unique) zip.remove(path);
  if (unique.length) await rewriteXml(zip, "[Content_Types].xml", (xml) => unique.reduce((output, path) => output.replace(new RegExp(`<Override\\b[^>]*PartName="/${escapeRegExp(path)}"[^>]*/>`, "g"), ""), xml));
  return unique.length;
}

function anonymizeAuthors(xml: string): string {
  return xml
    .replace(/\sw:author="[^"]*"/g, ' w:author="Author"')
    .replace(/\sw:initials="[^"]*"/g, ' w:initials="A"')
    .replace(/\sw:date="[^"]*"/g, "")
    .replace(/\sw:dateUtc="[^"]*"/g, "")
    .replace(/<author>[^<]*<\/author>/g, "<author>Author</author>")
    .replace(/\s(?:dT|dt|created|lastModified|modified)="[^"]*"/g, "")
    .replace(/\s(?:displayName|name)="[^"]*"/g, (match) => match.startsWith(" displayName") ? ' displayName="Author"' : ' name="Author"')
    .replace(/\sinitials="[^"]*"/g, ' initials="A"')
    .replace(/\s(?:userId|providerId|userName|lastModifiedBy)="[^"]*"/g, "");
}

export async function stripOoxmlMetadata(file: File, wasmFetch?: WasmFetch, options: CleanOptions = {}): Promise<CleanResult> {
  const zip = await loadZip(file);
  const notes: string[] = [];
  const names = Object.keys(zip.files);
  // Core properties: title, subject, creator, keywords, description,
  // lastModifiedBy, revision, created/modified, category, status, identifier…
  // An empty coreProperties element is valid, so keep only the root.
  await rewriteXml(zip, "docProps/core.xml", (xml) => {
    const declaration = xml.match(/^<\?xml[^>]*\?>\s*/)?.[0] || "";
    const open = xml.match(/<((?:[A-Za-z0-9]+:)?coreProperties)\b[^>]*>/);
    return open ? `${declaration}${open[0]}</${open[1]}>` : xml;
  });
  await rewriteXml(zip, "docProps/app.xml", (xml) => removeXmlElements(xml, ["Company", "Manager", "HyperlinkBase", "Template", "TotalTime"]));

  // Custom properties, the preview thumbnail (it is a rendered picture of the
  // first page, often with its own EXIF) and Word's people list leave entirely,
  // with their relationships and content-type overrides, so the package stays valid.
  const rootRemoved = await removeRelationships(zip, "_rels/.rels", ["/custom-properties", "/metadata/thumbnail"]);
  const removedParts: string[] = [...rootRemoved];
  for (const relsPath of names.filter((name) => /^(word|xl|ppt)\/_rels\/(document|workbook|presentation)\.xml\.rels$/.test(name))) {
    removedParts.push(...await removeRelationships(zip, relsPath, ["/people", "/attachedTemplate", "/mailMergeSource", "/mailMergeHeaderSource", "/recipientData", "/metadata/thumbnail"]));
  }
  for (const relsPath of names.filter((name) => /^word\/_rels\/settings\.xml\.rels$/.test(name))) {
    removedParts.push(...await removeRelationships(zip, relsPath, ["/attachedTemplate", "/mailMergeSource", "/mailMergeHeaderSource", "/recipientData"]));
  }
  if (zip.file("docProps/custom.xml")) removedParts.push("docProps/custom.xml");
  for (const name of names) if (/^docProps\/thumbnail\.[a-z]+$/i.test(name) || /^word\/people\.xml$/.test(name)) removedParts.push(name);
  const dropped = await removeParts(zip, removedParts);
  if (dropped) notes.push(`${dropped} hidden part${dropped === 1 ? "" : "s"} removed (custom properties, thumbnail, people list or template links).`);

  // Word: revision/comment authors, tracked-change dates, revision ids and the
  // template or mail-merge pointers that hold absolute paths.
  for (const name of names.filter((entry) => /^word\/(document|comments|commentsExtended|commentsIds|footnotes|endnotes|header\d*|footer\d*|settings|glossary\/document)\.xml$/.test(entry))) {
    await rewriteXml(zip, name, (xml) => anonymizeAuthors(xml)
      .replace(/\sw:rsid[A-Za-z]*="[^"]*"/g, "")
      .replace(/<w:rsids>[\s\S]*?<\/w:rsids>/g, "")
      .replace(/<w:rsid\b[^>]*\/>/g, "")
      .replace(/<w:attachedTemplate\b[^>]*\/>/g, "")
      .replace(/<w:mailMerge\b[^>]*>[\s\S]*?<\/w:mailMerge>/g, "")
      .replace(/<w:mailMerge\b[^>]*\/>/g, ""));
  }
  // Excel: the absolute path of the last save, comment authors, threaded-comment
  // people and timestamps.
  await rewriteXml(zip, "xl/workbook.xml", (xml) => xml.replace(/<x15ac:absPath\b[^>]*\/>/g, "").replace(/<x15ac:absPath\b[^>]*>[\s\S]*?<\/x15ac:absPath>/g, ""));
  for (const name of names.filter((entry) => /^xl\/(comments\d*|threadedComments\/threadedComment\d*|persons\/person\d*)\.xml$/.test(entry))) await rewriteXml(zip, name, anonymizeAuthors);
  // PowerPoint: legacy and modern comment author lists.
  for (const name of names.filter((entry) => /^ppt\/(commentAuthors|authors|comments\/[^/]+)\.xml$/.test(entry))) await rewriteXml(zip, name, anonymizeAuthors);

  const embedded = wasmFetch ? await cleanZipEntries(zip, wasmFetch, options) : 0;
  if (embedded) notes.push(`${embedded} embedded media file${embedded === 1 ? "" : "s"} cleaned inside the document.`);
  if (names.some((name) => name.startsWith("customXml/"))) notes.push("Custom XML parts were kept because content controls can depend on them; review them if the file came from SharePoint.");
  return { blob: await generateZip(zip, file.type || "application/octet-stream"), notes, embedded };
}

export async function stripOdfMetadata(file: File, wasmFetch?: WasmFetch, options: CleanOptions = {}): Promise<CleanResult> {
  const zip = await loadZip(file);
  const notes: string[] = [];
  await rewriteXml(zip, "meta.xml", (xml) => {
    const declaration = xml.match(/^<\?xml[^>]*\?>\s*/)?.[0] || "";
    const open = xml.match(/<office:document-meta\b[^>]*>/)?.[0];
    return open ? `${declaration}${open}<office:meta/></office:document-meta>` : xml;
  });
  const thumbnails = Object.keys(zip.files).filter((name) => name.startsWith("Thumbnails/") && !zip.files[name].dir);
  for (const name of thumbnails) zip.remove(name);
  if (zip.file("Thumbnails/")) zip.remove("Thumbnails/");
  if (thumbnails.length) {
    await rewriteXml(zip, "META-INF/manifest.xml", (xml) => xml.replace(/<manifest:file-entry\b[^>]*manifest:full-path="Thumbnails\/[^"]*"[^>]*\/>/g, "").replace(/<manifest:file-entry\b[^>]*manifest:full-path="Thumbnails\/[^"]*"[^>]*>[\s\S]*?<\/manifest:file-entry>/g, ""));
    notes.push("Preview thumbnail removed.");
  }
  const embedded = wasmFetch ? await cleanZipEntries(zip, wasmFetch, options) : 0;
  if (embedded) notes.push(`${embedded} embedded media file${embedded === 1 ? "" : "s"} cleaned inside the document.`);
  return { blob: await generateZip(zip, file.type || "application/vnd.oasis.opendocument.text", "mimetype"), notes, embedded };
}

export async function stripEpubMetadata(file: File, wasmFetch?: WasmFetch, options: CleanOptions = {}): Promise<CleanResult> {
  const zip = await loadZip(file);
  const notes: string[] = [];
  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (opfPath && zip.file(opfPath)) {
    await rewriteXml(zip, opfPath, (xml) => xml
      .replace(/<dc:date\b[^>]*>[\s\S]*?<\/dc:date>/g, "")
      .replace(/<dc:source\b[^>]*>[\s\S]*?<\/dc:source>/g, "")
      .replace(/<meta\b[^>]*name="(?:calibre:[^"]*|generator|Sigil version|cover-image-uuid)"[^>]*\/>/g, "")
      .replace(/<meta\b[^>]*name="(?:calibre:[^"]*|generator)"[^>]*>[\s\S]*?<\/meta>/g, "")
      .replace(/<meta\b[^>]*property="(?:calibre:[^"]*|dcterms:(?:created|date|issued|dateCopyrighted))"[^>]*>[\s\S]*?<\/meta>/g, "")
      // dcterms:modified is mandatory in EPUB 3, so it is neutralized rather than removed.
      .replace(/(<meta\b[^>]*property="dcterms:modified"[^>]*>)[\s\S]*?(<\/meta>)/g, "$11980-01-01T00:00:00Z$2"));
    notes.push("Title, author and language kept because readers rely on them; dates, generator tags and library fields removed.");
  }
  // Reading positions and bookmarks written by reader apps.
  for (const name of Object.keys(zip.files).filter((entry) => /^META-INF\/(calibre_bookmarks\.txt|com\.apple\.ibooks\.display-options\.xml|calibre_resources)/.test(entry))) zip.remove(name);
  const embedded = wasmFetch ? await cleanZipEntries(zip, wasmFetch, options) : 0;
  if (embedded) notes.push(`${embedded} embedded image${embedded === 1 ? "" : "s"} cleaned inside the book.`);
  return { blob: await generateZip(zip, file.type || "application/epub+zip", "mimetype"), notes, embedded };
}

export async function stripZipArchive(file: File, wasmFetch: WasmFetch, options: CleanOptions = {}): Promise<CleanResult> {
  const zip = await loadZip(file);
  const embedded = await cleanZipEntries(zip, wasmFetch, options);
  const notes = [embedded ? `${embedded} file${embedded === 1 ? "" : "s"} inside the archive cleaned; entry timestamps normalized.` : "No cleanable files found inside; entry timestamps normalized."];
  return { blob: await generateZip(zip, file.type || "application/zip"), notes, embedded };
}

// Walk every entry in a loaded archive and clean the ones with a working route.
// Documents inside documents (a .docx embedded in a .pptx, a ZIP in a ZIP)
// recurse up to MAX_ZIP_DEPTH levels.
async function cleanZipEntries(zip: JSZipType, wasmFetch: WasmFetch, options: CleanOptions): Promise<number> {
  const depth = options.depth || 0;
  let cleaned = 0;
  const entries: Array<[string, ZipEntry]> = [];
  zip.forEach((path, entry) => { if (!entry.dir) entries.push([path, entry]); });
  for (const [path, entry] of entries) {
    const route = routeFor(path);
    if (route === "plain" || route === "unsupported" || route === "html") continue;
    if (["zip", "ooxml", "odf", "epub"].includes(route) && depth >= MAX_ZIP_DEPTH) continue;
    const name = path.split("/").pop() || path;
    try {
      options.progress?.(`Cleaning ${name} inside the package`);
      const nested = new File([await entry.async("uint8array") as BlobPart], name);
      const result = await stripFileMetadata(nested, wasmFetch, { ...options, depth: depth + 1 });
      zip.file(path, await result.blob.arrayBuffer());
      cleaned += 1 + result.embedded;
    } catch { /* an entry that cannot be rewritten keeps its original bytes */ }
  }
  return cleaned;
}

// --- Text formats --------------------------------------------------------------

export function stripSvgText(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, "")
    .replace(/<metadata\b[^>]*\/>/gi, "")
    .replace(/<rdf:RDF\b[^>]*>[\s\S]*?<\/rdf:RDF>/gi, "")
    .replace(/<\?xpacket[\s\S]*?\?>/g, "")
    .replace(/<sodipodi:namedview\b[^>]*>[\s\S]*?<\/sodipodi:namedview>/gi, "")
    .replace(/<sodipodi:namedview\b[^>]*\/>/gi, "")
    .replace(/\s+(?:inkscape|sodipodi|illustrator|xap|dc|cc):[A-Za-z0-9_-]+="[^"]*"/g, "")
    .replace(/\s+(?:inkscape|sodipodi|illustrator|xap|dc|cc):[A-Za-z0-9_-]+='[^']*'/g, "")
    .replace(/\s+xmlns:(?:inkscape|sodipodi|illustrator|xap|rdf|cc|dc|x)="[^"]*"/g, "")
    .replace(/<\?xml-stylesheet[^>]*\?>/g, (match) => (/href="file:/i.test(match) ? "" : match));
}

export function stripHtmlText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<meta\b[^>]*\bname\s*=\s*["']?(?:author|generator|creator|publisher|date|created|modified|last-modified|revised|originator|progid|copyright|owner|contact|email|reply-to|geo\.[A-Za-z.]+|ICBM|classification|dc\.(?:creator|date|publisher|rights|contributor|identifier)|dcterms\.[A-Za-z]+|exported-from|source|last-saved-by)["']?[^>]*>/gi, "")
    .replace(/<meta\b[^>]*\bproperty\s*=\s*["']?(?:article:(?:author|published_time|modified_time)|og:updated_time)["']?[^>]*>/gi, "")
    .replace(/<xml>\s*<o:DocumentProperties>[\s\S]*?<\/o:DocumentProperties>\s*<\/xml>/gi, "")
    .replace(/<o:DocumentProperties>[\s\S]*?<\/o:DocumentProperties>/gi, "")
    .replace(/<o:(Author|LastAuthor|Created|LastSaved|Revision|TotalTime|Company|Version)>[\s\S]*?<\/o:\1>/gi, "");
}

// Remove a whole RTF group starting at `start` ("{"), honouring nesting and
// backslash-escaped braces. Returns the index just after the closing brace.
function rtfGroupEnd(rtf: string, start: number): number {
  let depth = 0;
  for (let index = start; index < rtf.length; index += 1) {
    const character = rtf[index];
    if (character === "\\") { index += 1; continue; }
    if (character === "{") depth += 1;
    else if (character === "}") { depth -= 1; if (depth === 0) return index + 1; }
  }
  return rtf.length;
}

export function stripRtfText(rtf: string): string {
  let output = rtf;
  for (const opener of [/\{\\info\b/g, /\{\\\*\\userprops\b/g, /\{\\\*\\xmlnstbl\b/g, /\{\\\*\\protusertbl\b/g, /\{\\\*\\datafield\b/g]) {
    let match: RegExpExecArray | null;
    opener.lastIndex = 0;
    while ((match = opener.exec(output)) !== null) {
      const end = rtfGroupEnd(output, match.index);
      output = output.slice(0, match.index) + output.slice(end);
      opener.lastIndex = match.index;
    }
  }
  // Revision authors stay structurally present so tracked changes still open,
  // but every name becomes "Author".
  const revision = /\{\\\*\\revtbl\b/.exec(output);
  if (revision) {
    const end = rtfGroupEnd(output, revision.index);
    const table = output.slice(revision.index, end).replace(/\{([^{}\\]+);\}/g, "{Author;}");
    output = output.slice(0, revision.index) + table + output.slice(end);
  }
  return output.replace(/\\(?:creatim|revtim|printim|buptim)[^}]*\}/g, "}");
}

async function stripText(file: File, transform: (text: string) => string, mime: string): Promise<CleanResult> {
  const text = await file.text();
  return { blob: new Blob([transform(text)], { type: file.type || mime }), notes: [], embedded: 0 };
}

// --- Orchestration -------------------------------------------------------------

export async function stripFileMetadata(file: File, wasmFetch: WasmFetch, options: CleanOptions = {}): Promise<CleanResult> {
  const route = routeFor(file.name);
  const extension = extensionOf(file.name);
  switch (route) {
    case "pdf": return { blob: await stripPdfMetadata(file), notes: ["Annotation authors anonymized; orphaned objects from earlier saves removed."], embedded: 0 };
    case "ooxml": return stripOoxmlMetadata(file, wasmFetch, options);
    case "odf": return stripOdfMetadata(file, wasmFetch, options);
    case "epub": return stripEpubMetadata(file, wasmFetch, options);
    case "zip": return stripZipArchive(file, wasmFetch, options);
    case "svg": return stripText(file, stripSvgText, "image/svg+xml");
    case "html": return stripText(file, stripHtmlText, "text/html");
    case "rtf": return stripText(file, stripRtfText, "application/rtf");
    case "plain": return { blob: file, notes: ["This format has no metadata container, so there was nothing to remove."], embedded: 0 };
    case "raw": return { blob: await stripWithExiftool(file, wasmFetch, "raw"), notes: ["Camera maker notes were kept so RAW converters can still open the file; any serial number inside them may remain."], embedded: 0 };
    case "exiftool": return { blob: await stripWithExiftool(file, wasmFetch, "full"), notes: ["Colour profile and orientation kept so the image looks identical."], embedded: 0 };
    case "media": {
      try {
        return await stripMediaMetadata(file, options.progress);
      } catch (error) {
        if (!quickTimeFamily.has(extension)) throw error;
        // The media engine rejected the container; ExifTool can still rewrite
        // the QuickTime tag atoms, which covers the common phone recordings.
        return { blob: await stripWithExiftool(file, wasmFetch, "quicktime"), notes: ["Rewritten with ExifTool because the media engine could not remux this container."], embedded: 0 };
      }
    }
    default: throw new Error(unsupportedReason(file.name));
  }
}

export type VerifiedClean = CleanResult & { after: MetadataField[]; report: FieldReport; passes: number };

// Clean, re-inspect, and when identifying fields survive a route that ExifTool
// can also write, run one more ExifTool pass before reporting the final state.
export async function cleanAndVerify(file: File, wasmFetch: WasmFetch, progress?: (message: string) => void): Promise<VerifiedClean> {
  const result = await stripFileMetadata(file, wasmFetch, { progress });
  let passes = 1;
  let after: MetadataField[] = [];
  const inspectable = routeFor(file.name) !== "plain";
  if (inspectable) {
    progress?.(`Verifying ${file.name}`);
    try { after = await inspectMetadata(result.blob, file.name, wasmFetch); } catch { after = []; }
  }
  let report = classifyFields(after);
  const extension = extensionOf(file.name);
  const route = routeFor(file.name);
  if (report.identifying.length && route !== "exiftool" && route !== "raw" && (exiftoolImages.has(extension) || quickTimeFamily.has(extension))) {
    try {
      progress?.(`Second pass on ${file.name}`);
      const second = await stripWithExiftool(new File([result.blob], file.name, { type: file.type }), wasmFetch, quickTimeFamily.has(extension) ? "quicktime" : "full");
      const verified = await inspectMetadata(second, file.name, wasmFetch);
      const secondReport = classifyFields(verified);
      if (secondReport.identifying.length < report.identifying.length) {
        result.blob = second;
        result.notes.push(`A second ExifTool pass removed ${report.identifying.length - secondReport.identifying.length} more field${report.identifying.length - secondReport.identifying.length === 1 ? "" : "s"}.`);
        after = verified;
        report = secondReport;
        passes = 2;
      }
    } catch { /* keep the first-pass output */ }
  }
  return { ...result, after, report, passes };
}
