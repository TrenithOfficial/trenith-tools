// Serves the stand-in streaming page and its media with HTTP Range support, so
// Chromium can seek the way it does on a real provider. Used by the end-to-end
// harness; run directly with `node tests/e2e/ott-server.mjs [port] [mediaDir]`.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".webm": "video/webm", ".mp4": "video/mp4", ".js": "text/javascript" };

export function startOttServer(port, mediaDir) {
  const roots = [path.join(here, "ott"), mediaDir].filter(Boolean);
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://ott.test");
    const name = url.pathname === "/" || url.pathname.startsWith("/watch/") ? "player.html" : path.basename(url.pathname);
    const file = roots.map((root) => path.join(root, name)).find((candidate) => { try { return statSync(candidate).isFile(); } catch { return false; } });
    if (!file) { response.writeHead(404); response.end("not found"); return; }
    const size = statSync(file).size;
    const type = types[path.extname(file)] || "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      response.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1, "accept-ranges": "bytes", "cache-control": "no-store" });
      createReadStream(file, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 3200);
  await startOttServer(port, process.argv[3] || path.join(here, ".cache"));
  console.log(`stand-in streaming site on http://127.0.0.1:${port}/`);
}
