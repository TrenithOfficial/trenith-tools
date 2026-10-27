export type ToolKind = "device" | "byok" | "web";
export type ToolCategory = "Audio" | "Video" | "PDF" | "Image" | "Privacy" | "AI Studio" | "Music" | "SEO" | "Developer";

export type ToolDefinition = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  category: ToolCategory;
  kind: ToolKind;
  icon: string;
  accent: "cyan" | "violet" | "blue" | "rose" | "amber" | "lime";
  formats?: string[];
  steps: string[];
};

export const tools: ToolDefinition[] = [
  {
    slug: "metadata-remover", name: "Metadata Remover", shortName: "Metadata Remover", category: "Privacy", kind: "device", icon: "⌫", accent: "cyan",
    description: "Inspect, remove and verify GPS, author, device, timestamp and application metadata from images, RAW, audio, video, PDF, Office, OpenDocument, EPUB, SVG, HTML, RTF and ZIP files — including the media embedded inside documents — on your device.", formats: ["JPG", "PNG", "WebP", "HEIC", "AVIF", "TIFF", "RAW", "MP4", "MOV", "MKV", "AVI", "MP3", "FLAC", "WAV", "PDF", "DOCX", "XLSX", "PPTX", "ODT", "EPUB", "SVG", "HTML", "RTF", "ZIP", "and more"],
    steps: ["Choose any files or an entire folder", "Review identifying fields grouped by location, identity, device, time and software", "Remove, re-verify and download cleaned copies or one ZIP"],
  },
  {
    slug: "audio-downloader", name: "Audio Downloader", shortName: "Audio Downloader", category: "Audio", kind: "web", icon: "↓", accent: "cyan",
    description: "Discover direct public audio files exposed by a webpage or media URL without bypassing access controls.", formats: ["MP3", "WAV", "M4A", "AAC", "OGG", "FLAC", "OPUS"],
    steps: ["Paste a public page or direct audio URL", "Review the audio links the source exposes", "Preview and download authorized files"],
  },
  {
    slug: "audio-joiner", name: "Audio Joiner", shortName: "Audio Joiner", category: "Audio", kind: "device", icon: "≋", accent: "violet",
    description: "Join audio files or complete folders in a chosen order and export one lossless WAV on your device.", formats: ["MP3", "WAV", "M4A", "AAC", "OGG", "FLAC", "OPUS", "WebM"],
    steps: ["Choose files or an audio folder", "Reorder or remove tracks", "Join and download one WAV"],
  },
  {
    slug: "audio-converter", name: "Audio Format Converter", shortName: "Audio Converter", category: "Audio", kind: "device", icon: "↻", accent: "amber",
    description: "Convert one file or a whole folder between MP3, M4A/AAC, WAV, FLAC, ALAC, AIFF, Ogg Vorbis, Opus, WebM, WavPack, AC3 and WMA with bitrate, sample-rate, channel and bit-depth control, tags and cover art kept — all in a private in-browser media engine.", formats: ["MP3", "M4A", "AAC", "WAV", "FLAC", "ALAC", "AIFF", "OGG", "OPUS", "WebM", "WavPack", "AC3", "WMA"],
    steps: ["Choose audio files or a folder (video files work too)", "Pick the format, bitrate and optional sample rate, channels or bit depth", "Convert the batch, preview each result and download one ZIP"],
  },
  {
    slug: "audio-trimmer", name: "Audio Trimmer & Cutter", shortName: "Audio Trimmer", category: "Audio", kind: "device", icon: "✂", accent: "rose",
    description: "Cut a time range from any audio file without re-encoding — same format, no quality loss — or export the cut as WAV, FLAC, MP3, M4A, Opus and more, without uploading the recording.", formats: ["MP3", "WAV", "FLAC", "OGG", "OPUS", "M4A", "AAC", "WebM", "AIFF", "WMA"],
    steps: ["Choose an audio file", "Set the start and end time", "Cut losslessly or pick an output format, then preview and download"],
  },
  {
    slug: "audio-volume-changer", name: "Audio Volume Changer", shortName: "Volume Changer", category: "Audio", kind: "device", icon: "◒", accent: "lime",
    description: "Reduce, mute or amplify audio up to 400% and export it as lossless WAV or FLAC, or as MP3, M4A, Opus and other formats, locally in your browser.", formats: ["MP3", "WAV", "FLAC", "OGG", "OPUS", "M4A", "AAC", "WebM", "AIFF"],
    steps: ["Choose an audio file", "Set the output volume and format", "Create, preview and download the adjusted file"],
  },
  {
    slug: "video-joiner", name: "Video Joiner", shortName: "Video Joiner", category: "Video", kind: "device", icon: "▶", accent: "cyan",
    description: "Combine clips or folders in order. Matching clips are joined losslessly in seconds; mixed sources are re-recorded into one high-quality WebM or MP4 on your device.", formats: ["MP4", "WebM", "MOV", "M4V", "MKV", "OGV"],
    steps: ["Choose clips or a video folder", "Arrange the playback order", "Join losslessly when codecs match, otherwise record one file"],
  },
  {
    slug: "video-converter", name: "Video Converter", shortName: "Video Converter", category: "Video", kind: "device", icon: "⇄", accent: "violet",
    description: "Convert video to MP4, WebM, MKV or MOV in your browser. Codecs that already fit the target container are copied losslessly in seconds; otherwise H.264/VP8 re-encoding with quality, resolution, frame-rate and rotation control.", formats: ["MP4", "WebM", "MKV", "MOV", "AVI", "WMV", "TS", "MPEG", "3GP", "FLV", "OGV"],
    steps: ["Choose a video file", "Pick the container, quality and any resize or rotation", "Convert — lossless copy when possible — then preview and download"],
  },
  {
    slug: "video-compressor", name: "Video Compressor", shortName: "Compress Video", category: "Video", kind: "device", icon: "⇲", accent: "lime",
    description: "Shrink a video by quality level or to a target size in MB with H.264 encoding, optional 1080p/720p caps and frame-rate limits — entirely on your device.", formats: ["MP4", "MOV", "MKV", "WebM", "AVI", "WMV"],
    steps: ["Choose a video file", "Pick a quality level or enter a target size", "Compress, compare sizes and download"],
  },
  {
    slug: "video-trimmer", name: "Video Trimmer & Cutter", shortName: "Video Trimmer", category: "Video", kind: "device", icon: "✂", accent: "rose",
    description: "Cut a clip from a video losslessly in seconds (keyframe-accurate) or frame-accurately with a fast re-encode, without uploading the file.", formats: ["MP4", "MOV", "MKV", "WebM", "AVI", "TS"],
    steps: ["Choose a video file", "Set start and end times", "Cut losslessly or frame-accurately, then download"],
  },
  {
    slug: "video-to-audio", name: "Extract Audio from Video", shortName: "Video to Audio", category: "Video", kind: "device", icon: "♪", accent: "amber",
    description: "Pull the soundtrack out of a video as MP3, M4A, WAV, FLAC, Opus or Ogg. Matching codecs are copied bit-for-bit; others are encoded at your chosen bitrate.", formats: ["MP4", "MOV", "MKV", "WebM", "AVI", "MP3", "M4A", "WAV", "FLAC", "OPUS"],
    steps: ["Choose a video file", "Pick the audio format and bitrate", "Extract, preview and download"],
  },
  {
    slug: "video-to-gif", name: "Video to GIF", shortName: "Video to GIF", category: "Video", kind: "device", icon: "GIF", accent: "cyan",
    description: "Turn a clip into a smooth, palette-optimized animated GIF with a chosen time range, frame rate and width — processed privately in your browser.", formats: ["MP4", "MOV", "MKV", "WebM", "GIF"],
    steps: ["Choose a video file", "Set the time range, frame rate and width", "Render the GIF and download"],
  },
  {
    slug: "merge-pdf", name: "Merge PDF", shortName: "Merge PDF", category: "PDF", kind: "device", icon: "⊕", accent: "violet",
    description: "Combine multiple PDF documents in the exact order you choose without uploading them.", formats: ["PDF"],
    steps: ["Choose two or more PDFs", "Arrange their order", "Merge and download"],
  },
  {
    slug: "split-pdf", name: "Split PDF", shortName: "Split PDF", category: "PDF", kind: "device", icon: "✂", accent: "amber",
    description: "Turn every page into an individual PDF and download the complete set as a ZIP archive.", formats: ["PDF", "ZIP"],
    steps: ["Choose one PDF", "Create a PDF for every page", "Download the ZIP archive"],
  },
  {
    slug: "organize-pdf", name: "Extract & Organize PDF", shortName: "Organize PDF", category: "PDF", kind: "device", icon: "▦", accent: "blue",
    description: "Select pages and page ranges to create a new organized PDF in the order you specify.", formats: ["PDF"],
    steps: ["Choose a PDF", "Enter pages such as 1-3,5,8", "Download the organized document"],
  },
  {
    slug: "compress-pdf", name: "Optimize PDF", shortName: "Compress PDF", category: "PDF", kind: "device", icon: "⇲", accent: "lime",
    description: "Shrink a PDF on your device: embedded photos are re-encoded at a chosen quality and resolution while text, vectors, fonts and links stay untouched, and orphaned data from earlier saves is removed.", formats: ["PDF"],
    steps: ["Choose a PDF", "Pick image quality and a maximum image size, or structure-only mode", "Compare sizes and download the result"],
  },
  {
    slug: "rotate-pdf", name: "Rotate PDF", shortName: "Rotate PDF", category: "PDF", kind: "device", icon: "↻", accent: "cyan",
    description: "Rotate every page clockwise and export a clean replacement PDF on your device.", formats: ["PDF"],
    steps: ["Choose a PDF", "Rotate every page by 90 degrees", "Download the rotated file"],
  },
  {
    slug: "page-numbers", name: "Add PDF Page Numbers", shortName: "Page Numbers", category: "PDF", kind: "device", icon: "#", accent: "violet",
    description: "Add centered page numbers and total page counts to an entire document.", formats: ["PDF"],
    steps: ["Choose a PDF", "Apply consistent numbering", "Download the numbered document"],
  },
  {
    slug: "watermark-pdf", name: "Watermark PDF", shortName: "Watermark PDF", category: "PDF", kind: "device", icon: "W", accent: "blue",
    description: "Apply a custom diagonal text watermark across every PDF page without uploading the document.", formats: ["PDF"],
    steps: ["Choose a PDF", "Enter watermark text", "Apply and download"],
  },
  {
    slug: "jpg-to-pdf", name: "JPG & PNG to PDF", shortName: "Images to PDF", category: "PDF", kind: "device", icon: "▧", accent: "rose",
    description: "Create a polished multi-page PDF from JPG, PNG, WebP, HEIC, AVIF, TIFF, GIF, BMP or SVG images in your chosen order.", formats: ["JPG", "PNG", "WebP", "HEIC", "AVIF", "TIFF", "GIF", "BMP", "SVG", "PDF"],
    steps: ["Choose images in any common format", "Arrange the page order", "Create and download the PDF"],
  },
  {
    slug: "pdf-to-image", name: "PDF to JPG, PNG & WebP", shortName: "PDF to Image", category: "PDF", kind: "device", icon: "▣", accent: "cyan",
    description: "Render every PDF page — or a page range — to JPG, PNG or WebP at 72 to 300 dpi with the pdf.js engine, entirely in your browser, and download the set as a ZIP.", formats: ["PDF", "JPG", "PNG", "WebP"],
    steps: ["Choose a PDF", "Pick the format, resolution and pages", "Render and download every page or one ZIP"],
  },
  {
    slug: "pdf-to-text", name: "Extract Text from PDF", shortName: "PDF to Text", category: "PDF", kind: "device", icon: "Tt", accent: "amber",
    description: "Read the real text layer out of a PDF with page markers and reconstructed line breaks, copy it or save a .txt — on your device, with no upload.", formats: ["PDF", "TXT"],
    steps: ["Choose a PDF", "Extract the text layer", "Copy, download or send it to an AI Studio workflow"],
  },
  {
    slug: "image-editor", name: "Image Editor", shortName: "Image Editor", category: "Image", kind: "device", icon: "✦", accent: "violet",
    description: "Crop, resize, rotate and convert images on your device — opens HEIC, TIFF, SVG, JPG, PNG, WebP, GIF, BMP and AVIF, exports JPG, PNG, WebP, AVIF, GIF, BMP, ICO or TIFF, with exact px, inch, cm or percent dimensions and high-quality resampling.", formats: ["JPG", "PNG", "WebP", "AVIF", "GIF", "BMP", "ICO", "TIFF", "HEIC", "SVG"],
    steps: ["Choose an image", "Crop, resize, rotate or flip with clear dimensions", "Pick a format and export"],
  },
  {
    slug: "image-compressor", name: "Image Compressor", shortName: "Compress Image", category: "Image", kind: "device", icon: "◫", accent: "lime",
    description: "Shrink image size with a live preview, high-quality resampling and a quality slider — one image in the editor or a whole folder in batch mode with a single ZIP download.", formats: ["JPG", "PNG", "WebP", "AVIF", "HEIC", "TIFF"],
    steps: ["Choose an image or a folder", "Set the size, format and quality", "Export the optimized image or ZIP"],
  },
  {
    slug: "image-resizer", name: "Image Resizer", shortName: "Resize Image", category: "Image", kind: "device", icon: "↔", accent: "cyan",
    description: "Resize to exact width and height in px, inch, cm or percent with a DPI, aspect lock and crisp stepped resampling — or cap a whole folder to a maximum size in batch mode.", formats: ["JPG", "PNG", "WebP", "AVIF", "HEIC", "TIFF"],
    steps: ["Choose an image or a folder", "Enter exact dimensions and units", "Download the resized file or ZIP"],
  },
  {
    slug: "image-converter", name: "Image Converter", shortName: "Image Converter", category: "Image", kind: "device", icon: "⇄", accent: "violet",
    description: "Convert images to JPG, PNG, WebP, AVIF, GIF, BMP, ICO or TIFF at full resolution — opens HEIC, TIFF and SVG too — one at a time or a whole folder to a ZIP, entirely in your browser.", formats: ["JPG", "PNG", "WebP", "AVIF", "GIF", "BMP", "ICO", "TIFF", "HEIC", "SVG"],
    steps: ["Choose an image or a folder", "Select the output format and quality", "Convert and download the file or ZIP"],
  },
  {
    slug: "tap-bpm", name: "Tap BPM", shortName: "Tap BPM", category: "Music", kind: "device", icon: "♩", accent: "rose",
    description: "Tap along to a song to calculate tempo from the most recent beat intervals.",
    steps: ["Press the beat button in time", "Review the stabilized BPM", "Reset for a new song"],
  },
  {
    slug: "bpm-delay-calculator", name: "BPM Delay Calculator", shortName: "Delay Calculator", category: "Music", kind: "device", icon: "⌁", accent: "amber",
    description: "Convert BPM into millisecond values for whole, half, quarter, eighth and sixteenth notes.",
    steps: ["Enter the track BPM", "Review straight, dotted and triplet timing", "Use values in your DAW"],
  },
  {
    slug: "note-frequency", name: "Note Frequency Calculator", shortName: "Note Frequency", category: "Music", kind: "device", icon: "Hz", accent: "cyan",
    description: "Calculate equal-temperament note frequencies with an adjustable A4 tuning reference.",
    steps: ["Choose a note and octave", "Set the A4 reference", "Copy the exact frequency"],
  },
  {
    slug: "metronome", name: "Online Metronome", shortName: "Metronome", category: "Music", kind: "device", icon: "△", accent: "violet",
    description: "Practice with a stable browser-generated click, adjustable tempo and accent pattern.",
    steps: ["Set BPM and beats per bar", "Start the metronome", "Practice with the accented downbeat"],
  },
  {
    slug: "serp-snippet-preview", name: "SERP Snippet Preview", shortName: "SERP Preview", category: "SEO", kind: "device", icon: "⌕", accent: "blue",
    description: "Preview how a page title, URL and meta description render in Google-style desktop and mobile results, with character and approximate pixel limits checked on your device.",
    steps: ["Enter the page title, URL and meta description", "Review the live desktop and mobile snippet preview", "Adjust the text until every length check passes"],
  },
  {
    slug: "keyword-density-analyzer", name: "Keyword Density & Content Analyzer", shortName: "Keyword Density", category: "SEO", kind: "device", icon: "%", accent: "lime",
    description: "Analyze pasted text for word counts, reading time, readability, top keyword and phrase densities and the questions it already answers — entirely in your browser.",
    steps: ["Paste the draft or published copy", "Review counts, readability and keyword densities", "Balance overused terms and cover missing questions"],
  },
  {
    slug: "ai-song-generator", name: "AI Song Generator", shortName: "Song Generator", category: "AI Studio", kind: "byok", icon: "✦", accent: "violet",
    description: "Send a structured song brief to your connected music provider or compatible generation endpoint.",
    steps: ["Connect your provider key", "Write a style, mood and lyric brief", "Generate through your own provider account"],
  },
  {
    slug: "ai-vocal-generator", name: "AI Vocal Generator", shortName: "Vocal Generator", category: "AI Studio", kind: "byok", icon: "◉", accent: "rose",
    description: "Create a vocal brief or call a connected provider endpoint using your own credentials.",
    steps: ["Connect a supported provider", "Describe the voice and performance", "Run the provider workflow"],
  },
  {
    slug: "cover-remix", name: "Authorized Cover & Remix", shortName: "Cover & Remix", category: "AI Studio", kind: "byok", icon: "∞", accent: "amber",
    description: "Prepare and run cover or remix jobs for audio you own or have permission to transform.",
    steps: ["Connect a provider", "Use audio you are authorized to transform", "Run and download from the provider"],
  },
  {
    slug: "stem-separator", name: "Stem Separator", shortName: "Stem Separator", category: "AI Studio", kind: "byok", icon: "≋", accent: "blue",
    description: "Separate vocals, drums, bass and instruments through your own compatible audio provider API.",
    steps: ["Add a provider connection", "Upload an authorized audio file", "Run the stem-separation endpoint"],
  },
  {
    slug: "text-to-speech", name: "Text to Speech", shortName: "Text to Speech", category: "AI Studio", kind: "byok", icon: "Aa", accent: "cyan",
    description: "Generate speech using your ElevenLabs API key and voice ID, with no Trenith subscription.",
    steps: ["Connect ElevenLabs", "Choose a voice ID and enter text", "Generate and download MP3 audio"],
  },
  {
    slug: "voice-converter", name: "Voice Conversion", shortName: "Voice Conversion", category: "AI Studio", kind: "byok", icon: "◌", accent: "violet",
    description: "Run voice conversion through a provider endpoint you configure and control.",
    steps: ["Connect a compatible endpoint", "Upload authorized voice audio", "Run the conversion job"],
  },
  {
    slug: "audio-to-midi", name: "AI Audio to MIDI", shortName: "Audio to MIDI", category: "AI Studio", kind: "byok", icon: "⌨", accent: "blue",
    description: "Send audio to your own transcription provider and retrieve editable MIDI output.",
    steps: ["Connect a transcription provider", "Choose an audio file", "Run and download the MIDI result"],
  },
  {
    slug: "audio-cleanup", name: "Denoise & De-reverb", shortName: "Audio Cleanup", category: "AI Studio", kind: "byok", icon: "◇", accent: "cyan",
    description: "Use your own audio restoration provider to remove noise, echo or room reverb.",
    steps: ["Connect an audio provider", "Choose the recording", "Run cleanup and retrieve the result"],
  },
  {
    slug: "pdf-summarizer", name: "PDF Summarizer", shortName: "PDF Summarizer", category: "AI Studio", kind: "byok", icon: "Σ", accent: "violet",
    description: "Summarize extracted document text with OpenAI, Anthropic, Gemini or an OpenAI-compatible provider.",
    steps: ["Connect a text model", "Add document text or a brief", "Generate a structured summary"],
  },
  {
    slug: "translate-pdf", name: "Translate PDF Content", shortName: "Translate PDF", category: "AI Studio", kind: "byok", icon: "文", accent: "blue",
    description: "Translate document text with your connected model while keeping the original file private.",
    steps: ["Connect a text model", "Choose source and target languages", "Generate translated content"],
  },
  {
    slug: "ocr-pdf", name: "OCR Document Workflow", shortName: "OCR PDF", category: "AI Studio", kind: "byok", icon: "◎", accent: "rose",
    description: "Connect a vision or OCR endpoint to recognize text from scans you are authorized to process.",
    steps: ["Connect an OCR or vision provider", "Choose a scanned page", "Run recognition and export text"],
  },
  {
    slug: "office-converter", name: "Office Document Converter", shortName: "Office Converter", category: "AI Studio", kind: "byok", icon: "DOC", accent: "amber",
    description: "Connect a document conversion API for Word, PowerPoint, Excel and PDF workflows.",
    steps: ["Connect a conversion endpoint", "Choose a document and output format", "Run and retrieve the converted file"],
  },
  {
    slug: "ai-chat", name: "BYOK AI Chat", shortName: "AI Chat", category: "AI Studio", kind: "byok", icon: "◌", accent: "cyan",
    description: "Ask questions and generate answers with your own OpenAI, Anthropic, Gemini, OpenRouter or compatible model connection.",
    steps: ["Connect a provider you already use", "Enter a question with useful context", "Review, copy or download the provider response"],
  },
  {
    slug: "ai-writer", name: "AI Writing Assistant", shortName: "AI Writer", category: "AI Studio", kind: "byok", icon: "✎", accent: "violet",
    description: "Draft useful original content with a connected language model and clear audience, tone and factual constraints.",
    steps: ["Connect a language model", "Describe the audience, goal and source facts", "Generate and edit the draft"],
  },
  {
    slug: "grammar-checker", name: "AI Grammar Checker", shortName: "Grammar Checker", category: "AI Studio", kind: "byok", icon: "✓", accent: "lime",
    description: "Correct grammar, spelling and clarity while preserving the writer’s meaning and preferred regional English.",
    steps: ["Connect a language model", "Paste the text and choose a regional style", "Review the corrected text and explanations"],
  },
  {
    slug: "paraphraser", name: "Responsible AI Paraphraser", shortName: "Paraphraser", category: "AI Studio", kind: "byok", icon: "⇄", accent: "amber",
    description: "Rewrite text for clarity or tone without fabricating facts, concealing plagiarism or imitating a living author.",
    steps: ["Connect a language model", "Paste authorized source text and choose a tone", "Review the transparent rewrite"],
  },
  {
    slug: "code-assistant", name: "AI Code Assistant", shortName: "Code Assistant", category: "AI Studio", kind: "byok", icon: "</>", accent: "blue",
    description: "Explain, review or draft code with your connected model while keeping secrets and credentials out of prompts.",
    steps: ["Connect a capable model", "Describe the language, runtime and expected behavior", "Review and test the generated code"],
  },
  {
    slug: "regex-generator", name: "AI Regular Expression Builder", shortName: "Regex Builder", category: "AI Studio", kind: "byok", icon: ".*", accent: "rose",
    description: "Generate a regular expression with test cases, edge cases and an explanation for your selected programming language.",
    steps: ["Connect a language model", "Describe matches, exclusions and runtime", "Test the expression against supplied examples"],
  },
  {
    slug: "data-analyzer", name: "AI Data Analysis Planner", shortName: "Data Analyzer", category: "AI Studio", kind: "byok", icon: "Σ", accent: "cyan",
    description: "Turn a dataset description or pasted sample into a defensible analysis plan, formulas, queries and validation checks.",
    steps: ["Connect a language model", "Describe columns, units and the decision to support", "Generate an analysis and verification plan"],
  },
  {
    slug: "seo-brief-generator", name: "SEO & Answer Brief Generator", shortName: "SEO Brief", category: "AI Studio", kind: "byok", icon: "↗", accent: "violet",
    description: "Create a people-first search and answer-engine content brief from verified business facts without keyword stuffing.",
    steps: ["Connect a language model", "Add audience, region, evidence and search intent", "Generate a structured, fact-checked brief"],
  },
  {
    slug: "password-generator", name: "Password Generator", shortName: "Password Generator", category: "Developer", kind: "device", icon: "🔑", accent: "blue",
    description: "Create strong, unique passwords with adjustable length and character sets using your browser's cryptographic random source — never sent anywhere.",
    steps: ["Choose length and character types", "Generate a crypto-strong password", "Copy it — nothing is stored or uploaded"],
  },
  {
    slug: "hash-generator", name: "Hash & Checksum Generator", shortName: "Hash Generator", category: "Developer", kind: "device", icon: "#", accent: "violet",
    formats: ["SHA-256", "SHA-384", "SHA-512", "SHA-1"],
    description: "Compute SHA-256, SHA-384, SHA-512 or SHA-1 hashes of text or a file entirely in your browser to verify integrity and checksums.",
    steps: ["Paste text or choose a file", "Select a hash algorithm", "Compute and copy the hex digest"],
  },
  {
    slug: "uuid-generator", name: "UUID Generator", shortName: "UUID Generator", category: "Developer", kind: "device", icon: "⌗", accent: "cyan",
    description: "Generate one or many random version-4 UUIDs on your device and copy or download the whole set.",
    steps: ["Choose how many UUIDs you need", "Generate version-4 identifiers", "Copy all or download as a text file"],
  },
  {
    slug: "base64-encoder", name: "Base64 Encoder & Decoder", shortName: "Base64", category: "Developer", kind: "device", icon: "⇄", accent: "amber",
    description: "Encode text to Base64 or decode Base64 back to text with full UTF-8 support, processed entirely in your browser.",
    steps: ["Choose encode or decode", "Paste your text or Base64", "Copy the converted result"],
  },
];

export const toolBySlug = Object.fromEntries(tools.map((tool) => [tool.slug, tool])) as Record<string, ToolDefinition>;
export const quickToolSlugs = ["metadata-remover", "video-converter", "audio-converter", "compress-pdf", "pdf-to-image", "image-converter"];
export const quickTools = quickToolSlugs.map((slug) => toolBySlug[slug]);
export const categories: Array<"All" | ToolCategory> = ["All", "Privacy", "Audio", "Video", "PDF", "Image", "Music", "SEO", "Developer", "AI Studio"];

export function kindLabel(kind: ToolKind) {
  if (kind === "device") return "Processed on your device";
  if (kind === "web") return "Public web source";
  return "Uses your API key";
}
