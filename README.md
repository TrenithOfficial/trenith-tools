# Trenith Tools

A professional local-first workspace for media, PDF, image and creator workflows.

## Working tools

- Public audio discovery and authorized direct downloads
- Audio folder/file joining with ordered lossless WAV export
- Video folder/file joining with browser-native WebM export
- PDF merge, split-to-ZIP, page extraction, rotation, page numbers, watermarking and structural optimization
- JPG/PNG to PDF
- Image resize, compression and JPG/PNG/WebP conversion
- Searchable audio, video, PDF, image, music and AI tool directory with a dedicated page for every workflow
- Free BYOK Connections Vault and AI Studio for OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter and compatible endpoints
- Four persistent interface color themes
- Technical SEO surfaces including metadata, structured data, sitemap, robots, web manifest and `llms.txt`

Core file tools process source files in the browser. There is no arbitrary application-level file-count limit; usable capacity depends on the device, browser memory and browser codec support.

Advanced music generation, stem separation, OCR, Office conversion, translation and similar cloud operations require a provider API that supports the requested workflow. Users connect their own account in the session-first BYOK vault. Official providers use fixed allowlisted routes; custom HTTPS endpoints run directly from the browser and must support CORS.

## Development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Production validation:

```bash
npm test
npm run lint
npm run build:vercel
```

Vercel reads `vercel.json` and runs the native Next.js build so the expected `.next` output is generated. Set `NEXT_PUBLIC_SITE_URL` to the final production or custom domain before launch so canonical URLs and structured data use that host.

## Responsible media use

Only process or download media you own, have permission to use, or are otherwise authorized to access. The public-link scanner does not bypass authentication, DRM or platform access controls.

## Ownership

Built by **Trenith Technologies Pvt Ltd**.

Co-authored by **Sai Phanindra Manikanta Yalamanchili**.

Visit [trenith.com](https://trenith.com).
