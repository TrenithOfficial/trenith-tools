# Trenith Tools search and domain setup

Use two Vercel projects from the same `TrenithOfficial/trenith-tools` repository. This gives each regional hostname a correct self-canonical, language setting and sitemap while keeping one codebase.

## 1. Global deployment

1. Create or open the global Vercel project.
2. Set `NEXT_PUBLIC_SITE_URL=https://tools.trenith.com`.
3. Set `NEXT_PUBLIC_SITE_REGION=GLOBAL`.
4. Add `tools.trenith.com` in Project Settings → Domains.
5. At the DNS provider, create the exact CNAME Vercel displays for `tools`. Do not guess an IP when Vercel requests a CNAME.
6. Deploy and confirm `https://tools.trenith.com/robots.txt` and `/sitemap.xml` return 200.

## 2. India deployment

1. Import the same GitHub repository as a second Vercel project.
2. Set `NEXT_PUBLIC_SITE_URL=https://tools.trenith.in`.
3. Set `NEXT_PUBLIC_SITE_REGION=IN`.
4. Add `tools.trenith.in` and create the exact DNS record Vercel displays.
5. Deploy and confirm the canonical on the India homepage points to `https://tools.trenith.in/` and hreflang includes both domains.

Attaching both hostnames to one build is not recommended because a static build cannot emit a different self-canonical for each host.

## 3. Google Search Console

1. Sign in to Google Search Console with the Trenith business account.
2. Add Domain properties for `trenith.com` and `trenith.in`. A Domain property covers the root and all protocols/subdomains.
3. Copy each Google TXT verification value into the corresponding domain's DNS zone.
4. Wait for DNS propagation and click Verify.
5. In the `trenith.com` property, submit `https://tools.trenith.com/sitemap.xml`.
6. In the `trenith.in` property, submit `https://tools.trenith.in/sitemap.xml`.
7. Use URL Inspection on the homepage, `/tools`, `/tools/metadata-remover`, `/tools/audio-joiner` and `/guides`; request indexing after the live test passes.
8. Follow the earned-discovery and answer-engine publishing checklist in [`OFFSITE-DISCOVERY.md`](./OFFSITE-DISCOVERY.md). Do not buy links, automate directory submissions or publish fake reviews.
8. Check Pages, Sitemaps, HTTPS and Core Web Vitals weekly after launch.
9. Optional: copy the HTML verification tokens into `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` in the matching Vercel project and redeploy. DNS verification remains the durable method.

## 4. Bing Webmaster Tools

1. Sign in to Bing Webmaster Tools.
2. Import both verified Search Console properties, or add each site manually.
3. If manual, place Bing's XML/TXT verification token in DNS or copy the meta token into `NEXT_PUBLIC_BING_SITE_VERIFICATION` for the matching project.
4. Submit each domain's `/sitemap.xml`.
5. Use URL Submission for the same priority URLs.
6. Enable IndexNow and create a key in Bing Webmaster Tools.

## 5. IndexNow

Set these variables locally or in a protected CI job:

```text
INDEXNOW_KEY=the-key-from-bing
INDEXNOW_KEY_LOCATION=https://tools.trenith.com/the-key.txt
INDEXNOW_HOST=tools.trenith.com
```

Host the exact key in a root text file, then submit changed URLs with the IndexNow API. Repeat with the India hostname and its own site URL after regional deployment. Never expose an administrative submission secret in browser code.

## 6. Analytics and campaign measurement

1. Create separate GA4 web streams for the global and India hostnames, or use one property with hostname reporting.
2. Put the matching ID in `NEXT_PUBLIC_GA_MEASUREMENT_ID` for each Vercel project.
3. If Trenith uses Google Ads, put the ID in `NEXT_PUBLIC_GOOGLE_ADS_ID`.
4. Confirm no Google or Vercel analytics request fires before Analytics consent.
5. Confirm Global Privacy Control disables Marketing measurement.
6. Use UTM-tagged links to Trenith.com and measure qualified contact conversions, not file contents or BYOK activity.

## 7. Launch quality checks

- Both domains return one preferred HTTPS version.
- Canonical is self-referencing on each deployment.
- Reciprocal `en`, `en-IN` and `x-default` hreflang values are present.
- Robots and sitemap URLs use the current hostname.
- Structured data has no errors or fabricated ratings.
- Legal and consent pages are reachable from every page.
- Search performance is monitored by country, query, page and device.

Search visibility and rankings cannot be guaranteed. The technical setup helps crawlers understand and index useful pages; authority, links, user satisfaction, competition and time still determine results.
