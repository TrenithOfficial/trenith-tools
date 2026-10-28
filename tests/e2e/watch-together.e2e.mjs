// End-to-end proof that Watch Together works as a product, not just as units:
// two separate Chromium profiles, each with the real companion extension
// installed, the real room page served by `next start`, the real signaling
// worker on a local D1 database, and a stand-in streaming site with a plain
// HTML5 player that the companion's generic adapter has to find and drive.
//
// What is NOT real: the stand-in site's origin is pre-granted in a separate
// extension build (Chrome's optional-permission prompt cannot be accepted by
// automation), and there is no real OTT provider. Everything else — popup,
// scripting injection, messaging, encryption, polling, clock alignment,
// heartbeat, host controls, WebRTC voice — runs exactly as shipped.
//
// Usage (from the repo root, after `npm ci`):
//   npm run build:vercel            # once, for .next
//   node tests/e2e/watch-together.e2e.mjs
// Options: E2E_SOAK_MINUTES=6 (hidden-tab soak), E2E_HEADED=1 (needs a display),
//          E2E_BASE / E2E_SIGNAL to reuse running servers.
// Requirements: Node 24, wrangler (dev dependency), native ffmpeg on PATH to
// generate the fifteen-minute test video (cached in tests/e2e/.cache).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startOttServer } from "./ott-server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const HEADED = Boolean(process.env.E2E_HEADED);
const SOAK_MINUTES = Number(process.env.E2E_SOAK_MINUTES || 0);
// E2E_LEGACY=1 runs the new site against a protocol-1 signaling service (the
// version deployed before this release): play/pause/seek, chat and voice must
// still work and the room must say that host controls are pending, while the
// protocol-2-only steps are skipped.
const LEGACY = Boolean(process.env.E2E_LEGACY);
const SIGNAL = process.env.E2E_SIGNAL || "http://127.0.0.1:8787";
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3101";
const OTT_PORT = Number(process.env.E2E_OTT_PORT || 3200);
const OTT_URL = `http://ott.test:${OTT_PORT}/watch/test-feature`;
const EXT = path.join(root, ".output-e2e/chrome-mv3");
const TOLERANCE = 0.75; // WATCH_DRIFT_TOLERANCE_MS

