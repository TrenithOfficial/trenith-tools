"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { providerDefinitions, useSessionConnections } from "../lib/byok";
import { tools } from "../lib/catalog";

let voicesCache: { key: string; list: Array<{ name: string; lang: string }> } = { key: "", list: [] };

function subscribeToVoices(callback: () => void) {
  if (!("speechSynthesis" in window)) return () => undefined;
  window.speechSynthesis.addEventListener("voiceschanged", callback);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", callback);
}

function getVoicesSnapshot() {
  const list = "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  const key = list.map((voice) => voice.name).join("|");
  if (key !== voicesCache.key) voicesCache = { key, list: list.map((voice) => ({ name: voice.name, lang: voice.lang })) };
  return voicesCache.list;
}

function useBrowserVoices() {
  return useSyncExternalStore(subscribeToVoices, getVoicesSnapshot, () => voicesCache.list);
}

const workflowPrompts: Record<string, string> = {
  "ai-song-generator": "Create a production-ready song concept. Include title, style, tempo, key, arrangement, instrumentation, vocal direction and original lyrics. Avoid imitating a living artist.",
  "ai-vocal-generator": "Create an original vocal performance brief with lyrics, phrasing, dynamics, harmonies and pronunciation notes.",
  "cover-remix": "Create a legally safe remix plan for material I own or am authorized to use. Describe structure, tempo, sound design and mix decisions without copying a protected recording.",
  "stem-separator": "Explain the best stem-separation workflow for the described recording and return a concise, ordered processing plan.",
  "text-to-speech": "Read the following text naturally:",
  "voice-converter": "Create a voice-conversion direction sheet using a voice I own or have permission to use. Include tone, pacing, articulation and safety checks.",
  "audio-to-midi": "Describe a precise audio-to-MIDI transcription plan for the supplied musical description, including tempo, pitch range, quantization and cleanup.",
  "audio-cleanup": "Create a repair chain for the described audio problem. Include noise reduction, de-click, EQ, dynamics and loudness targets.",
  "pdf-summarizer": "Summarize the following document content. Return key findings, decisions, risks and next actions:",
  "translate-pdf": "Translate the following document content while preserving headings, lists, terminology and tone. State the target language first:",
  "ocr-pdf": "Clean and structure the following OCR text. Preserve reading order, headings, tables and uncertain characters:",
  "office-converter": "Analyze the requested document conversion and return a faithful content and formatting plan:",
  "ai-chat": "Answer the following request accurately. Separate verified facts, assumptions and recommended next steps:",
  "ai-writer": "Create an original draft from the facts below. Ask for missing evidence instead of inventing it. Audience, goal and tone:",
  "grammar-checker": "Correct grammar, spelling, punctuation and clarity while preserving meaning. Return the corrected text followed by a concise change summary. Regional English style:",
  "paraphraser": "Rewrite the following authorized text for clarity and tone. Preserve all factual meaning, do not hide plagiarism and do not imitate a living author:",
  "code-assistant": "Act as a careful code reviewer. State assumptions, identify security and correctness risks, then provide tested code or a patch. Runtime and request:",
  "regex-generator": "Create a regular expression for the following requirement. Include the target runtime, an explained pattern, matching examples, non-matching examples and catastrophic-backtracking risks:",
  "data-analyzer": "Create a defensible data-analysis plan from the following schema or sample. Include validation, missing-data handling, formulas or queries, uncertainty and decision limits:",
  "seo-brief-generator": "Create a people-first SEO, AEO and answer-engine brief from the verified facts below. Include intent, H1/H2 structure, direct answers, entities, internal links, evidence gaps and claims to avoid. Do not keyword-stuff:",
};

type StudioResult = { kind: "text"; text: string; label?: string } | { kind: "file"; url: string; name: string; mime: string } | { kind: "spoken"; label: string };

const fileWorkflows = new Set(["cover-remix", "stem-separator", "voice-converter", "audio-to-midi", "audio-cleanup", "ocr-pdf", "office-converter"]);
const mediaJobWorkflows = new Set(["ai-song-generator", "ai-vocal-generator", ...fileWorkflows]);
const workflowAccept: Record<string, string> = {
  "cover-remix": "audio/*", "stem-separator": "audio/*", "voice-converter": "audio/*",
  "audio-to-midi": "audio/*", "audio-cleanup": "audio/*", "ocr-pdf": "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
  "office-converter": ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.odt,.ods,.odp",
};

