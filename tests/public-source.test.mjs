import assert from "node:assert/strict";
import test from "node:test";
import * as scanner from "../lib/public-source.ts";

const base = new URL("https://example.org/show/");

test("streaming platforms are named instead of scanned", () => {
  assert.equal(scanner.platformOf("www.youtube.com"), "YouTube");
  assert.equal(scanner.platformOf("youtu.be"), "YouTube");
  assert.equal(scanner.platformOf("open.spotify.com"), "Spotify");
  assert.equal(scanner.platformOf("music.apple.com"), "Apple Music / Apple Podcasts");
  assert.equal(scanner.platformOf("www.jiosaavn.com"), "a music streaming service");
  assert.equal(scanner.platformOf("example.org"), null);
  assert.equal(scanner.platformOf("notyoutube.company"), null);
});

test("podcast RSS enclosures become downloadable episodes with their titles", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Night Signals</title>
    <item><title><![CDATA[Episode 12: Quiet rooms]]></title><enclosure url="https://cdn.example.org/ep12.mp3?x=1" length="1" type="audio/mpeg"/></item>
    <item><title>Episode 11</title><media:content url="https://cdn.example.org/play/11" type="audio/mp4"/></item>
    <item><title>Video only</title><enclosure url="https://cdn.example.org/v.mp4" type="video/mp4"/></item>
    <item><title>Private</title><enclosure url="http://10.0.0.5/secret.mp3" type="audio/mpeg"/></item>
  </channel></rss>`;
  const feed = scanner.parseFeed(xml, base);
  assert.equal(feed.title, "Night Signals");
  assert.deepEqual(feed.files.map((file) => file.url.href), ["https://cdn.example.org/ep12.mp3?x=1", "https://cdn.example.org/play/11"]);
  assert.equal(feed.files[0].title, "Episode 12: Quiet rooms");
  assert.equal(scanner.formatOf(feed.files[1].url, feed.files[1].mime), "M4A");
  assert.equal(scanner.parseFeed("<html><body>no feed</body></html>", base), null);
});

test("HTML5 players, og:audio and enclosure links count even without a file extension", () => {
  const html = `<html><head><meta property="og:audio" content="/media/intro"><link rel="enclosure" href="https://cdn.example.org/track.flac"></head>
    <body><audio src="/stream?id=9" controls></audio><audio controls><source src="/alt.webm" type="audio/webm"><source src="/clip.mp4" type="video/mp4"></audio>
    <a href="/plain">not audio</a><a href="/song.mp3">song</a></body></html>`;
  const results = new Map();
  scanner.addDeclaredAudio(results, html, base);
  assert.deepEqual([...results.keys()].sort(), ["https://cdn.example.org/track.flac", "https://example.org/alt.webm", "https://example.org/media/intro", "https://example.org/stream?id=9"]);
  assert.equal(results.get("https://example.org/alt.webm").mime, "audio/webm");
});