const results = [];
const children = [];
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;
function report(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`${stamp()} ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, timeoutMs, label, interval = 200) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`timed out after ${timeoutMs} ms: ${label}`);
}
async function waitForHttp(url, timeoutMs, label) {
  await waitFor(async () => { try { return (await fetch(url)).ok; } catch { return false; } }, timeoutMs, label, 500);
}

// --- Infrastructure ------------------------------------------------------------
function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true, ...options });
  child.stdout.on("data", (chunk) => { if (process.env.E2E_VERBOSE) process.stdout.write(`[${command}] ${chunk}`); });
  child.stderr.on("data", (chunk) => { if (process.env.E2E_VERBOSE) process.stderr.write(`[${command}] ${chunk}`); });
  children.push(child);
  return child;
}

async function startInfrastructure() {
  mkdirSync(path.join(here, ".cache"), { recursive: true });
  const movie = path.join(here, ".cache/movie.webm");
  if (!existsSync(movie)) {
    const generated = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "900", "-c:v", "libvpx", "-b:v", "160k", "-deadline", "realtime", "-cpu-used", "8", "-c:a", "libvorbis", "-b:a", "48k", movie], { stdio: "inherit" });
    if (generated.status !== 0) throw new Error("ffmpeg is needed once to generate tests/e2e/.cache/movie.webm");
  }
  const built = spawnSync("npx", ["wxt", "build"], { cwd: root, env: { ...process.env, WXT_E2E_HOST: "http://ott.test/*", WXT_OUT_DIR: ".output-e2e" }, stdio: process.env.E2E_VERBOSE ? "inherit" : "ignore" });
  if (built.status !== 0) throw new Error("the companion failed to build for the end-to-end run");
  await startOttServer(OTT_PORT, path.join(here, ".cache"));
  const alreadyUp = async (url) => { try { await fetch(url); return true; } catch { return false; } };
  if (!process.env.E2E_SIGNAL) {
    if (await alreadyUp(`${SIGNAL}/api/watch/health`)) throw new Error(`${SIGNAL} is already serving; stop it or pass E2E_SIGNAL to reuse it`);
    const port = new URL(SIGNAL).port || "8787";
    run("npx", ["wrangler", "dev", "-c", "wrangler.watch.toml", "--local", "--port", port, "--ip", "127.0.0.1"]);
    await waitForHttp(`${SIGNAL}/api/watch/health`, 90000, "signaling worker");
  }
  if (!process.env.E2E_BASE) {
    if (await alreadyUp(`${BASE}/`)) throw new Error(`${BASE} is already serving (possibly a stale build); stop it or pass E2E_BASE to reuse it`);
    if (!existsSync(path.join(root, ".next"))) throw new Error("run `npm run build:vercel` first (no .next build found)");
    const port = new URL(BASE).port || "3101";
    run("npx", ["next", "start", "--port", port], { env: { ...process.env, WATCH_SIGNAL_ORIGIN: SIGNAL } });
    await waitForHttp(`${BASE}/watch-together`, 90000, "site");
  }
  const health = await (await fetch(`${BASE}/api/watch/health`)).json();
  report("site proxies to the signaling worker", health.status === "ok" && health.protocolVersion === (LEGACY ? 1 : 2), `protocol ${health.protocolVersion}`);
}

// --- Participants ---------------------------------------------------------------
async function launchParticipant(name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `watch-e2e-${name}-`));
  const context = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    headless: !HEADED,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      "--host-resolver-rules=MAP ott.test 127.0.0.1",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    ],
  });
  await context.addInitScript(() => {
    try { localStorage.setItem("trenith-tools-consent-v1", JSON.stringify({ analytics: false, marketing: false, preferences: false, updatedAt: new Date().toISOString(), gpc: false })); } catch { /* ignore */ }
    try { performance.setResourceTimingBufferSize(20000); } catch { /* ignore */ }
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 20000 });
  const participant = { name, dir, context, sw, extId: new URL(sw.url()).host, errors: [] };
  context.on("page", (page) => {
    live.pages.push(page);
    page.on("pageerror", (error) => participant.errors.push(`${page.url().slice(0, 60)}: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") participant.errors.push(`${page.url().slice(0, 60)}: ${message.text().slice(0, 200)}`); });
  });
  return participant;
}

async function connectStreamingTab(p) {
  // The popup is opened as a background tab while the stand-in player tab is
  // the active one, which is exactly what the popup sees when a person clicks
  // the toolbar icon: it queries the active tab, verifies the origin grant and
  // asks the background to inject the player bridge.
  p.popup = await p.context.newPage();
  await p.popup.goto(`chrome-extension://${p.extId}/popup.html`);
  await p.popup.waitForSelector("button.connect");
  p.ott = await p.context.newPage();
  await p.ott.goto(OTT_URL);
  await p.ott.waitForFunction(() => document.getElementById("player").readyState >= 1, null, { timeout: 30000 });
  await p.ott.bringToFront();
  await p.popup.click("button.connect");
  await p.popup.waitForFunction(() => /CONNECTED PLAYER/.test(document.body.textContent || ""), null, { timeout: 15000 });
  await p.room.waitForSelector(".extension-pill.player", { timeout: 20000 });
  // Keep the stand-in player in front: that is where a viewer actually looks,
  // and it leaves the room page hidden the way it is in real use.
  await p.ott.bringToFront();
}

