import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trenith Tools",
    short_name: "Trenith",
    description: "Free device-first file tools and BYOK AI workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0e14",
    theme_color: "#0c0e14",
    icons: [
      { src: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/favicon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/favicon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
