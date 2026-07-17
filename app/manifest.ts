import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Trenith Tools", short_name: "Trenith", description: "Free device-first file tools and BYOK AI workspace.", start_url: "/", display: "standalone", background_color: "#f6f1e7", theme_color: "#f6f1e7", icons: [{ src: "/trenith-mark.png", sizes: "512x512", type: "image/png" }] };
}
