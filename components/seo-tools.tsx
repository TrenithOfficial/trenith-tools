"use client";

import { useMemo, useState } from "react";

// Approximate Arial advance widths scaled per font size; Google renders titles
// at roughly 20px and descriptions at 14px on desktop.
const NARROW = new Set("iljft.,:;!|'()[] ".split(""));
const WIDE = new Set("mwMW@%".split(""));

function approximatePixels(text: string, fontSize: number) {
  let units = 0;
  for (const character of text) units += NARROW.has(character) ? 0.34 : WIDE.has(character) ? 0.92 : character === character.toUpperCase() && /[A-Z]/.test(character) ? 0.72 : 0.55;
  return Math.round(units * fontSize);
}

function LengthCheck({ label, value, limit, unit }: { label: string; value: number; limit: number; unit: string }) {
  const over = value > limit;
  return <div className={over ? "length-check over" : "length-check"}><span>{label}</span><strong>{value.toLocaleString()} / {limit.toLocaleString()} {unit}</strong><b>{over ? "Too long — likely truncated" : "Fits"}</b></div>;
}

function SerpPreview() {
  const [title, setTitle] = useState("Free Private File Tools — Convert, Clean and Merge in Your Browser");
  const [url, setUrl] = useState("https://example.com/tools");
  const [description, setDescription] = useState("Convert audio, remove hidden metadata, merge PDFs and compress images without uploading files. Free, private and fast on any device.");
  const display = useMemo(() => {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\//g, " › ").replace(/^ › /, " › ");
      return `${parsed.hostname}${path}`;
    } catch { return url; }
  }, [url]);
  const titlePixels = approximatePixels(title, 20);
  const descriptionPixels = approximatePixels(description, 14);
  return <div className="seo-workspace">
    <section className="workspace-panel">
      <span className="panel-label">SNIPPET SOURCE</span>
      <h2>Write the snippet</h2>
      <label>Page title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} /></label>
      <label>Page URL<input value={url} onChange={(event) => setUrl(event.target.value)} maxLength={200} placeholder="https://example.com/page" /></label>
      <label>Meta description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={400} /></label>
      <div className="length-checks">
        <LengthCheck label="Title characters" value={title.length} limit={60} unit="chars" />
        <LengthCheck label="Title width (approx.)" value={titlePixels} limit={580} unit="px" />
        <LengthCheck label="Description characters" value={description.length} limit={160} unit="chars" />
        <LengthCheck label="Description width (approx.)" value={descriptionPixels} limit={990} unit="px" />
      </div>
      <small className="seo-footnote">Pixel widths are estimates from average glyph metrics. Search engines rewrite snippets they consider unhelpful, so clarity beats exact length.</small>
    </section>
    <aside className="workspace-panel">
      <span className="panel-label">LIVE PREVIEW</span>
      <h2>Desktop result</h2>
      <div className="serp-card desktop">
        <span className="serp-url">{display || "example.com"}</span>
        <strong className="serp-title">{titlePixels > 580 ? `${title.slice(0, Math.max(10, Math.round(title.length * 580 / Math.max(titlePixels, 1))))}…` : title || "Add a title"}</strong>
        <p className="serp-description">{descriptionPixels > 990 ? `${description.slice(0, Math.max(20, Math.round(description.length * 990 / Math.max(descriptionPixels, 1))))}…` : description || "Add a meta description."}</p>
      </div>
      <h2>Mobile result</h2>
      <div className="serp-card mobile">
        <span className="serp-url">{display || "example.com"}</span>
        <strong className="serp-title">{title.length > 55 ? `${title.slice(0, 55)}…` : title || "Add a title"}</strong>
        <p className="serp-description">{description.length > 120 ? `${description.slice(0, 120)}…` : description || "Add a meta description."}</p>
      </div>
    </aside>
  </div>;
}

const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by", "from", "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those", "as", "your", "you", "we", "our", "they", "their", "i", "not", "no", "can", "will", "into", "than", "then", "so", "if", "do", "does", "have", "has", "had"]);

function countSyllables(word: string) {
  const groups = word.toLowerCase().replace(/[^a-z]/g, "").match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (/e$/.test(word) && count > 1) count -= 1;
  return Math.max(1, count);
}

