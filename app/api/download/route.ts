import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const AUDIO_PATTERN = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|mpeg|weba)(?:[?#].*)?$/i;

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::" || host === "::1" || host === "0.0.0.0" || host.startsWith("::ffff:") || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host) || /^127\.|^10\.|^192\.168\.|^169\.254\.|^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || (() => { const match = host.match(/^172\.(\d+)\./); return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31); })();
}

export async function GET(request: NextRequest) {
  try {
    const input = request.nextUrl.searchParams.get("url");
    if (!input) throw new Error("Missing audio URL.");
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isPrivateHost(url.hostname) || (url.port && !["80", "443"].includes(url.port)) || !AUDIO_PATTERN.test(url.pathname + url.search)) throw new Error("Unsupported audio URL.");

    const response = await fetch(url.href, { redirect: "follow", headers: { "User-Agent": "TrenithToolsAudioDownloader/1.0 (+https://trenith.com)" } });
    if (!response.ok || !response.body) throw new Error("The audio source is unavailable.");
    const finalUrl = new URL(response.url || url.href);
    if (isPrivateHost(finalUrl.hostname)) throw new Error("The audio source redirected to a private address.");
    const filename = decodeURIComponent(finalUrl.pathname.split("/").pop() || "audio.mp3").replace(/[\\/:*?\"<>|]/g, "-");

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename.slice(0, 180)}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Download failed." }, { status: 400 });
  }
}
