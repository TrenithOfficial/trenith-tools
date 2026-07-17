import type { Metadata } from "next";
import { LegalPage } from "../../components/legal-page";
import { alternateUrls } from "../../lib/site";

export const metadata: Metadata = { title: "Open-source Software Notices", description: "Open-source components and source links used by Trenith Tools.", alternates: alternateUrls("/open-source") };

export default function OpenSourcePage() {
  return <LegalPage eyebrow="OPEN-SOURCE NOTICES" title="Built responsibly on open software." summary="Updated 17 July 2026 · Trenith owns its original product code and respects the licenses of the independent components it distributes.">
    <p className="legal-lead">Open-source components remain governed by their own licenses. Nothing on this page removes the rights their authors grant to you.</p>
    <h2>FFmpeg WebAssembly</h2><p>Audio conversion and compatibility decoding use <a href="https://github.com/ffmpegwasm/ffmpeg.wasm" target="_blank" rel="noreferrer">ffmpeg.wasm</a>. The JavaScript wrapper is MIT licensed. The distributed <code>@ffmpeg/core</code> 0.12.10 binary is GPL-2.0-or-later; its corresponding source and build system are available from the <a href="https://github.com/ffmpegwasm/ffmpeg.wasm/tree/core-v0.12.10" target="_blank" rel="noreferrer">upstream core release source</a>. FFmpeg is a trademark of its respective project and is not affiliated with Trenith.</p>
    <h2>ExifTool WebAssembly</h2><p>Metadata inspection and supported cleaning use the <code>@uswriting/exiftool</code> browser package and its embedded Perl/WebAssembly runtime. Its license notices are preserved in the distributed dependency package and repository.</p>
    <h2>Other major components</h2><p>Next.js, React, pdf-lib and JSZip are used under their respective open-source licenses. Complete machine-readable dependency versions and license fields are available in the public source repository lockfile.</p>
    <h2>Source and questions</h2><p>Review the <a href="https://github.com/TrenithOfficial/trenith-tools" target="_blank" rel="noreferrer">Trenith Tools source repository</a>. Send licensing questions to legal@trenith.in.</p>
  </LegalPage>;
}
