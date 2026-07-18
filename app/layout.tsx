import type { Metadata } from "next";
import { ConsentManager } from "../components/consent-manager";
import { JsonLd } from "../components/json-ld";
import { SiteShell } from "../components/site-shell";
import { alternateUrls, baseDescription, COMPANY_CIN, COMPANY_NAME, siteLanguage, siteUrl } from "../lib/site";
import "./globals.css";

const organizationStructuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://trenith.com/#organization",
    name: COMPANY_NAME,
    legalName: COMPANY_NAME,
    taxID: COMPANY_CIN,
    url: "https://trenith.com",
    logo: siteUrl("/trenith-mark.png"),
    address: { "@type": "PostalAddress", streetAddress: "Plot No. 272, Pragatinagar", addressLocality: "Hyderabad", addressRegion: "Telangana", postalCode: "500090", addressCountry: "IN" },
    areaServed: ["India", "United States", "European Union", "Worldwide"],
    sameAs: ["https://www.trenith.com", "https://github.com/TrenithOfficial"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": siteUrl("/#website"),
    name: "Trenith Tools",
    url: siteUrl("/"),
    description: baseDescription,
    publisher: { "@id": "https://trenith.com/#organization" },
    inLanguage: siteLanguage,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: siteUrl("/tools?q={search_term_string}") },
      "query-input": "required name=search_term_string",
    },
  },
];

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: { default: "Trenith Tools — Free File & BYOK AI Workspace", template: "%s · Trenith Tools" },
  description: baseDescription,
  applicationName: "Trenith Tools",
  authors: [{ name: COMPANY_NAME, url: "https://trenith.com" }],
  creator: COMPANY_NAME,
  publisher: COMPANY_NAME,
  keywords: ["free online tools", "free tools no sign up", "audio converter online free", "metadata remover online", "merge pdf free", "audio joiner", "video joiner", "PDF tools", "image compressor online", "SEO tools free", "audio downloader", "BYOK AI", "browser file tools", "private file tools no upload", "Trenith"],
  alternates: { ...alternateUrls("/"), types: { "application/rss+xml": siteUrl("/feed.xml") } },
  openGraph: { type: "website", locale: siteLanguage === "en-IN" ? "en_IN" : "en_US", url: siteUrl("/"), siteName: "Trenith Tools", title: "Trenith Tools — Free Private File & BYOK AI Tools", description: baseDescription, images: [{ url: "/trenith-og.jpg", width: 630, height: 630, alt: "Trenith Tools" }] },
  twitter: { card: "summary_large_image", title: "Trenith Tools", description: baseDescription, images: ["/trenith-og.jpg"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  category: "technology",
  other: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { "google-site-verification": process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : {}),
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon-180.png",
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
      <body><JsonLd data={organizationStructuredData} /><SiteShell>{children}</SiteShell><ConsentManager /></body>
    </html>
  );
}
