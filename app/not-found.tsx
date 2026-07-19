import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <section className="page-frame" style={{ minHeight: "58vh", display: "grid", placeItems: "center", textAlign: "center", padding: "60px 0" }}>
      <div style={{ maxWidth: "480px" }}>
        <span className="section-kicker">404</span>
        <h1 style={{ fontSize: "clamp(28px,5vw,40px)", letterSpacing: "-0.02em", margin: "10px 0 8px" }}>That page moved or never existed</h1>
        <p style={{ marginBottom: "24px" }}>The tool or guide you were after isn&apos;t here. Browse the full directory or jump back to the homepage.</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="primary-action" href="/tools">Browse all tools <span>→</span></Link>
          <Link className="secondary-button" href="/">Home</Link>
        </div>
      </div>
    </section>
  );
}
