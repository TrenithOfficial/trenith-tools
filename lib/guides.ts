export type Guide = {
  slug: string;
  title: string;
  description: string;
  answer: string;
  tool?: string;
  steps: string[];
  sections: Array<{ heading: string; body: string }>;
};

export const guides: Guide[] = [
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
];

export const guideBySlug = Object.fromEntries(guides.map((guide) => [guide.slug, guide])) as Record<string, Guide>;
