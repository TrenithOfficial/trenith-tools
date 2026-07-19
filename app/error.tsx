"use client";

import Link from "next/link";

// Route-level boundary: keeps the site header/footer and offers a scoped retry so
// a single tool crash never white-screens the whole app.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="page-frame" style={{ minHeight: "58vh", display: "grid", placeItems: "center", textAlign: "center", padding: "60px 0" }}>
      <div style={{ maxWidth: "480px" }}>
        <span className="section-kicker">Unexpected error</span>
        <h1 style={{ fontSize: "clamp(28px,5vw,40px)", letterSpacing: "-0.02em", margin: "10px 0 8px" }}>This tool ran into a problem</h1>
        <p style={{ marginBottom: "24px" }}>It processes files on your device, so nothing was uploaded and no data was lost. Retry the action, or head back to the tool directory.</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <button className="primary-action" onClick={() => reset()}>Try again <span>→</span></button>
          <Link className="secondary-button" href="/tools">All tools</Link>
        </div>
      </div>
    </section>
  );
}