// Every workflow runs with whatever connection exists; this map only states
// which provider produces the strongest result so the choice stays informed.
const workflowAdvice: Record<string, { ideal: string; anyKey: string }> = {
  "ai-song-generator": { ideal: "A compatible music endpoint returns finished audio.", anyKey: "Any text model writes the full song concept, arrangement and original lyrics." },
  "ai-vocal-generator": { ideal: "A compatible vocal endpoint returns a performance.", anyKey: "Any text model writes the complete vocal performance brief." },
  "cover-remix": { ideal: "A compatible media endpoint runs the actual remix job.", anyKey: "Any text model produces the remix production plan for the attached recording." },
  "stem-separator": { ideal: "A compatible separation endpoint returns the stems.", anyKey: "Any text model plans the separation and cleanup chain for your recording." },
  "voice-converter": { ideal: "A compatible conversion endpoint returns converted audio.", anyKey: "Any text model prepares the conversion direction sheet." },
  "audio-to-midi": { ideal: "A compatible transcription endpoint returns the MIDI file.", anyKey: "Any text model plans tempo, pitch range, quantization and cleanup." },
  "audio-cleanup": { ideal: "A compatible restoration endpoint returns cleaned audio.", anyKey: "Any text model designs the noise, echo and loudness repair chain." },
  "text-to-speech": { ideal: "ElevenLabs (or a compatible endpoint) returns a downloadable MP3.", anyKey: "Built-in browser voices speak the text instantly at no cost — no key needed." },
  "ocr-pdf": { ideal: "OpenAI, Gemini or Anthropic keys read text straight from an image.", anyKey: "Attach a JPG/PNG/WebP scan up to 3 MB; larger scans can be reduced with the free Image Compressor." },
  "office-converter": { ideal: "A compatible conversion endpoint returns the converted file.", anyKey: "Any text model maps content and formatting into a faithful conversion plan." },
};

