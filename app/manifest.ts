import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Trenith Tools", short_name: "Trenith", description: "Free device-first file tools and BYOK AI workspace.", start_url: "/", display: "standalone", background_color: "#07080c", theme_color: "#2f6bff", icons: [{ src: "/trenith-mark.png", sizes: "512x512", type: "image/png" }] };
}
