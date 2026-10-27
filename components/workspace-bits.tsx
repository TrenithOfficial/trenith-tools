"use client";

import { useEffect, useRef } from "react";

export function Progress({ value, label, eta }: { value: number; label: string; eta?: string }) {
  return <div className="workspace-progress" aria-live="polite"><div><span>{label}{eta ? ` · ${eta}` : ""}</span><strong>{value}%</strong></div><div><i style={{ width: `${value}%` }} /></div></div>;
}

export function FilePicker({ files, setFiles, accept, folder = false, multiple = true, title, hint }: { files: File[]; setFiles: (files: File[]) => void; accept: string; folder?: boolean; multiple?: boolean; title: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (folder && input.current) input.current.setAttribute("webkitdirectory", ""); }, [folder]);
  const add = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const next = [...incoming].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFiles(multiple ? [...files, ...next].filter((file, index, all) => all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index) : next.slice(0, 1));
  };
  return <>
    <button type="button" className="file-picker" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); add(event.dataTransfer.files); }}>
      <span>＋</span><strong>{title}</strong><small>{hint || "Drag and drop or browse"}</small>
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