function topPhrases(words: string[], size: number, limit: number) {
  const counts = new Map<string, number>();
  for (let index = 0; index <= words.length - size; index += 1) {
    const slice = words.slice(index, index + size);
    if (size === 1 && STOP_WORDS.has(slice[0])) continue;
    if (size > 1 && (STOP_WORDS.has(slice[0]) || STOP_WORDS.has(slice[size - 1]))) continue;
    const phrase = slice.join(" ");
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1 || size === 1).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function KeywordDensity() {
  const [text, setText] = useState("");
  const analysis = useMemo(() => {
    const clean = text.trim();
    if (!clean) return null;
    const words = clean.toLowerCase().replace(/[^\p{L}\p{N}'\s-]/gu, " ").split(/\s+/).filter(Boolean);
    const sentences = clean.split(/[.!?]+\s/).filter((sentence) => sentence.trim().length > 1);
    const syllables = words.reduce((total, word) => total + countSyllables(word), 0);
    const flesch = sentences.length && words.length ? Math.round(206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length)) : 0;
    const questions = clean.split(/\n|(?<=[.!?])\s/).map((line) => line.trim()).filter((line) => line.endsWith("?")).slice(0, 12);
    return {
      words: words.length,
      characters: clean.length,
      sentences: sentences.length,
      readingMinutes: Math.max(1, Math.round(words.length / 220)),
      flesch: Math.max(0, Math.min(100, flesch)),
      singles: topPhrases(words, 1, 10),
      pairs: topPhrases(words, 2, 8),
      triples: topPhrases(words, 3, 6),
      questions,
    };
  }, [text]);
  return <div className="seo-workspace">
    <section className="workspace-panel">
      <span className="panel-label">CONTENT INPUT</span>
      <h2>Paste the copy</h2>
      <p>Analysis runs on your device. Nothing you paste leaves this browser tab.</p>
      <textarea className="density-input" value={text} onChange={(event) => setText(event.target.value)} rows={16} maxLength={200000} placeholder="Paste an article, landing page or draft…" />
      <small className="seo-footnote">{text.length.toLocaleString()} / 200,000 characters</small>
    </section>
    <aside className="workspace-panel">
      <span className="panel-label">ANALYSIS</span>
      {!analysis && <div className="output-placeholder"><span>%</span><h2>Metrics appear here</h2><p>Word counts, readability, keyword densities and detected questions update as you paste or type.</p></div>}
      {analysis && <>
        <div className="density-stats">
          <article><span>Words</span><strong>{analysis.words.toLocaleString()}</strong></article>
          <article><span>Sentences</span><strong>{analysis.sentences.toLocaleString()}</strong></article>
          <article><span>Reading time</span><strong>{analysis.readingMinutes} min</strong></article>
          <article><span>Reading ease (est.)</span><strong>{analysis.flesch} / 100</strong></article>
        </div>
        <h3>Top keywords</h3>
        <div className="density-list">{analysis.singles.map(([phrase, count]) => <div key={phrase}><span>{phrase}</span><b>{count}× · {(count / Math.max(1, analysis.words) * 100).toFixed(1)}%</b></div>)}</div>
        {analysis.pairs.length > 0 && <><h3>Repeated two-word phrases</h3><div className="density-list">{analysis.pairs.map(([phrase, count]) => <div key={phrase}><span>{phrase}</span><b>{count}×</b></div>)}</div></>}
        {analysis.triples.length > 0 && <><h3>Repeated three-word phrases</h3><div className="density-list">{analysis.triples.map(([phrase, count]) => <div key={phrase}><span>{phrase}</span><b>{count}×</b></div>)}</div></>}
        <h3>Questions this copy answers</h3>
        {analysis.questions.length ? <ul className="density-questions">{analysis.questions.map((question) => <li key={question}>{question}</li>)}</ul> : <p className="seo-footnote">No direct questions found. Answer-engine visibility improves when copy asks and answers the questions people search for.</p>}
      </>}
    </aside>
  </div>;
}

export function SeoUtility({ slug }: { slug: string }) {
  if (slug === "serp-snippet-preview") return <SerpPreview />;
  return <KeywordDensity />;
}
