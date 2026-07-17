import Link from "next/link";
import { kindLabel, ToolDefinition } from "../lib/catalog";

export function ToolCard({ tool, featured = false }: { tool: ToolDefinition; featured?: boolean }) {
  return (
    <Link className={featured ? "tool-launch-card featured" : "tool-launch-card"} href={`/tools/${tool.slug}`}>
      <span className={`tool-line-icon ${tool.accent}`}>{tool.icon}</span>
      <span className="tool-card-arrow">↗</span>
      <h3>{tool.shortName}</h3>
      <p>{tool.description}</p>
      <span className={`capability-chip ${tool.kind}`}>{kindLabel(tool.kind)}</span>
    </Link>
  );
}

