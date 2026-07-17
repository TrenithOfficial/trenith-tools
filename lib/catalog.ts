export type ToolKind = "device" | "byok" | "web";
export type ToolCategory = "Audio" | "Video" | "PDF" | "Image" | "Privacy" | "AI Studio" | "Music";

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
    description: "Inspect, remove and verify private metadata across images, audio, video, documents, archives and other ExifTool-compatible files on your device.", formats: ["JPG", "PNG", "HEIC", "RAW", "TIFF", "MP4", "MOV", "MKV", "MP3", "FLAC", "OGG", "WAV", "PDF", "DOCX", "XLSX", "PPTX", "EPUB", "SVG", "and more"],
    steps: ["Choose any files or an entire folder", "Inspect detected EXIF, GPS, author and application metadata", "Remove, re-scan and download verified cleaned copies"],
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
    slug: "audio-converter", name: "Audio to WAV Converter", shortName: "Audio Converter", category: "Audio", kind: "device", icon: "↻", accent: "amber",
    description: "Decode a browser-compatible audio file and export an uncompressed WAV without uploading it.", formats: ["MP3", "M4A", "AAC", "OGG", "FLAC", "OPUS", "WebM", "WAV"],
    steps: ["Choose an audio file", "Decode it in your browser", "Download a lossless WAV"],
  },
  {
    slug: "video-joiner", name: "Video Joiner", shortName: "Video Joiner", category: "Video", kind: "device", icon: "▶", accent: "cyan",
    description: "Combine compatible video clips or folders in order and record one high-quality WebM on your device.", formats: ["MP4", "WebM", "MOV", "M4V", "OGV"],
    steps: ["Choose clips or a video folder", "Arrange the playback order", "Record and download one WebM"],
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
    description: "Optimize PDF object streams and document structure. Image-heavy documents may require a cloud compression provider.", formats: ["PDF"],
    steps: ["Choose a PDF", "Optimize its internal structure", "Compare and download the result"],
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
    description: "Create a polished multi-page PDF from JPG and PNG images in your chosen order.", formats: ["JPG", "PNG", "PDF"],
    steps: ["Choose JPG or PNG images", "Arrange the page order", "Create and download the PDF"],
  },
  {
    slug: "image-compressor", name: "Image Compressor", shortName: "Compress Image", category: "Image", kind: "device", icon: "◫", accent: "lime",
    description: "Reduce JPG, PNG or WebP dimensions and quality with an instant on-device preview and export.", formats: ["JPG", "PNG", "WebP"],
    steps: ["Choose an image", "Set width, format and quality", "Export the optimized image"],
  },
  {
    slug: "image-resizer", name: "Image Resizer", shortName: "Resize Image", category: "Image", kind: "device", icon: "↔", accent: "cyan",
    description: "Set a maximum width while preserving the original aspect ratio and image privacy.", formats: ["JPG", "PNG", "WebP"],
    steps: ["Choose an image", "Enter the maximum width", "Download the resized file"],
  },
  {
    slug: "image-converter", name: "Image Converter", shortName: "Image Converter", category: "Image", kind: "device", icon: "⇄", accent: "violet",
    description: "Convert compatible images to JPG, PNG or WebP directly in the browser.", formats: ["JPG", "PNG", "WebP"],
    steps: ["Choose an image", "Select the output format", "Convert and download"],
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
];

export const toolBySlug = Object.fromEntries(tools.map((tool) => [tool.slug, tool])) as Record<string, ToolDefinition>;
export const quickToolSlugs = ["metadata-remover", "audio-downloader", "audio-joiner", "video-joiner", "merge-pdf", "image-converter"];
export const quickTools = quickToolSlugs.map((slug) => toolBySlug[slug]);
export const categories: Array<"All" | ToolCategory> = ["All", "Privacy", "Audio", "Video", "PDF", "Image", "Music", "AI Studio"];

export function kindLabel(kind: ToolKind) {
  if (kind === "device") return "Processed on your device";
  if (kind === "web") return "Public web source";
  return "Uses your API key";
}
