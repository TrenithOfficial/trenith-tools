# Trenith Tools

A free, light-first platform for file privacy, media, PDFs, images, music utilities, BYOK AI and synchronized Watch Together rooms.

## Working tools

- Public audio discovery and authorized direct downloads: direct files, HTML5 players, podcast RSS/Atom feeds (episodes listed by title) and open directories; streaming platforms are named and explained instead of failing silently
- Metadata inspection, removal, verification and ZIP export with a per-format engine for every file family: ExifTool for images and RAW (colour profile and orientation preserved), a lossless FFmpeg stream copy for every audio/video container (track languages restored), a PDF rewriter that anonymizes annotation authors and physically removes orphaned objects from earlier saves, Office package scrubbing (core/app/custom properties, people lists, thumbnails, revision ids, comment and tracked-change authors, template and mail-merge links, Excel absolute save paths, threaded-comment identities), OpenDocument, EPUB, SVG, HTML and RTF rewriters, and recursive ZIP cleaning that also reaches the media embedded inside documents. Every result is re-verified and reported by risk category.
- Audio folder/file joining with native decoding, FFmpeg compatibility fallback and direct-to-disk WAV/RF64 streaming for large jobs
- Audio conversion to MP3, M4A/AAC, WAV, FLAC, ALAC, AIFF, Ogg Vorbis, Opus, WebM, WavPack, AC3 and WMA — single files or whole folders with one-ZIP download, sample-rate/channel/bit-depth options, tags and cover art carried over
- Audio trimming without re-encoding (or to any format) and 0–400% volume adjustment with any output format
- Video conversion to MP4, WebM, MKV and MOV with lossless remuxing whenever the source codecs already fit the container, otherwise H.264 or VP8 encoding with quality, resolution, frame-rate and rotation control; video compression by quality or target size; keyframe-exact lossless or frame-accurate trimming; audio extraction with bit-for-bit copies; palette-optimized GIFs
- Video folder/file joining: lossless concatenation when clips match, browser re-recording otherwise
- PDF merge, split-to-ZIP, page extraction, rotation, page numbers, watermarking, real image recompression (text layer untouched) with an orphan sweep, PDF-to-JPG/PNG/WebP rendering and text extraction through pdf.js
- Images to PDF from JPG, PNG, WebP, HEIC, AVIF, TIFF, GIF, BMP and SVG
- Image crop/resize/convert editor plus batch mode: opens HEIC, TIFF, SVG, AVIF; exports JPG, PNG, WebP, AVIF, GIF, BMP, ICO and TIFF
- Searchable privacy, audio, video, PDF, image, music, SEO, Developer and AI directory with 56 dedicated tool pages
- Free on-device SEO tools: SERP snippet preview with length checks and a keyword density, readability and question analyzer
- AI Studio runs every workflow with any connected key — text models produce structured plans for media jobs, browser voices speak text with no key at all, and vision-capable keys read text from scans
- Free BYOK Connections Vault and AI Studio for OpenAI, Anthropic, Gemini, ElevenLabs, OpenRouter and compatible endpoints
- Compatible endpoint media jobs support JSON briefs and multipart source-file uploads
- Consent-gated Vercel/Google analytics and marketing measurement with Global Privacy Control support
- Global and India canonicals/hreflang, structured data, localized sitemaps, robots, web manifest, guides, capability status, changelog/RSS, a public tool catalog API, `llms.txt`, `llms-full.txt` and 1200×630 social preview images per tool (`public/og/`, regenerated with `python3 scripts/og-images.py`)
- Global privacy, terms, cookie, privacy choices, security, subprocessors, copyright and accessibility disclosures
- Watch Together rooms for authorized OTT websites with encrypted playback signals, chat, reactions and temporary membership
- Protocol 2 sync: server clock alignment, latency-projected seeks, a host heartbeat while playing, per-participant drift display with one-click resync, host handover (manual, and automatic when the host disappears), lock and remove
- Optional peer-to-peer camera and microphone for up to 6 people, and playback synchronization for up to 25
- Cross-browser Manifest V3 companion 1.1.0 for Chrome, Edge and Firefox with optional per-site access, a Netflix page-API adapter, no screen capture and no remote code — published for Chrome/Edge on the [Chrome Web Store](https://chromewebstore.google.com/detail/trenith-watch-together/kfeooodicmideabhlmimaijjfkjhfojg); the Firefox build is not yet signed

Core file tools process source files in the browser. There is no arbitrary application-level file-count limit; usable capacity depends on the device, browser memory and browser codec support.

Video re-encoding runs on the single-threaded FFmpeg WebAssembly engine, so it is slower than real time for long high-resolution clips; lossless remuxes, audio extraction and metadata strips finish in seconds. `libvpx-vp9` traps in this build, so WebM output uses VP8.

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

End-to-end proof for Watch Together (not part of `npm test`; needs native `ffmpeg` on PATH and a Playwright Chromium — `npx playwright install chromium` once):

```bash
npm run build:vercel
E2E_SOAK_MINUTES=6 npm run test:e2e:watch
```

It launches two Chromium profiles with the real companion installed, the room pages from `next start`, the signaling worker on a local D1 (`wrangler dev --local`), and a stand-in streaming site with a plain HTML5 player. It checks play/seek/pause/rate following within the 750 ms tolerance, the host heartbeat pulling back a stalled guest, roster drift labels, encrypted chat, WebRTC voice, handover, lock, remove, automatic host promotion, and (with the soak) that hidden room tabs keep polling at full cadence under Chrome's background throttling.

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

Comments are on their own lines below because zsh does not strip trailing `#`
comments in an interactive shell — pasting them after a command sends them to
the command as arguments.

```bash
# One-time: opens your browser to authorise the Cloudflare account.
npx wrangler login

# Creates the database and prints a database_id.
# Paste that id into wrangler.watch.toml under [[d1_databases]].
npm run watch:d1:create

# Deploys and prints the https://<name>.<subdomain>.workers.dev URL.
npm run watch:deploy
```

The room schema is self-provisioning — the worker creates its tables and indexes
on the first request, so no migration step is required for a new database. The
SQL in `drizzle/` remains the reference definition.

Then set `WATCH_SIGNAL_ORIGIN` to the deployed worker URL in the Vercel project
and redeploy. Verify with `curl "$WATCH_SIGNAL_ORIGIN/api/watch/health"`, which
returns `{"status":"ok",...}`. Optional: `wrangler secret put TURN_KEY_ID` and
`TURN_KEY_API_TOKEN` (via `-c wrangler.watch.toml`) to enable TURN relay, and
`npm run watch:tail` to stream worker logs.

### Access model (private beta)

Creating a room requires approved access; **joining an existing room through a
shared invite link does not** — so an approved member can invite anyone. Visitors
request access on `/watch-together` (name, email, reason). Emails on the
auto-approve domain (default `trenith.com`) are granted a key instantly; everyone
else is held for manual review and told credentials arrive within 24 hours if
approved. The key is stored in the browser and sent as `x-watch-access` on room
creation only.

Optional worker configuration (set with `wrangler secret put <NAME> -c wrangler.watch.toml`):

| Secret | Purpose |
| --- | --- |
| `WATCH_AUTO_APPROVE_DOMAIN` | Email domain approved instantly (default `trenith.com`) |
| `WATCH_ADMIN_SECRET` | Enables the manual-approval endpoint below |
| `RESEND_API_KEY` | Optional: email the access key / confirmation to requesters |
| `WATCH_ACCESS_EMAIL_FROM` | Verified Resend sender for access emails |
| `WATCH_ACCESS_EMAIL_TO` | Address notified of each new pending request |

Host controls (bearer token of the current host): `POST /api/watch/rooms/:id/transfer` `{participantId}`, `POST /api/watch/rooms/:id/remove` `{participantId}`, `POST /api/watch/rooms/:id/lock` `{locked}`. The roster poll returns `hostId`, `locked` and `controlMode`; a removed participant's next poll answers `403 {"code":"removed"}` so their page can say so; a host silent for longer than the 45-second presence window is replaced by the longest-present guest automatically. The `locked` and `removed` columns are added to existing databases by self-applied migrations (`drizzle/0002_*.sql` is the reference).

Approve a pending request manually (mints and returns/emails a key):

```bash
curl -X POST "$WATCH_SIGNAL_ORIGIN/api/watch/access/approve" \
  -H "x-watch-admin: $WATCH_ADMIN_SECRET" -H "content-type: application/json" \
  -d '{"email":"person@example.com"}'
```

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
