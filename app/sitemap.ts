import type { MetadataRoute } from "next";
import { tools } from "../lib/catalog";
import { guides } from "../lib/guides";
import { GLOBAL_SITE_URL, INDIA_SITE_URL, siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const modified = new Date("2026-07-18T00:00:00.000Z");
  const routes = ["/", "/tools", "/guides", "/status", "/changelog", "/connections", "/studio", "/about", "/privacy", "/terms", "/cookies", "/privacy-choices", "/security", "/sub-processors", "/open-source", "/copyright", "/accessibility"];
  const makeEntry = (path: string, priority: number, changeFrequency: "weekly" | "monthly") => ({
    url: siteUrl(path), lastModified: modified, changeFrequency, priority,
    alternates: { languages: { en: new URL(path, `${GLOBAL_SITE_URL}/`).toString(), "en-IN": new URL(path, `${INDIA_SITE_URL}/`).toString(), "x-default": new URL(path, `${GLOBAL_SITE_URL}/`).toString() } },
  });
  return [
    ...routes.map((route) => makeEntry(route, route === "/" ? 1 : route === "/tools" ? .95 : route === "/guides" || route === "/status" ? .85 : .65, route === "/" || route === "/tools" || route === "/changelog" ? "weekly" : "monthly")),
    ...tools.map((tool) => makeEntry(`/tools/${tool.slug}`, tool.slug === "metadata-remover" ? .9 : .78, "monthly")),
    ...guides.map((guide) => makeEntry(`/guides/${guide.slug}`, .76, "monthly")),
  ];
}
