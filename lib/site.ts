export const SITE_NAME = "Trenith Tools";
export const COMPANY_NAME = "Trenith Technologies Pvt Ltd";
export const DEFAULT_SITE_URL = "https://trenith-tools.vercel.app";

export function siteUrl(path = "/") {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || DEFAULT_SITE_URL;
  return new URL(path, `${configured}/`).toString();
}

export const baseDescription =
  "Free browser-based audio, video, PDF and image tools from Trenith Technologies. Process files on your device or connect your own AI provider key.";
