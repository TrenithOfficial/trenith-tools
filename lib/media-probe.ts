// Pure parser for FFmpeg's stderr stream description. ffmpeg.wasm ships no
// ffprobe, but `ffmpeg -i input` prints the same container, duration and
// per-stream summary before exiting, which is enough to make quality decisions
// (lossless remux versus re-encode, which audio tracks exist, which languages
// to restore after a metadata strip). Kept free of DOM/engine dependencies so
// it is unit-tested directly in Node.

export type ProbeStream = {
  index: number;
  type: "video" | "audio" | "subtitle" | "data" | "attachment";
  codec: string;
  profile?: string;
  language?: string;
  width?: number;
  height?: number;
  fps?: number;
  pixelFormat?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  bitrateKbps?: number;
  isDefault: boolean;
  attachedPic: boolean;
};

export type MediaProbe = {
  formats: string[];
  durationSeconds: number;
  bitrateKbps: number;
  streams: ProbeStream[];
  metadataKeys: string[];
  chapters: number;
};

const streamLine = /Stream #\d+:(\d+)(?:\[[^\]]*\])?(?:\(([A-Za-z]{2,3})\))?: (Video|Audio|Subtitle|Data|Attachment): ([^\n]*)/;

function parseChannels(segment: string): { channels?: number; layout?: string } {
  const explicit = segment.match(/\b(\d{1,2})\s+channels\b/);
  if (explicit) return { channels: Number(explicit[1]), layout: `${explicit[1]} channels` };
  if (/\bmono\b/.test(segment)) return { channels: 1, layout: "mono" };
  if (/\bstereo\b/.test(segment)) return { channels: 2, layout: "stereo" };
  const surround = segment.match(/\b(\d)\.(\d)(?:\([^)]*\))?\b/);
  if (surround) return { channels: Number(surround[1]) + Number(surround[2]), layout: `${surround[1]}.${surround[2]}` };
  if (/\bquad\b/.test(segment)) return { channels: 4, layout: "quad" };
  return {};
}

