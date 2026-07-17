# Trenith Tools

A free, light-first, device-focused workspace for file privacy, media, PDFs, images, music utilities and BYOK AI workflows.

## Working tools

- Public audio discovery and authorized direct downloads
- Metadata inspection, removal, verification and ZIP export for ExifTool-compatible file families
- Audio folder/file joining with per-file validation and direct-to-disk WAV/RF64 streaming for large jobs
- Video folder/file joining with browser-native WebM export
- PDF merge, split-to-ZIP, page extraction, rotation, page numbers, watermarking and structural optimization
- JPG/PNG to PDF
- Image resize, compression and JPG/PNG/WebP conversion
- Searchable privacy, audio, video, PDF, image, music and AI directory with 40 dedicated tool pages
- Free BYOK Connections Vault and AI Studio for OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter and compatible endpoints
- Compatible endpoint media jobs support JSON briefs and multipart source-file uploads
- Consent-gated Vercel/Google analytics and marketing measurement with Global Privacy Control support
- Global and India canonicals/hreflang, structured data, localized sitemaps, robots, web manifest, guides, `llms.txt` and `llms-full.txt`
- Global privacy, terms, cookie, privacy choices, security, subprocessors, copyright and accessibility disclosures

Core file tools process source files in the browser. There is no arbitrary application-level file-count limit; usable capacity depends on the device, browser memory and browser codec support.

Advanced music generation, stem separation, OCR, Office conversion and similar cloud operations require a compatible provider endpoint that supports the named workflow. Users connect their own account in the session-first BYOK vault. Official providers use fixed allowlisted routes; custom HTTPS endpoints run directly from the browser and must support CORS.

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

Vercel reads `vercel.json` and runs the native Next.js build so the expected `.next` output is generated.

Use two Vercel projects from this repository:

| Project | Variables |
| --- | --- |
| Global | `NEXT_PUBLIC_SITE_URL=https://tools.trenith.com`, `NEXT_PUBLIC_SITE_REGION=GLOBAL` |
| India | `NEXT_PUBLIC_SITE_URL=https://tools.trenith.in`, `NEXT_PUBLIC_SITE_REGION=IN` |

Optional runtime configuration:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Loads Google Analytics only after Analytics consent |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | Loads Ads conversion measurement only after Marketing consent |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Optional Search Console HTML meta verification |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Optional Bing HTML meta verification |

See [`docs/SEARCH-SETUP.md`](docs/SEARCH-SETUP.md) for the domain, Search Console, Bing, IndexNow and analytics launch sequence.

## Responsible media use

Only process or download media you own, have permission to use, or are otherwise authorized to access. The public-link scanner does not bypass authentication, DRM or platform access controls.

## Ownership

Built by **Trenith Technologies Private Limited** (CIN U62099TS2026PTC216554).

Co-authored by **Sai Phanindra Manikanta Yalamanchili**.

Visit [trenith.com](https://trenith.com).
