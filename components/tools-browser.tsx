"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { categories, tools } from "../lib/catalog";
import { ToolCard } from "./tool-card";

export function ToolsBrowser() {
  const params = useSearchParams();
  const initialCategory = params.get("category");
  const [category, setCategory] = useState(categories.includes(initialCategory as typeof categories[number]) ? initialCategory || "All" : "All");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => tools.filter((tool) => {
    const categoryMatch = category === "All" || tool.category === category;
    const text = `${tool.name} ${tool.description} ${tool.formats?.join(" ") || ""}`.toLowerCase();
    return categoryMatch && text.includes(query.trim().toLowerCase());
  }), [category, query]);

  return (
    <>
      <div className="tool-browser-controls">
        <label className="tool-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by tool, job or format" aria-label="Search tools" /><kbd>{visible.length}</kbd></label>
        <div className="tool-filters" aria-label="Filter tools by category">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      </div>
      <div className="full-tool-grid">{visible.map((tool) => <ToolCard key={tool.slug} tool={tool} />)}</div>
      {!visible.length && <div className="empty-state"><span>⌕</span><h2>No matching tools</h2><p>Try audio, PDF, image, join, convert or AI.</p></div>}
    </>
  );
}

