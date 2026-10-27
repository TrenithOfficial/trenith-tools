export type Guide = {
  slug: string;
  title: string;
  description: string;
  answer: string;
  tool?: string;
  /** Overrides the tool link when the workspace is not under /tools. */
  href?: string;
  /** ISO date; guides without one date from the first guide release. */
  published?: string;
  steps: string[];
  sections: Array<{ heading: string; body: string }>;
};

export const guides: Guide[] = [
  {
    slug: "convert-audio-formats-in-browser",
    title: "How to convert audio between MP3, WAV, FLAC, ALAC, Ogg, Opus, M4A and more",
    description: "Choose the right audio format and convert one file or a whole folder locally in your browser without uploading the source.",
    answer: "Choose an output format based on compatibility and quality, add one file or a folder, select a bitrate for lossy formats (and sample rate, channels or bit depth when they matter), then convert and preview the result. Trenith Tools produces MP3, M4A/AAC, WAV, FLAC, ALAC, AIFF, Ogg Vorbis, Opus, WebM, WavPack, AC3 and WMA through a local FFmpeg WebAssembly engine, carrying tags and cover art into the new file. Folders download as one ZIP.",
    tool: "audio-converter",
    steps: ["Choose the source audio (or a folder) and an output format.", "Set a bitrate when converting to a lossy format; keep tags on unless you are sharing the file.", "Convert locally, preview the result and download the file or ZIP."],
    sections: [
      { heading: "Lossless or lossy", body: "WAV and FLAC preserve the decoded audio without another lossy encoding step. MP3, AAC, Ogg Vorbis and Opus trade some information for much smaller files. Converting one lossy format to another cannot restore quality that was already removed." },
      { heading: "Which format should you choose", body: "MP3 has the broadest legacy compatibility. M4A/AAC is common on phones and video platforms. Opus is efficient for speech and modern web use. Ogg Vorbis is open and widely supported. FLAC is useful for lossless archives, while WAV is simple and editor-friendly but large." },
      { heading: "What happens on first use", body: "The browser downloads the conversion engine on the first conversion and then processes the source on the device. Browser memory, codec support and available storage still set practical limits, so keep the original until the converted file has been checked." },
    ],
  },
  {
    slug: "remove-metadata-from-any-file",
    title: "How to remove metadata before sharing a file",
    description: "Inspect and remove EXIF, GPS, author, device and document metadata locally before a file is shared.",
    answer: "Choose files or a folder, inspect the detected fields, clean supported metadata locally, then verify and download the cleaned copies. Keep the originals until you confirm the receiving application opens each result correctly.",
    tool: "metadata-remover",
    steps: ["Add files or a complete folder.", "Review the metadata inventory for each file.", "Clean, verify and download new copies."],
    sections: [
      { heading: "What metadata can reveal", body: "Photos can expose GPS coordinates, capture time, camera serials and editing software. Office documents can reveal authors, organizations, revision history and template paths. Audio and video containers can include performers, comments, copyright text, location and encoder information." },
      { heading: "Why local cleaning matters", body: "A local cleaner avoids uploading the source just to remove metadata. It also reduces unnecessary copies. The browser still needs enough memory for each individual file, and the cleaned file should be tested before you discard the original." },
      { heading: "What an automated remover cannot promise", body: "Visible watermarks, information drawn into pixels, application-specific databases, steganography and meaning inferred from the content are not ordinary metadata. High-risk investigations need specialist review and the original creation software." },
    ],
  },
  {
    slug: "merge-hundreds-of-audio-files",
    title: "How to merge hundreds of audio files without crashing a browser",
    description: "Prepare, validate and stream a large ordered folder into one WAV or RF64 file.",
    answer: "Use a desktop Chrome or Edge browser, sort the folder before selection, enable skipping only if missing tracks are acceptable, and save large output directly to a local destination. Direct-to-disk streaming avoids keeping the entire result in browser memory.",
    tool: "audio-joiner",
    steps: ["Put tracks in one folder with sortable names.", "Choose the complete folder and review the order.", "Choose a destination and let the preflight identify unreadable tracks."],
    sections: [
      { heading: "Why the old approach fails", body: "Decoding hundreds of compressed tracks and building one giant in-memory buffer can use several times the source size. A single corrupt or browser-unsupported MP3 can also abort the whole batch unless files are validated independently." },
      { heading: "WAV versus RF64", body: "Classic WAV uses 32-bit size fields and is normally limited near 4 GB. RF64 uses 64-bit size information while preserving a WAV-style structure. Very long output may require an editor that explicitly supports RF64." },
      { heading: "Compatibility checklist", body: "Keep free disk space above the estimated uncompressed output, prevent the computer from sleeping, use consistent sample rates where possible and listen at file boundaries afterward. Browser decoders vary, so replace a named unreadable track with a standard PCM WAV when necessary." },
    ],
  },
  {
    slug: "browser-vs-cloud-file-processing",
    title: "Browser processing versus cloud file tools",
    description: "Understand privacy, performance and compatibility tradeoffs between local browser tools and server uploads.",
    answer: "Browser processing is usually better when privacy and immediate control matter; cloud processing can be better for heavy codecs, weak devices and resumable jobs. The safest choice depends on file sensitivity, device capacity and the provider’s retention terms.",
    steps: ["Classify the sensitivity of the file.", "Compare device capacity with the expected output size.", "Choose a tool whose processing location is disclosed before selection."],
    sections: [
      { heading: "Benefits of device processing", body: "The source need not cross the network, there is no upload wait and closing the tab clears the active queue. It is well suited to common images, PDFs and audio that the browser can decode." },
      { heading: "When cloud processing helps", body: "A server can provide specialist codecs, durable job queues and more memory. That benefit comes with an additional copy, account access, retention decisions and a larger processor chain." },
      { heading: "Read the labels", body: "Trenith uses Device, Public Source and BYOK labels. Public Source sends a URL to the scanner. BYOK sends the chosen prompt and credentials to the connected provider. Those paths are different from purely local processing." },
    ],
  },
  {
    slug: "byok-ai-explained",
    title: "BYOK AI explained: cost, privacy and setup",
    description: "Use your own AI provider key in a shared interface while keeping billing and provider choice under your control.",
    answer: "BYOK means Bring Your Own Key. Create a restricted key in your provider account, add it to a session-only connection, select a compatible workflow, review the request and run it. The provider bills your account directly.",
    tool: "ai-chat",
    steps: ["Create a restricted provider API key and set a spending limit.", "Add a session connection in the Trenith vault.", "Choose a workflow and review provider output before use."],
    sections: [
      { heading: "What Trenith provides", body: "Trenith provides reusable workflows, a connection vault and fixed routing for supported provider APIs. It does not include generation credits or silently substitute a different model." },
      { heading: "Key safety", body: "Prefer project-scoped keys, minimal permissions, low spending limits and routine rotation. Do not paste a personal password. Session storage is the default; the optional device vault encrypts connection data with a passphrase that Trenith cannot recover." },
      { heading: "Provider privacy still applies", body: "A BYOK request must reach the provider you select. That provider’s retention, training, location and content rules apply to the request. Avoid sensitive personal or regulated data unless your provider contract permits it." },
    ],
  },
  {
    slug: "protect-photo-gps-before-sharing",
    title: "Protect photo GPS data before posting or sending",
    description: "Find and remove geolocation and device details from photos without uploading the originals.",
    answer: "Inspect the image for GPS latitude, longitude, altitude, capture time, camera serial and software fields; remove supported metadata; verify the cleaned copy; then share that copy instead of the original.",
    tool: "metadata-remover",
    steps: ["Select the original photo and inspect detected GPS fields.", "Clean the file locally and verify the result.", "Open the cleaned copy, confirm image quality and share only that copy."],
    sections: [
      { heading: "Common location fields", body: "EXIF can store latitude, longitude, altitude, direction and timestamps. A camera serial or unique image identifier may also help correlate photos even after obvious GPS values are removed." },
      { heading: "Content can reveal location too", body: "Removing metadata does not hide street signs, reflections, recognizable buildings, screen content or other visible clues. Crop or edit those details separately when personal safety matters." },
      { heading: "Platforms may make another copy", body: "Social networks and messaging apps often re-encode images, but policies vary. Clean before upload rather than relying on a platform to remove every field." },
    ],
  },
  {
    slug: "prepare-pdf-for-client-delivery",
    title: "Prepare a PDF for safe client delivery",
    description: "Organize, watermark, reduce and inspect a PDF before sending it to a customer or stakeholder.",
    answer: "Work from a copy, arrange and remove unnecessary pages, apply a clear watermark if appropriate, inspect document properties and hidden information, then open the final PDF on a second device before delivery.",
    tool: "organize-pdf",
    steps: ["Duplicate the original and choose only required pages.", "Apply the needed page numbers or watermark.", "Inspect metadata, accessibility and links before sending."],
    sections: [
      { heading: "Minimize before sharing", body: "Remove blank, internal, duplicate and unrelated pages. Data minimization reduces accidental disclosure and makes the document easier for the recipient to navigate." },
      { heading: "Metadata and redaction differ", body: "Removing document properties does not redact visible words or underlying PDF objects. Drawing a black rectangle over text is not safe redaction. Use a dedicated redaction workflow for confidential content." },
      { heading: "Final quality check", body: "Confirm fonts, form fields, hyperlinks, page labels, bookmarks, reading order and signatures. Compression can affect images and scanned text, so compare critical pages with the original." },
    ],
  },
  {
    slug: "convert-video-without-losing-quality",
    title: "How to convert video between MP4, MKV, WebM and MOV without losing quality",
    description: "Understand when a video conversion is a free lossless remux and when it has to re-encode, and choose settings that keep quality.",
    answer: "A container change (MP4 to MKV, MOV to MP4) is lossless and takes seconds when the audio and video codecs already fit the new container: the streams are copied bit for bit. Only a codec change (anything to WebM, or a resolution, frame-rate or size change) needs re-encoding, and quality is then set by the quality slider rather than the output size. Trenith Tools plans each job and tells you which case applies before it runs.",
    tool: "video-converter",
    published: "2026-10-27",
    steps: ["Add the video and choose the target container; the plan line says whether it will remux or encode.", "For an encode, pick a quality level first and only set resolution, frame rate or rotation when you need them.", "Convert locally, check the result in the preview and download it."],
    sections: [
      { heading: "Remux versus encode", body: "MP4, MOV and MKV all hold H.264 and AAC, so moving between them is a container rewrite with no generation loss. WebM only holds VP8/VP9 and Opus/Vorbis, so converting a phone recording to WebM always re-encodes. MKV accepts almost anything, which makes it the safest lossless target." },
      { heading: "Quality settings that matter", body: "Constant-quality encoding (the quality slider) keeps detail consistent across easy and hard scenes; a target size instead fixes the bitrate and lets quality vary. Never upscale: the converter only reduces resolution. Keep the original frame rate unless the file is going to a platform that re-encodes anyway." },
      { heading: "Time and limits in a browser", body: "Encoding runs on a single-threaded WebAssembly engine, so an H.264 encode is slower than real time for long 1080p clips, while a remux or audio extraction finishes in seconds. For long sources, trim first or lower the resolution, and keep the tab in the foreground." },
    ],
  },
  {
    slug: "compress-pdf-without-ruining-text",
    title: "How to compress a PDF without ruining the text",
    description: "Shrink a PDF by recompressing its embedded images while leaving fonts, vectors, links and the text layer untouched.",
    answer: "Most oversized PDFs are large because of embedded photos and scans, not text. Recompress those images at a lower quality and a sensible maximum resolution and the file shrinks while every word, link and vector drawing stays exactly as it was. Trenith Tools does this on the device and reports how many images it touched and the before-and-after size.",
    tool: "compress-pdf",
    published: "2026-10-27",
    steps: ["Add the PDF and pick a quality level (medium is usually invisible on screen).", "Lower the maximum image resolution for documents that will only be read on screen.", "Compress locally, compare a photo-heavy page with the original and download the smaller file."],
    sections: [
      { heading: "What actually gets smaller", body: "The compressor decodes each embedded image, re-encodes it as JPEG at the chosen quality (downscaling very large images), and swaps it into the same page. Text, fonts, form fields, bookmarks and vector graphics are not rasterized or altered. A PDF that is already mostly text will not shrink much, and the tool says so." },
      { heading: "Choosing quality and resolution", body: "Screens rarely need more than 150 dpi, so a 1600-pixel cap keeps most pages sharp. For documents that will be printed, keep a higher resolution and a higher quality. Images with transparency masks are left alone so nothing is flattened incorrectly." },
      { heading: "Orphans and verification", body: "Compression also sweeps objects that an earlier editor left behind, which removes stale copies of pages and images. Open the result in a second viewer and check a few photo pages and the page count before discarding the original." },
    ],
  },
  {
    slug: "keep-a-watch-party-in-sync",
    title: "How to keep a watch party in sync when everyone's connection is different",
    description: "Why synchronized playback drifts, what Trenith Watch Together does about it, and what the host can do when a guest falls behind.",
    answer: "Drift comes from three places: clocks that disagree, commands that arrive late, and players that buffer or pause on their own. Trenith Watch Together aligns every room clock with the signaling server, projects each command to the position the host has reached by the time it arrives, re-broadcasts the host position every five seconds while playing, and shows each guest's drift in the roster so the host can resync everyone with one click.",
    href: "/watch-together",
    published: "2026-10-27",
    steps: ["Create the room, connect your provider tab and invite guests with the private link.", "Watch the roster: 'in sync' means within three-quarters of a second of the host; 'behind' or 'ahead' means a guest has drifted.", "Click Resync to pull everyone to the host position, or hand over hosting to the person with the steadiest connection."],
    sections: [
      { heading: "Why rooms used to drift", body: "If a seek is applied using the timestamp it carried, every guest lands behind the host by the network delay, and that gap never closes. Buffering stalls add more. Protocol 2 corrects both: positions are projected for their age before they are applied, and the host heartbeat catches stalled guests." },
      { heading: "Host handover and locks", body: "If the host's tab closes or goes silent for about 45 seconds, the room promotes the longest-present guest automatically so playback control never disappears. The host can also transfer control deliberately, remove a disruptive participant, or lock the room once everyone has arrived." },
      { heading: "Provider differences", body: "Netflix ignores seeks sent to its HTML5 element, so the companion drives its page player API instead. Advertisement breaks on ad-supported plans pause synchronization rather than seeking through them. Each person still needs their own authorized provider account; nothing is streamed by Trenith." },
    ],
  },
];

export const guideBySlug = Object.fromEntries(guides.map((guide) => [guide.slug, guide])) as Record<string, Guide>;