function speakWithBrowser(text: string, voiceName: string, rate: number) {
  return new Promise<void>((resolve, reject) => {
    if (!("speechSynthesis" in window)) { reject(new Error("This browser does not include speech synthesis. Connect ElevenLabs for generated audio.")); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = window.speechSynthesis.getVoices().find((item) => item.name === voiceName);
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.onend = () => resolve();
    utterance.onerror = (event) => { if (event.error === "canceled" || event.error === "interrupted") resolve(); else reject(new Error(`Browser speech failed: ${event.error}`)); };
    window.speechSynthesis.speak(utterance);
  });
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function fileNameFromResponse(response: Response, mime: string) {
  const match = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i);
  if (match?.[1]) return match[1];
  if (mime.includes("audio")) return "trenith-ai-audio.mp3";
  if (mime.includes("image")) return "trenith-ai-image.png";
  if (mime.includes("video")) return "trenith-ai-video.mp4";
  return "trenith-provider-output.bin";
}

export function AiStudio() {
  const params = useSearchParams();
  const workflow = params.get("workflow") || "ai-song-generator";
  const workflowTool = tools.find((tool) => tool.slug === workflow && tool.kind === "byok");
  const connections = useSessionConnections();
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [prompt, setPrompt] = useState(workflowPrompts[workflow] || "Describe the result you want to create.");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [promptWorkflow, setPromptWorkflow] = useState(workflow);

  // Reset the brief when the visitor switches workflows; adjusting state during
  // render keeps the reset synchronous without an effect.
  if (promptWorkflow !== workflow) {
    setPromptWorkflow(workflow);
    setPrompt(workflowPrompts[workflow] || "Describe the result you want to create.");
    setSourceFile(null);
  }

  const connectionId = selectedConnectionId && connections.some((item) => item.id === selectedConnectionId) ? selectedConnectionId : connections[0]?.id || "";
  const connection = useMemo(() => connections.find((item) => item.id === connectionId), [connections, connectionId]);
  const advice = workflowAdvice[workflow];
  const isTts = workflow === "text-to-speech";
  const browserSpeech = isTts && (!connection || !["elevenlabs", "compatible"].includes(connection.provider));
  const voices = useBrowserVoices();
  const [voiceName, setVoiceName] = useState("");
  const [speechRate, setSpeechRate] = useState(1);

  async function run() {
    if (!prompt.trim()) { setError("Enter instructions or text for the provider."); return; }
    if (!connection && !browserSpeech) { setError("Connect and select a provider before running this workflow."); return; }
    const visionRun = workflow === "ocr-pdf" && connection && ["openai", "anthropic", "gemini"].includes(connection.provider) && sourceFile;
    if (workflow === "ocr-pdf" && connection && ["openai", "anthropic", "gemini"].includes(connection.provider) && !sourceFile) { setError("Attach a JPG, PNG or WebP scan so your vision model can read it."); return; }
    if (visionRun && sourceFile && sourceFile.size > 3 * 1024 * 1024) { setError("Vision requests are limited to 3 MB images. Reduce the scan with the free Image Compressor first."); return; }
    if (fileWorkflows.has(workflow) && connection?.provider === "compatible" && !sourceFile) { setError("Choose the authorized source file required by this workflow."); return; }
    setBusy(true); setError("");
    if (result?.kind === "file") URL.revokeObjectURL(result.url);
    setResult(null);
    try {
      if (browserSpeech) {
        const spokenText = prompt.replace(/^Read the following text naturally:\s*/i, "").trim() || prompt;
        setResult({ kind: "spoken", label: "Speaking with the built-in browser voice. Connect ElevenLabs for a downloadable MP3." });
        await speakWithBrowser(spokenText, voiceName, speechRate);
        return;
      }
      if (!connection) throw new Error("Connect and select a provider before running this workflow.");
      const briefMode = mediaJobWorkflows.has(workflow) && connection.provider !== "compatible" && !visionRun;
      let response: Response;
      if (connection.provider === "compatible") {
        if (!connection.endpoint) throw new Error("This connection is missing its HTTPS endpoint.");
        const body = sourceFile ? (() => { const form = new FormData(); form.set("file", sourceFile); form.set("prompt", prompt); form.set("model", connection.model); form.set("workflow", workflow); return form; })() : JSON.stringify({ model: connection.model, messages: [{ role: "user", content: prompt }], prompt, workflow });
        response = await fetch(connection.endpoint, {
          method: "POST",
          headers: { ...(sourceFile ? {} : { "content-type": "application/json" }), Authorization: `Bearer ${connection.apiKey}` },
          body,
        });
      } else {
        const fileContext = briefMode && sourceFile ? `\n\nAttached recording for reference: ${sourceFile.name} (${(sourceFile.size / 1024 / 1024).toFixed(2)} MB). Base the plan on this file's described content.` : "";
        const payload: Record<string, unknown> = { action: "generate", provider: connection.provider, apiKey: connection.apiKey, model: connection.model, voiceId: connection.voiceId, prompt: prompt + fileContext };
        if (visionRun && sourceFile) {
          payload.imageDataUrl = await fileToDataUrl(sourceFile);
        }
        response = await fetch("/api/byok", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const mime = response.headers.get("content-type") || "application/octet-stream";
      if (!response.ok) {
        const detail = mime.includes("json") ? (await response.json() as { error?: string }).error : await response.text();
        throw new Error(detail || `The provider returned HTTP ${response.status}.`);
      }
      if (mime.includes("application/json") || mime.includes("text/")) {
        const data = mime.includes("json") ? await response.json() as { text?: string; choices?: Array<{ message?: { content?: string } }>; output?: string } : { text: await response.text() };
        const text = data.text || data.output || data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
        setResult({ kind: "text", text, label: briefMode ? "Structured plan from your text model. Connect a compatible media endpoint to run the finished job." : undefined });
      } else {
        const blob = await response.blob();
        setResult({ kind: "file", url: URL.createObjectURL(blob), name: fileNameFromResponse(response, mime), mime });
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The provider request failed."); }
    finally { setBusy(false); }
  }

  return <div className="studio-layout">
    <section className="workspace-panel studio-input">
      <div className="studio-heading"><span className="panel-label">ACTIVE WORKFLOW</span><h2>{workflowTool?.name || "AI provider runner"}</h2><p>{workflowTool?.description || "Send a real request using one of your session connections."}</p></div>
      <label className="studio-field">Provider connection<select value={connectionId} onChange={(event) => setSelectedConnectionId(event.target.value)}><option value="">Select a session connection</option>{connections.map((item) => <option key={item.id} value={item.id}>{item.label} · {providerDefinitions[item.provider].name}</option>)}</select></label>
      {!connections.length && !browserSpeech && <div className="studio-empty"><span>⌁</span><div><strong>No provider is connected</strong><p>Add a session connection, test it, then return here to run a request. Gemini API keys include a free tier, and OpenRouter lists free community models — either works here at no cost.</p></div><Link href="/connections">Open Connections →</Link></div>}
      {advice && <div className="connection-notice"><span>◇</span><p><strong>Best result:</strong> {advice.ideal} <strong>Works right now:</strong> {advice.anyKey}</p></div>}
      {browserSpeech && <>
        <div className="connection-notice"><span>♪</span><p>No audio key connected, so Trenith speaks with the voices built into this browser — free and on-device. Connect ElevenLabs when you need a downloadable MP3 file.</p></div>
        {voices.length > 0 && <label className="studio-field">Browser voice<select value={voiceName} onChange={(event) => setVoiceName(event.target.value)}><option value="">Automatic voice</option>{voices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name} · {voice.lang}</option>)}</select></label>}
        <label className="studio-field">Speaking rate · {speechRate.toFixed(2)}×<input type="range" min="0.5" max="1.5" step="0.05" value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} /></label>
      </>}
      {fileWorkflows.has(workflow) && <label className="studio-field">Authorized source file{workflow !== "ocr-pdf" && connection?.provider !== "compatible" ? " (optional in plan mode)" : ""}<input type="file" accept={workflowAccept[workflow]} onChange={(event) => setSourceFile(event.target.files?.[0] || null)} />{sourceFile && <small>{sourceFile.name} · {(sourceFile.size / 1024 / 1024).toFixed(2)} MB</small>}</label>}
      <label className="studio-field">Instructions or source text<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={13} maxLength={40000} /></label>
      <div className="studio-run-row"><small>{prompt.length.toLocaleString()} / 40,000 characters</small><button className="workspace-run" onClick={run} disabled={busy || (!connectionId && !browserSpeech)}>{busy ? (browserSpeech ? "Speaking…" : "Provider is working…") : browserSpeech ? "Speak with browser voice" : "Run with my provider"}<span>→</span></button></div>
      {error && <div className="workspace-error" aria-live="polite">{error}</div>}
    </section>
    <aside className="workspace-panel studio-output">
      <span className="panel-label">PROVIDER OUTPUT</span>
      {!result && <div className="output-placeholder"><span>◎</span><h2>Results appear here</h2><p>Trenith only shows a result after the connected provider returns one. Availability, cost and model capability come from your provider account.</p></div>}
      {result?.kind === "spoken" && <div className="output-placeholder"><span>♪</span><h2>{busy ? "Speaking…" : "Spoken aloud"}</h2><p>{result.label}</p>{busy && <button className="secondary-button" onClick={() => window.speechSynthesis.cancel()}>Stop speaking</button>}</div>}
      {result?.kind === "text" && <div className="text-result"><div><h2>Text response</h2><button onClick={() => navigator.clipboard.writeText(result.text)}>Copy</button></div>{result.label && <p className="result-mode-note">{result.label}</p>}<pre>{result.text}</pre><a download="trenith-ai-result.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(result.text)}`}>Download .txt ↓</a></div>}
      {result?.kind === "file" && <div className="media-result"><span>✓</span><h2>Provider file ready</h2><p>{result.mime}</p>{result.mime.startsWith("audio/") && <audio controls src={result.url} />}<a className="primary-action" href={result.url} download={result.name}>Download {result.name} ↓</a></div>}
      <div className="studio-trust"><span>KEY ROUTE</span><p>{connection?.provider === "compatible" ? "Direct browser request to your HTTPS endpoint. That endpoint must allow CORS." : "Fixed, allowlisted provider route. Keys are excluded from URLs, logs and page source."}</p></div>
    </aside>
  </div>;
}
