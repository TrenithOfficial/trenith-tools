import { NextResponse } from "next/server";
import { kindLabel, tools } from "../../../lib/catalog";
import { siteUrl } from "../../../lib/site";

export const runtime = "edge";

export function GET() {
  return NextResponse.json({
    name: "Trenith Tools",
    description: "Free device-first file utilities and BYOK AI workflows.",
    updated: "2026-07-17",
    count: tools.length,
    tools: tools.map((tool) => ({ name: tool.name, slug: tool.slug, category: tool.category, processing: kindLabel(tool.kind), description: tool.description, formats: tool.formats || [], url: siteUrl(`/tools/${tool.slug}`) })),
  }, { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
}
