import type { MetadataRoute } from "next";
import { tools } from "../lib/catalog";
import { siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const modified = new Date("2026-07-17T00:00:00.000Z");
  const routes = ["/", "/tools", "/connections", "/studio", "/about", "/privacy", "/terms"];
  return [...routes.map((route, index) => ({ url: siteUrl(route), lastModified: modified, changeFrequency: index < 2 ? "weekly" as const : "monthly" as const, priority: route === "/" ? 1 : route === "/tools" ? .9 : .7 })), ...tools.map((tool) => ({ url: siteUrl(`/tools/${tool.slug}`), lastModified: modified, changeFrequency: "monthly" as const, priority: .75 }))];
}
