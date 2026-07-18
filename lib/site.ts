export const SITE_NAME = "Trenith Tools";
export const COMPANY_NAME = "Trenith Technologies Private Limited";
export const COMPANY_CIN = "U62099TS2026PTC216554";
export const GLOBAL_SITE_URL = "https://tools.trenith.com";
export const INDIA_SITE_URL = "https://tools.trenith.in";
export const DEFAULT_SITE_URL = GLOBAL_SITE_URL;

export const siteRegion = process.env.NEXT_PUBLIC_SITE_REGION === "IN" ? "IN" : "GLOBAL";
export const siteLanguage = siteRegion === "IN" ? "en-IN" : "en";

export function siteUrl(path = "/") {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || DEFAULT_SITE_URL;
  return new URL(path, `${configured}/`).toString();
}

export function alternateUrls(path = "/") {
  return {
    canonical: siteUrl(path),
    languages: {
      "en": new URL(path, `${GLOBAL_SITE_URL}/`).toString(),
      "en-IN": new URL(path, `${INDIA_SITE_URL}/`).toString(),
      "x-default": new URL(path, `${GLOBAL_SITE_URL}/`).toString(),
    },
  };
}

export const trenithContactUrl =
  "https://www.trenith.com/contact?utm_source=trenith_tools&utm_medium=product&utm_campaign=free_tools";

export const baseDescription =
  "Free private file tools for audio, video, PDF, images and metadata, BYOK AI, and Watch Together rooms with synchronized OTT playback, voice and video from Trenith Technologies.";
