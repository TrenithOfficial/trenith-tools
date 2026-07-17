import type { Metadata } from "next";
import { ConsentManager } from "../components/consent-manager";
import { SiteShell } from "../components/site-shell";
import { alternateUrls, baseDescription, COMPANY_NAME, siteLanguage, siteUrl } from "../lib/site";
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
  alternates: alternateUrls("/"),
  openGraph: { type: "website", locale: siteLanguage === "en-IN" ? "en_IN" : "en_US", url: siteUrl("/"), siteName: "Trenith Tools", title: "Trenith Tools — Free Private File & BYOK AI Tools", description: baseDescription, images: [{ url: "/trenith-og.jpg", width: 630, height: 630, alt: "Trenith Tools" }] },
  twitter: { card: "summary_large_image", title: "Trenith Tools", description: baseDescription, images: ["/trenith-og.jpg"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  category: "technology",
  other: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { "google-site-verification": process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : {}),
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
    <html lang={siteLanguage}>
      <body><SiteShell>{children}</SiteShell><ConsentManager /></body>
    </html>
  );
}
