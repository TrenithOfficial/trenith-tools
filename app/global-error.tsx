"use client";

// Last-resort boundary: catches errors thrown in the root layout itself, where
// no site chrome is available. It must render its own <html>/<body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0d0f15", color: "#eef1f6", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", padding: "24px" }}>
        <main style={{ maxWidth: "440px", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", margin: "0 0 8px", letterSpacing: "-0.02em" }}>Something broke on this page</h1>
          <p style={{ color: "#9aa4b4", lineHeight: 1.6, margin: "0 0 20px" }}>The tool hit an unexpected error. Your files never left your device, and nothing was uploaded. Try again — if it keeps happening, reload the page.</p>
          <button onClick={() => reset()} style={{ padding: "11px 20px", borderRadius: "11px", border: "1px solid #313a4c", background: "#2855ff", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