const player = (p) => p.ott.evaluate(() => { const media = document.getElementById("player"); return { time: media.currentTime, paused: media.paused, rate: media.playbackRate }; });
const drive = (p, script) => p.ott.evaluate(script);
async function sample(a, b) {
  const [sa, sb] = await Promise.all([player(a), player(b)]);
  return { a: sa, b: sb, drift: Math.abs(sa.time - sb.time) };
}
const roster = (p) => p.room.$$eval(".watch-participant-list > div", (nodes) => nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim()));
const chat = (p) => p.room.$$eval(".watch-chat article", (nodes) => nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim()));
const topbar = (p) => p.room.$eval(".watch-room-topbar", (node) => node.innerText.replace(/\s+/g, " ").trim());
const nowPlaying = (p) => p.room.$eval(".watch-now-playing", (node) => node.innerText.replace(/\s+/g, " ").trim());

async function sendChat(p, text) {
  await p.room.fill(".watch-chat-form textarea", text);
  await p.room.press(".watch-chat-form textarea", "Enter");
}

async function pollIntervals(p, windowMs) {
  return p.room.evaluate((windowMs) => {
    const since = performance.now() - windowMs;
    const starts = performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/events?after=") && entry.startTime >= since).map((entry) => entry.startTime).sort((x, y) => x - y);
    const gaps = starts.slice(1).map((value, index) => value - starts[index]);
    gaps.sort((x, y) => x - y);
    return { polls: starts.length, median: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null, max: gaps.length ? gaps[gaps.length - 1] : null };
  }, windowMs);
}

