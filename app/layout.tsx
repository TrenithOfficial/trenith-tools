import type { Metadata } from "next";
import { SiteShell } from "../components/site-shell";
import { baseDescription, COMPANY_NAME, siteUrl } from "../lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: { default: "Trenith Tools — Free File & BYOK AI Workspace", template: "%s · Trenith Tools" },
  description: baseDescription,
  applicationName: "Trenith Tools",
  authors: [{ name: COMPANY_NAME, url: "https://trenith.com" }, { name: "Sai Phanindra Manikanta Yalamanchili" }],
  creator: COMPANY_NAME,
  publisher: COMPANY_NAME,
  keywords: ["free online tools", "audio joiner", "video joiner", "PDF tools", "image tools", "audio downloader", "BYOK AI", "browser file tools", "Trenith"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "en_IN", url: "/", siteName: "Trenith Tools", title: "Trenith Tools — Every file tool. Free. Private. Fast.", description: baseDescription, images: [{ url: "/trenith-og.jpg", width: 630, height: 630, alt: "Trenith" }] },
  twitter: { card: "summary_large_image", title: "Trenith Tools", description: baseDescription, images: ["/trenith-og.jpg"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  category: "technology",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/trenith-mark.png",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