export function parseFfmpegProbe(log: string): MediaProbe {
  const probe: MediaProbe = { formats: [], durationSeconds: 0, bitrateKbps: 0, streams: [], metadataKeys: [], chapters: 0 };
  const input = log.match(/Input #0, ([^,\n]+(?:,[^,\n]+)*), from/);
  if (input) probe.formats = input[1].split(",").map((value) => value.trim()).filter(Boolean);
  const duration = log.match(/Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (duration) probe.durationSeconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  const bitrate = log.match(/Duration:[^\n]*bitrate: (\d+) kb\/s/);
  if (bitrate) probe.bitrateKbps = Number(bitrate[1]);
  probe.chapters = (log.match(/^\s*Chapter #\d+:\d+:/gm) || []).length;

  const lines = log.split(/\r?\n/);
  let inGlobalMetadata = false;
  let sawStream = false;
  for (const line of lines) {
    if (/^\s*Input #0/.test(line)) { inGlobalMetadata = false; continue; }
    if (/^\s{2}Metadata:\s*$/.test(line) && !sawStream) { inGlobalMetadata = true; continue; }
    if (/^\s{2}(Duration|Stream|Chapter)/.test(line)) inGlobalMetadata = false;
    if (inGlobalMetadata) {
      const tag = line.match(/^\s{4}([A-Za-z0-9_\-.:©®]+)\s*:/);
      if (tag) probe.metadataKeys.push(tag[1]);
    }
    const match = line.match(streamLine);
    if (!match) continue;
    sawStream = true;
    const [, index, language, kind, rest] = match;
    const parts = rest.split(",").map((value) => value.trim());
    const codecField = parts[0] || "";
    const codec = (codecField.match(/^([a-z0-9_]+)/i)?.[1] || "unknown").toLowerCase();
    const profile = codecField.match(/^[a-z0-9_]+ \(([^)]+)\)/i)?.[1];
    const stream: ProbeStream = {
      index: Number(index),
      type: kind.toLowerCase() as ProbeStream["type"],
      codec,
      profile,
      language: language && language !== "und" ? language.toLowerCase() : undefined,
      isDefault: /\(default\)/.test(rest),
      attachedPic: /\(attached pic\)/.test(rest),
    };
    const kbps = rest.match(/\b(\d+) kb\/s/);
    if (kbps) stream.bitrateKbps = Number(kbps[1]);
    if (stream.type === "video") {
      const size = rest.match(/\b(\d{2,5})x(\d{2,5})\b/);
      if (size) { stream.width = Number(size[1]); stream.height = Number(size[2]); }
      const fps = rest.match(/\b(\d+(?:\.\d+)?)k? fps\b/);
      if (fps) stream.fps = Number(fps[1]);
      const pixel = parts[1]?.match(/^([a-z0-9]+)/i);
      if (pixel && !/^\d/.test(pixel[1])) stream.pixelFormat = pixel[1].toLowerCase();
    }
    if (stream.type === "audio") {
      const rate = rest.match(/\b(\d{4,6}) Hz\b/);
      if (rate) stream.sampleRate = Number(rate[1]);
      const { channels, layout } = parseChannels(rest);
      stream.channels = channels;
      stream.channelLayout = layout;
    }
    probe.streams.push(stream);
  }
  return probe;
}

export function primaryVideo(probe: MediaProbe): ProbeStream | undefined {
  return probe.streams.find((stream) => stream.type === "video" && !stream.attachedPic);
}

export function primaryAudio(probe: MediaProbe): ProbeStream | undefined {
  return probe.streams.find((stream) => stream.type === "audio" && stream.isDefault) || probe.streams.find((stream) => stream.type === "audio");
}

// Containers and the codecs they can carry unchanged. Used to decide when a
// conversion can be a lossless, near-instant remux instead of a re-encode.
export const containerCodecs: Record<string, { video: string[]; audio: string[]; subtitle: string[] }> = {
  mp4: { video: ["h264", "hevc", "mpeg4", "av1", "vp9"], audio: ["aac", "mp3", "ac3", "eac3", "alac", "opus", "flac"], subtitle: ["mov_text"] },
  m4v: { video: ["h264", "hevc", "mpeg4"], audio: ["aac", "mp3", "ac3", "alac"], subtitle: ["mov_text"] },
  mov: { video: ["h264", "hevc", "mpeg4", "prores", "mjpeg", "dnxhd", "rawvideo", "png"], audio: ["aac", "mp3", "ac3", "alac", "pcm_s16le", "pcm_s24le", "pcm_s16be", "pcm_s24be", "pcm_f32le"], subtitle: ["mov_text"] },
  mkv: { video: ["h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "mpeg2video", "theora", "prores", "mjpeg"], audio: ["aac", "mp3", "ac3", "eac3", "dts", "opus", "vorbis", "flac", "alac", "pcm_s16le", "pcm_s24le", "truehd", "wmav2"], subtitle: ["subrip", "ass", "ssa", "webvtt", "hdmv_pgs_subtitle", "dvd_subtitle", "mov_text"] },
  webm: { video: ["vp8", "vp9", "av1"], audio: ["opus", "vorbis"], subtitle: ["webvtt"] },
  m4a: { video: [], audio: ["aac", "alac", "mp3"], subtitle: [] },
  mp3: { video: ["mjpeg", "png"], audio: ["mp3"], subtitle: [] },
  flac: { video: ["mjpeg", "png"], audio: ["flac"], subtitle: [] },
  ogg: { video: ["theora"], audio: ["vorbis", "opus", "flac"], subtitle: [] },
  opus: { video: [], audio: ["opus"], subtitle: [] },
  wav: { video: [], audio: ["pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "pcm_u8"], subtitle: [] },
  aiff: { video: [], audio: ["pcm_s16be", "pcm_s24be", "pcm_s32be"], subtitle: [] },
  mka: { video: [], audio: ["aac", "mp3", "ac3", "opus", "vorbis", "flac", "alac", "pcm_s16le", "wmav2"], subtitle: [] },
  gif: { video: ["gif"], audio: [], subtitle: [] },
};

export type RemuxPlan = { remux: boolean; reasons: string[] };

// A conversion can skip re-encoding when every stream we intend to keep already
// fits the target container. Subtitles and data tracks are dropped rather than
// forcing a re-encode, since they are rarely the reason someone converts.
export function planRemux(probe: MediaProbe, targetContainer: string, keepVideo: boolean): RemuxPlan {
  const target = containerCodecs[targetContainer];
  const reasons: string[] = [];
  if (!target) return { remux: false, reasons: ["Unknown target container"] };
  const video = primaryVideo(probe);
  const audio = primaryAudio(probe);
  if (keepVideo) {
    if (!video) reasons.push("No video stream found");
    else if (!target.video.includes(video.codec)) reasons.push(`${video.codec.toUpperCase()} video cannot be stored in ${targetContainer.toUpperCase()}`);
  }
  if (audio && !target.audio.includes(audio.codec)) reasons.push(`${audio.codec.toUpperCase()} audio cannot be stored in ${targetContainer.toUpperCase()}`);
  if (!audio && !keepVideo) reasons.push("No audio stream found");
  return { remux: reasons.length === 0, reasons };
}

// Lossless concatenation requires identical codec parameters across clips.
export function concatCompatibility(probes: MediaProbe[]): { compatible: boolean; reason?: string } {
  if (probes.length < 2) return { compatible: false, reason: "At least two clips are required." };
  const signature = (probe: MediaProbe) => {
    const video = primaryVideo(probe);
    const audio = primaryAudio(probe);
    return JSON.stringify({
      v: video ? [video.codec, video.width, video.height, video.pixelFormat, video.fps ? Math.round(video.fps * 1000) : 0] : null,
      a: audio ? [audio.codec, audio.sampleRate, audio.channels] : null,
    });
  };
  const first = signature(probes[0]);
  const mismatch = probes.findIndex((probe) => signature(probe) !== first);
  if (mismatch >= 0) return { compatible: false, reason: `Clip ${mismatch + 1} uses a different codec, size, frame rate or audio layout.` };
  return { compatible: true };
}
