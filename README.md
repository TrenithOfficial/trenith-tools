# Trenith Tools

A free, light-first platform for file privacy, media, PDFs, images, music utilities, BYOK AI and synchronized Watch Together rooms.

## Working tools

- Public audio discovery and authorized direct downloads
- Metadata inspection, removal, verification and ZIP export with per-format cleaning engines: ExifTool for images and camera formats, a document rewriter for PDFs, direct property scrubbing for Word/Excel/PowerPoint, and lossless FFmpeg stream copies for MP3, FLAC, Ogg, Opus, WAV, AIFF and WebM audio
- Audio folder/file joining with native decoding, FFmpeg compatibility fallback and direct-to-disk WAV/RF64 streaming for large jobs
- True MP3, WAV, FLAC, Ogg Vorbis, Opus and M4A/AAC conversion with preview and explicit download
- Audio trimming and 0–400% volume adjustment with lossless WAV output
- Public audio discovery with individual or batch ZIP downloads
- Video folder/file joining with browser-native WebM export
- PDF merge, split-to-ZIP, page extraction, rotation, page numbers, watermarking and structural optimization
- JPG/PNG to PDF
- Image resize, compression and JPG/PNG/WebP conversion
- Searchable privacy, audio, video, PDF, image, music, SEO, Developer and AI directory with 48 dedicated tool pages
- Free on-device SEO tools: SERP snippet preview with length checks and a keyword density, readability and question analyzer
- AI Studio runs every workflow with any connected key — text models produce structured plans for media jobs, browser voices speak text with no key at all, and vision-capable keys read text from scans
- Free BYOK Connections Vault and AI Studio for OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter and compatible endpoints
- Compatible endpoint media jobs support JSON briefs and multipart source-file uploads
- Consent-gated Vercel/Google analytics and marketing measurement with Global Privacy Control support
- Global and India canonicals/hreflang, structured data, localized sitemaps, robots, web manifest, guides, capability status, changelog/RSS, a public tool catalog API, `llms.txt` and `llms-full.txt`
- Global privacy, terms, cookie, privacy choices, security, subprocessors, copyright and accessibility disclosures
- Watch Together rooms for authorized OTT websites with encrypted playback signals, chat, reactions and temporary membership
- Optional peer-to-peer camera and microphone for up to 6 people, and playback synchronization for up to 25
- Cross-browser Manifest V3 companion for Chrome, Edge and Firefox with optional per-site access, no screen capture and no remote code

Core file tools process source files in the browser. There is no arbitrary application-level file-count limit; usable capacity depends on the device, browser memory and browser codec support.

Advanced music generation, stem separation, OCR, Office conversion and similar cloud operations require a compatible provider endpoint that supports the named workflow. Users connect their own account in the session-first BYOK vault. Official providers use fixed allowlisted routes; custom HTTPS endpoints run directly from the browser and must support CORS.

## Development

Requirements: Node.js 24.13 or newer.

```bash
npm ci
npm run dev
```

Production validation:

```bash
npm test
npm run lint
npm run build:vercel
npm run zip:extension
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
| `FEEDBACK_WEBHOOK_URL` | HTTPS webhook that receives feedback-widget submissions as JSON (first delivery choice) |
| `RESEND_API_KEY` | Resend key used to email feedback submissions when no webhook is set |
| `FEEDBACK_EMAIL_TO` | Feedback recipient address (defaults to info@trenith.com) |
| `FEEDBACK_EMAIL_FROM` | Verified Resend sender for feedback email delivery |
| `WATCH_SIGNAL_ORIGIN` | Required for Watch Together — the Cloudflare signaling origin the Vercel proxy forwards to. There is no fallback host: the proxy returns 503 until this is set. |
| `TURN_KEY_ID` | Optional Cloudflare Realtime TURN key identifier for restrictive networks |
| `TURN_KEY_API_TOKEN` | Optional scoped token used server-side to mint short-lived TURN credentials |

## Watch Together signaling backend

Watch Together needs one small backend that owns the room database. The site on
Vercel proxies `/api/watch/*` to it via `WATCH_SIGNAL_ORIGIN`; there is no
fallback host, so the feature returns 503 until this is deployed and configured.

Deploy it as a standalone Cloudflare Worker (config: `wrangler.watch.toml`):

```bash
wrangler login                 # one-time, opens your browser
npm run watch:d1:create        # prints a database_id
# paste that id into wrangler.watch.toml -> [[d1_databases]] database_id
npm run watch:deploy           # prints the https://<name>.<subdomain>.workers.dev URL
```

The room schema is self-provisioning — the worker creates its tables and indexes
on the first request, so no migration step is required for a new database. The
SQL in `drizzle/` remains the reference definition.

Then set `WATCH_SIGNAL_ORIGIN` to the deployed worker URL in the Vercel project
and redeploy. Verify with `curl "$WATCH_SIGNAL_ORIGIN/api/watch/health"`, which
returns `{"status":"ok",...}`. Optional: `wrangler secret put TURN_KEY_ID` and
`TURN_KEY_API_TOKEN` (via `-c wrangler.watch.toml`) to enable TURN relay, and
`npm run watch:tail` to stream worker logs.

Without a feedback delivery variable the widget still works: it offers the visitor a prefilled direct email instead of silently dropping the report.

See [`docs/SEARCH-SETUP.md`](docs/SEARCH-SETUP.md) for the domain, Search Console, Bing, IndexNow and analytics launch sequence. See [`docs/OFFSITE-DISCOVERY.md`](docs/OFFSITE-DISCOVERY.md) for the compliant off-site SEO/AEO/GEO/AIO distribution plan.

See [`docs/WATCH-TOGETHER-ARCHITECTURE.md`](docs/WATCH-TOGETHER-ARCHITECTURE.md) for the complete room protocol, data model, user flows, provider-adapter strategy, WebRTC design, observability, CI/CD and phased rollout.

Public discovery surfaces: [`/status`](https://tools.trenith.com/status), [`/changelog`](https://tools.trenith.com/changelog), [`/feed.xml`](https://tools.trenith.com/feed.xml), and [`/api/tools`](https://tools.trenith.com/api/tools).

## Responsible media use

Only process or download media you own, have permission to use, or are otherwise authorized to access. The public-link scanner does not bypass authentication, DRM or platform access controls.

Watch Together never retransmits an OTT title. Every participant uses their own lawful provider account. Playback adapters operate only after a participant grants the extension access to the selected streaming origin.

## Ownership

Built by **Trenith Technologies Private Limited** (CIN U62099TS2026PTC216554).

Visit [trenith.com](https://trenith.com).