// --- Scenario -------------------------------------------------------------------
async function main() {
  await startInfrastructure();
  const host = await launchParticipant("host");
  const guest = await launchParticipant("guest");

  // 1. Access request through the real form (the configured domain auto-approves).
  host.room = await host.context.newPage();
  await host.room.goto(`${BASE}/watch-together`);
  await host.room.waitForSelector("form.watch-create-card");
  await host.room.fill('input[placeholder="e.g. Sai"]', "Host Harness");
  // A fresh address each run: a re-request for an approved address is answered
  // with "already approved" and no key, by design.
  await host.room.fill('input[type="email"]', `e2e-harness+${Date.now()}@trenith.com`);
  await host.room.click("text=Request free access");
  await host.room.waitForSelector("text=Create a private watch room", { timeout: 20000 });
  report("access request auto-approves a trenith.com address and unlocks room creation", true);

  // 2. Create the room through the UI.
  await host.room.fill('input[placeholder="e.g. Sai"]', "Host Harness");
  await host.room.selectOption("select", "generic");
  await host.room.click("text=Create free room");
  await host.room.waitForURL(/\/watch-together\/room\/[^#]+#key=/, { timeout: 20000 });
  const invite = host.room.url();
  const roomId = invite.match(/room\/([^#]+)/)[1];
  await host.room.waitForSelector(".watch-room-topbar", { timeout: 20000 });
  report("host creates an encrypted room and lands in it", /Room live|connecting/i.test(await topbar(host)), roomId.slice(0, 6));

  // 3. Host connects its streaming tab through the real popup.
  await connectStreamingTab(host);
  report("host's streaming tab connects through the popup and reports the title", /Test Feature/.test(await nowPlaying(host)));

  // 4. Guest joins with the invitation link and connects its own tab.
  guest.room = await guest.context.newPage();
  await guest.room.goto(invite);
  await guest.room.waitForSelector("form.watch-create-card");
  await guest.room.fill('input[placeholder="Your name"]', "Guest Harness");
  await guest.room.click("text=Join watch room");
  await guest.room.waitForSelector(".watch-room-topbar", { timeout: 20000 });
  await connectStreamingTab(guest);
  await waitFor(async () => (await roster(host)).length === 2 && (await roster(guest)).length === 2, 15000, "both rosters show two people");
  const hostRoster = await roster(host);
  report("guest joins via invite; both rosters list host and guest", hostRoster.some((row) => /Host Harness.*Host/.test(row)) && hostRoster.some((row) => /Guest Harness.*Watching/.test(row)), hostRoster.join(" | "));

  // 5. Play follows.
  await drive(host, () => document.getElementById("player").play());
  await waitFor(async () => !(await player(guest)).paused, 6000, "guest starts playing");
  report("host presses play → guest's player starts", true, `${((await sample(host, guest)).drift).toFixed(2)}s apart`);

  // 6. Seek converges within tolerance.
  await drive(host, () => { document.getElementById("player").currentTime = 60; });
  const afterSeek = await waitFor(async () => { const s = await sample(host, guest); return s.a.time > 59 && s.drift <= TOLERANCE ? s : null; }, 8000, "guest follows the seek");
  report("host seeks to 60 s → guest within tolerance", true, `host ${afterSeek.a.time.toFixed(2)}s · guest ${afterSeek.b.time.toFixed(2)}s · drift ${afterSeek.drift.toFixed(2)}s`);

  // 7. Projection keeps them together while playing.
  await sleep(8000);
  const steady = await sample(host, guest);
  report("after 8 s of playback the projected positions stay within tolerance", steady.drift <= TOLERANCE && !steady.b.paused, `drift ${steady.drift.toFixed(2)}s`);

  // 8. Pause follows.
  await drive(host, () => document.getElementById("player").pause());
  const afterPause = await waitFor(async () => { const s = await sample(host, guest); return s.b.paused ? s : null; }, 6000, "guest pauses");
  report("host pauses → guest pauses at the same position", afterPause.drift <= TOLERANCE, `drift ${afterPause.drift.toFixed(2)}s`);

  // 9. Rate follows.
  await drive(host, () => { document.getElementById("player").playbackRate = 1.5; });
  await waitFor(async () => Math.abs((await player(guest)).rate - 1.5) < 0.01, 6000, "guest rate 1.5");
  report("host changes playback rate → guest matches", true);
  await drive(host, () => { document.getElementById("player").playbackRate = 1; });
  await waitFor(async () => Math.abs((await player(guest)).rate - 1) < 0.01, 6000, "guest rate back to 1");

  // 10. Guest in host-only mode cannot steer; the heartbeat pulls a stalled guest back.
  await drive(host, () => document.getElementById("player").play());
  await waitFor(async () => !(await player(guest)).paused, 6000, "guest playing again");
  await drive(guest, () => document.getElementById("player").pause());
  await sleep(2500);
  const hostUnaffected = !(await player(host)).paused;
  const pulledBack = await waitFor(async () => { const s = await sample(host, guest); return !s.b.paused && s.drift <= TOLERANCE ? s : null; }, 12000, "heartbeat resumes the stalled guest");
  report("guest pausing locally does not stop the host (host-only control)", hostUnaffected);
  report("host heartbeat resumes the stalled guest and re-converges", true, `drift ${pulledBack.drift.toFixed(2)}s`);

  // 11. Roster drift labels (protocol 2) or the honest pending notice (protocol 1).
  if (LEGACY) {
    await host.room.waitForSelector(".watch-legacy-note", { timeout: 15000 });
    report("a protocol-1 service is detected and the room says host controls are pending", true, await host.room.$eval(".watch-legacy-note", (node) => node.textContent.slice(0, 80)));
  } else {
    await waitFor(async () => (await roster(host)).some((row) => /Guest Harness.*in sync/.test(row)), 12000, "host roster shows the guest in sync");
    report("roster shows the guest as in sync with the host", true, (await roster(host)).join(" | "));
  }

  // 12. Encrypted chat both ways.
  await sendChat(host, "hello from the host");
  await waitFor(async () => (await chat(guest)).some((line) => /hello from the host/.test(line)), 8000, "guest receives chat");
  await sendChat(guest, "hi back");
  await waitFor(async () => (await chat(host)).some((line) => /hi back/.test(line)), 8000, "host receives chat");
  report("encrypted chat is delivered both ways", true);

  // 13. Voice: fake microphone → remote audio track reaches the guest over WebRTC.
  await host.room.click("text=Microphone");
  const voice = await waitFor(async () => guest.room.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll(".watch-video-tile")).map((tile) => tile.innerText.replace(/\s+/g, " "));
    const live = Array.from(document.querySelectorAll("video")).some((element) => element.srcObject && element.srcObject.getAudioTracks().some((track) => track.readyState === "live"));
    return live && tiles.some((text) => /Host Harness.*Mic on/.test(text)) ? { tiles } : null;
  }), 20000, "guest receives the host's audio track");
  report("microphone stream arrives peer-to-peer and the tile shows Mic on", true, voice.tiles.join(" | "));

  if (LEGACY) {
    // Protocol-2 host controls do not exist on the old service; end here.
    await guest.context.close();
    await rm(guest.dir, { recursive: true, force: true });
    await host.room.click("text=End for everyone");
    await host.room.waitForURL(/\/watch-together$/, { timeout: 15000 });
    report("host ends the room on the protocol-1 service", true);
    const legacyErrors = [...host.errors].filter((line) => !/favicon|net::ERR_|Failed to load resource/.test(line));
    report("no page errors against the protocol-1 service", legacyErrors.length === 0, legacyErrors.slice(0, 3).join(" | "));
    await host.context.close();
    await rm(host.dir, { recursive: true, force: true });
    return;
  }

  // 14. Host transfer: the guest becomes the controller.
  await host.room.click('.watch-host-actions button[title="Make host"]');
  await waitFor(async () => /You control playback/.test(await nowPlaying(guest)), 10000, "guest sees it controls playback");
  await waitFor(async () => (await chat(host)).some((line) => /Guest Harness is now the host/.test(line)), 10000, "host sees the handover line");
  report("host hands over → guest controls, both see the system line", true);
  await drive(guest, () => document.getElementById("player").pause());
  const pausedAt = Date.now();
  const newHostPause = await waitFor(async () => { const s = await sample(host, guest); return s.a.paused ? s : null; }, 12000, "former host follows the new host's pause");
  report("new host pauses → former host follows", newHostPause.drift <= TOLERANCE, `${((Date.now() - pausedAt) / 1000).toFixed(1)} s · drift ${newHostPause.drift.toFixed(2)}s`);

  // 15. Lock keeps a third person out; unlock lets them in; remove kicks them.
  await guest.room.click("text=Lock room");
  await waitFor(async () => /Locked/.test(await topbar(host)), 8000, "host sees the lock chip");
  const third = await launchParticipant("third");
  third.room = await third.context.newPage();
  await third.room.goto(invite);
  await third.room.waitForSelector("form.watch-create-card");
  await third.room.fill('input[placeholder="Your name"]', "Third Harness");
  await third.room.click("text=Join watch room");
  await third.room.waitForSelector(".watch-form-error", { timeout: 10000 });
  report("locked room refuses a new join", /locked/i.test(await third.room.textContent(".watch-form-error")), (await third.room.textContent(".watch-form-error")).trim());
  await guest.room.click("text=Unlock room");
  await waitFor(async () => !/Locked/.test(await topbar(host)), 8000, "lock chip clears");
  await third.room.click("text=Join watch room");
  await third.room.waitForSelector(".watch-room-topbar", { timeout: 20000 });
  await waitFor(async () => (await roster(guest)).length === 3 && (await roster(host)).length === 3 && (await roster(third)).length === 3, 20000, "every roster shows three");
  report("after unlock the third person joins and every roster shows three", true);
  const thirdRow = await guest.room.$$(".watch-participant-list > div");
  for (const row of thirdRow) { if (/Third Harness/.test(await row.innerText())) await row.$eval('button[title="Remove"]', (button) => button.click()); }
  await third.room.waitForSelector("text=The host removed you from this room", { timeout: 15000 });
  await waitFor(async () => (await roster(host)).length === 2, 15000, "roster back to two");
  report("host removes the third person; they are told and the rosters shrink", true);
  await third.context.close();
  await rm(third.dir, { recursive: true, force: true });

  // 16. Optional soak: the hidden room tab must keep polling at full cadence.
  if (SOAK_MINUTES > 0) {
    // The guest is the controller now. Restart from the top so the movie
    // outlasts the soak, then leave both room tabs hidden the way they are
    // during a real film: Chrome throttles hidden-tab timers, and after five
    // minutes it throttles chained timers to one wake-up per minute. The poll
    // loop must survive that, and a seek after the soak must still land fast.
    await drive(guest, () => { const media = document.getElementById("player"); media.currentTime = 0; return media.play(); });
    await waitFor(async () => { const s = await sample(host, guest); return !s.a.paused && s.a.time < 10 && s.drift <= TOLERANCE; }, 10000, "restarted together for the soak");
    await host.room.evaluate(() => performance.clearResourceTimings());
    console.log(`${stamp()} soaking for ${SOAK_MINUTES} min with both room tabs hidden…`);
    await sleep(SOAK_MINUTES * 60000);
    const cadence = await pollIntervals(host, 60000);
    const soak = await sample(host, guest);
    report(`after ${SOAK_MINUTES} min hidden the room still polls at full cadence`, cadence.polls >= 30 && cadence.max !== null && cadence.max < 3000, `${cadence.polls} polls in the last minute · median gap ${Math.round(cadence.median)} ms · max ${Math.round(cadence.max)} ms`);
    report("and the players are still within tolerance", soak.drift <= TOLERANCE && !soak.b.paused && !soak.a.paused, `host ${soak.a.time.toFixed(1)}s · guest ${soak.b.time.toFixed(1)}s · drift ${soak.drift.toFixed(2)}s`);
    const seekAt = Date.now();
    await drive(guest, () => { document.getElementById("player").currentTime = 600; });
    const landed = await waitFor(async () => { const s = await sample(host, guest); return s.a.time >= 599 && s.drift <= TOLERANCE ? s : null; }, 15000, "seek after the soak lands on the hidden peer");
    report("a seek after the soak still lands on the other person within seconds", Date.now() - seekAt < 4000, `${((Date.now() - seekAt) / 1000).toFixed(1)} s · drift ${landed.drift.toFixed(2)}s`);
  }

  // 17. The controller disappears → the room promotes the remaining person.
  await guest.context.close();
  const promotedAt = Date.now();
  await waitFor(async () => (await chat(host)).some((line) => /You are now the host/.test(line)), 90000, "automatic promotion");
  report("host tab closes → the remaining participant is promoted automatically", /You control playback/.test(await nowPlaying(host)), `${((Date.now() - promotedAt) / 1000).toFixed(0)} s`);
  await rm(guest.dir, { recursive: true, force: true });

  // 18. End for everyone.
  await host.room.click("text=End for everyone");
  await host.room.waitForURL(/\/watch-together$/, { timeout: 15000 });
  const ended = await (await fetch(`${BASE}/api/watch/rooms/${roomId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "Late", inviteProof: "x".repeat(32) }) })).status;
  report("host ends the room; the invitation stops working", ended >= 400, `join after end → HTTP ${ended}`);

  const pageErrors = [...host.errors].filter((line) => !/favicon|net::ERR_|Failed to load resource/.test(line));
  report("no page errors in the host's browser during the run", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  await host.context.close();
  await rm(host.dir, { recursive: true, force: true });
}

const live = { pages: [] };
let failed = false;
try {
  await main();
} catch (error) {
  failed = true;
  console.error(`${stamp()} ABORTED: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  for (const page of live.pages) {
    try { if (!page.isClosed()) console.error(`  page ${page.url().slice(0, 80)} :: ${(await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 400)}`); } catch { /* gone */ }
  }
} finally {
  for (const child of children) { try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* gone */ } } }
}
const passed = results.filter((item) => item.ok).length;
console.log(`\n${passed}/${results.length} checks passed${failed ? " (run aborted)" : ""}`);
process.exit(failed || passed !== results.length ? 1 : 0);
