"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ByokConnection, providerDefinitions, readSessionConnections } from "../lib/byok";
import { tools } from "../lib/catalog";

const workflowPrompts: Record<string, string> = {
  "ai-song-generator": "Create a production-ready song concept. Include title, style, tempo, key, arrangement, instrumentation, vocal direction and original lyrics. Avoid imitating a living artist.",
  "ai-vocal-generator": "Create an original vocal performance brief with lyrics, phrasing, dynamics, harmonies and pronunciation notes.",
  "cover-remix": "Create a legally safe remix plan for material I own or am authorized to use. Describe structure, tempo, sound design and mix decisions without copying a protected recording.",
  "stem-separator": "Explain the best stem-separation workflow for the described recording and return a concise, ordered processing plan.",
  "text-to-speech": "Read the following text naturally:",
  "voice-conversion": "Create a voice-conversion direction sheet using a voice I own or have permission to use. Include tone, pacing, articulation and safety checks.",
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

type StudioResult = { kind: "text"; text: string } | { kind: "file"; url: string; name: string; mime: string };

const fileWorkflows = new Set(["cover-remix", "stem-separator", "voice-conversion", "audio-to-midi", "audio-cleanup", "ocr-pdf", "office-converter"]);
const compatibleOnlyWorkflows = new Set(["ai-song-generator", "ai-vocal-generator", ...fileWorkflows]);
const workflowAccept: Record<string, string> = {
  "cover-remix": "audio/*", "stem-separator": "audio/*", "voice-conversion": "audio/*",
  "audio-to-midi": "audio/*", "audio-cleanup": "audio/*", "ocr-pdf": "image/*,application/pdf",
  "office-converter": ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.odt,.ods,.odp",
};

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
  const [connections, setConnections] = useState<ByokConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [prompt, setPrompt] = useState(workflowPrompts[workflow] || "Describe the result you want to create.");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () => {
      const next = readSessionConnections();
      setConnections(next);
      setConnectionId((current) => current || next[0]?.id || "");
    };
    const frame = requestAnimationFrame(load);
    window.addEventListener("trenith-connections-change", load);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("trenith-connections-change", load); };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { setPrompt(workflowPrompts[workflow] || "Describe the result you want to create."); setSourceFile(null); });
    return () => cancelAnimationFrame(frame);
  }, [workflow]);

  const connection = useMemo(() => connections.find((item) => item.id === connectionId), [connections, connectionId]);

  async function run() {
    if (!connection) { setError("Connect and select a provider before running this workflow."); return; }
    if (!prompt.trim()) { setError("Enter instructions or text for the provider."); return; }
    if (fileWorkflows.has(workflow) && !sourceFile) { setError("Choose the authorized source file required by this workflow."); return; }
    if (compatibleOnlyWorkflows.has(workflow) && connection.provider !== "compatible") { setError("This media workflow requires a compatible provider endpoint that supports the selected job and returns its result. The built-in OpenAI, Anthropic, Gemini and OpenRouter connectors are text-only."); return; }
    if (workflow === "text-to-speech" && !["elevenlabs", "compatible"].includes(connection.provider)) { setError("Text to Speech requires ElevenLabs or a compatible endpoint that returns audio."); return; }
    setBusy(true); setError("");
    if (result?.kind === "file") URL.revokeObjectURL(result.url);
    setResult(null);
    try {
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
        response = await fetch("/api/byok", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "generate", provider: connection.provider, apiKey: connection.apiKey, model: connection.model, voiceId: connection.voiceId, prompt }),
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
        setResult({ kind: "text", text });
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
      <label className="studio-field">Provider connection<select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}><option value="">Select a session connection</option>{connections.map((item) => <option key={item.id} value={item.id}>{item.label} · {providerDefinitions[item.provider].name}</option>)}</select></label>
      {!connections.length && <div className="studio-empty"><span>⌁</span><div><strong>No provider is connected</strong><p>Add a session connection, test it, then return here to run a request.</p></div><Link href="/connections">Open Connections →</Link></div>}
      {compatibleOnlyWorkflows.has(workflow) && <div className="connection-notice"><span>↗</span><p>This media workflow needs a compatible endpoint that implements <strong>{workflow}</strong>. Trenith sends a JSON brief, or multipart form data when a file is required, and displays the endpoint response.</p></div>}
      {fileWorkflows.has(workflow) && <label className="studio-field">Authorized source file<input type="file" accept={workflowAccept[workflow]} onChange={(event) => setSourceFile(event.target.files?.[0] || null)} />{sourceFile && <small>{sourceFile.name} · {(sourceFile.size / 1024 / 1024).toFixed(2)} MB</small>}</label>}
      <label className="studio-field">Instructions or source text<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={13} maxLength={40000} /></label>
      <div className="studio-run-row"><small>{prompt.length.toLocaleString()} / 40,000 characters</small><button className="workspace-run" onClick={run} disabled={busy || !connectionId}>{busy ? "Provider is working…" : "Run with my provider"}<span>→</span></button></div>
      {error && <div className="workspace-error" aria-live="polite">{error}</div>}
    </section>
    <aside className="workspace-panel studio-output">
      <span className="panel-label">PROVIDER OUTPUT</span>
      {!result && <div className="output-placeholder"><span>◎</span><h2>Results appear here</h2><p>Trenith only shows a result after the connected provider returns one. Availability, cost and model capability come from your provider account.</p></div>}
      {result?.kind === "text" && <div className="text-result"><div><h2>Text response</h2><button onClick={() => navigator.clipboard.writeText(result.text)}>Copy</button></div><pre>{result.text}</pre><a download="trenith-ai-result.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(result.text)}`}>Download .txt ↓</a></div>}
      {result?.kind === "file" && <div className="media-result"><span>✓</span><h2>Provider file ready</h2><p>{result.mime}</p>{result.mime.startsWith("audio/") && <audio controls src={result.url} />}<a className="primary-action" href={result.url} download={result.name}>Download {result.name} ↓</a></div>}
      <div className="studio-trust"><span>KEY ROUTE</span><p>{connection?.provider === "compatible" ? "Direct browser request to your HTTPS endpoint. That endpoint must allow CORS." : "Fixed, allowlisted provider route. Keys are excluded from URLs, logs and page source."}</p></div>
    </aside>
  </div>;
}
