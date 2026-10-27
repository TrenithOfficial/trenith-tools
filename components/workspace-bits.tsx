"use client";

import { useEffect, useRef } from "react";

export function Progress({ value, label, eta }: { value: number; label: string; eta?: string }) {
  return <div className="workspace-progress" aria-live="polite"><div><span>{label}{eta ? ` · ${eta}` : ""}</span><strong>{value}%</strong></div><div><i style={{ width: `${value}%` }} /></div></div>;
}

// A dropped folder arrives as a directory entry, not as its files; walk it so
// "drag the whole album in" works the same as choosing the folder.
type EntryLike = { isFile: boolean; isDirectory: boolean; file: (resolve: (file: File) => void, reject: (error: unknown) => void) => void; createReader: () => { readEntries: (resolve: (entries: EntryLike[]) => void, reject: (error: unknown) => void) => void } };

async function filesFromEntry(entry: EntryLike, depth = 0): Promise<File[]> {
  if (entry.isFile) return [await new Promise<File>((resolve, reject) => entry.file(resolve, reject))];
  if (!entry.isDirectory || depth > 6) return [];
  const reader = entry.createReader();
  const collected: EntryLike[] = [];
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    collected.push(...batch);
  }
  const nested = await Promise.all(collected.map((child) => filesFromEntry(child, depth + 1)));
  return nested.flat();
}

export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const items = Array.from(transfer.items || []);
  const entries = items.map((item) => (item.webkitGetAsEntry?.() ?? null) as EntryLike | null);
  if (entries.some((entry) => entry?.isDirectory)) {
    const walked = await Promise.all(entries.map((entry) => (entry ? filesFromEntry(entry) : Promise.resolve([]))));
    return walked.flat().filter((file) => !file.name.startsWith("."));
  }
  return Array.from(transfer.files || []);
}

export function FilePicker({ files, setFiles, accept, folder = false, multiple = true, title, hint }: { files: File[]; setFiles: (files: File[]) => void; accept: string; folder?: boolean; multiple?: boolean; title: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (folder && input.current) input.current.setAttribute("webkitdirectory", ""); }, [folder]);
  const acceptable = (file: File) => {
    const rules = accept.split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
    if (!rules.length || rules.includes("*/*")) return true;
    const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
    const type = file.type.toLowerCase();
    return rules.some((rule) => rule.startsWith(".") ? rule === extension : rule.endsWith("/*") ? type.startsWith(rule.slice(0, -1)) : rule === type);
  };
  const add = (incoming: ArrayLike<File> | null) => {
    if (!incoming?.length) return;
    const next = Array.from(incoming).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFiles(multiple ? [...files, ...next].filter((file, index, all) => all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index) : next.slice(0, 1));
  };
  const drop = async (event: React.DragEvent) => {
    event.preventDefault();
    const dropped = await filesFromDrop(event.dataTransfer);
    // The file dialog enforces `accept`; a drop does not, so a stray text file
    // dropped into an audio folder would otherwise fail the whole batch later.
    const kept = dropped.filter(acceptable);
    add(kept.length ? kept : dropped);
  };
  return <>
    <button type="button" className="file-picker" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void drop(event)}>
      <span>＋</span><strong>{title}</strong><small>{hint || "Drag and drop files or a folder, or browse"}</small>
    </button>
    <input ref={input} className="sr-only" type="file" accept={accept} multiple={multiple} onChange={(event) => { add(event.target.files); event.currentTarget.value = ""; }} />
  </>;
}

export function FileList({ files, setFiles }: { files: File[]; setFiles: (files: File[]) => void }) {
  const move = (index: number, change: number) => {
    const target = index + change;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    setFiles(next);
  };
  return <div className="workspace-file-list">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div><div><button onClick={() => move(index, -1)} disabled={!index} aria-label={`Move ${file.name} up`}>↑</button><button onClick={() => move(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`}>↓</button><button onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>×</button></div></div>)}</div>;
}

export function formatEta(elapsedMs: number, ratio: number): string {
  if (!(ratio > 0.03)) return "";
  const remaining = Math.max(0, elapsedMs / ratio - elapsedMs) / 1000;
  if (remaining < 5) return "almost done";
  if (remaining < 90) return `about ${Math.round(remaining)} s left`;
  return `about ${Math.round(remaining / 60)} min left`;
}

export function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
