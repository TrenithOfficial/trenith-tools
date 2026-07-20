"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Req = { email: string; name: string; reason: string; status: string };

async function callAction(body: Record<string, unknown>) {
  const res = await fetch("/api/watch/access/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data } as { ok: boolean; data: { error?: string; request?: Req; status?: string; email?: string } };
}

export function ReviewClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const hint = params.get("a") || "";
  const [phase, setPhase] = useState<"loading" | "ready" | "working" | "done" | "error">(token ? "loading" : "error");
  const [req, setReq] = useState<Req | null>(null);
  const [message, setMessage] = useState(token ? "" : "This review link is missing its token.");

  useEffect(() => {
    if (!token) return;
    let active = true;
    callAction({ token }).then(({ ok, data }) => {
      if (!active) return;
      if (!ok || !data.request) { setPhase("error"); setMessage(data.error || "This review link is invalid or has expired."); return; }
      setReq(data.request); setPhase("ready");
    }).catch(() => { if (active) { setPhase("error"); setMessage("Could not reach the review service."); } });
    return () => { active = false; };
  }, [token]);

  const decide = async (decision: "approve" | "reject") => {
    setPhase("working");
    const { ok, data } = await callAction({ token, decision });
    if (!ok) { setPhase("error"); setMessage(data.error || "Could not complete that action."); return; }
    setMessage(decision === "approve"
      ? `Approved — ${req?.email || "the requester"} has been emailed their access key.`
      : `Rejected — ${req?.email || "the request"} was declined.`);
    setPhase("done");
  };

  return (
    <section className="page-frame" style={{ display: "flex", justifyContent: "center", padding: "60px 18px 90px" }}>
      <div className="review-card">
        <span className="review-eyebrow">WATCH TOGETHER · REVIEW</span>
        <h1 className="review-title">Access request</h1>

        {phase === "loading" && <p className="review-note">Loading the request…</p>}

        {phase === "error" && <p className="review-error" role="alert">{message}</p>}

        {(phase === "ready" || phase === "working") && req && (
          <>
            <dl className="review-details">
              <div><dt>Email</dt><dd>{req.email}</dd></div>
              <div><dt>Name</dt><dd>{req.name}</dd></div>
              <div><dt>Reason</dt><dd>{req.reason || "—"}</dd></div>
              <div><dt>Status</dt><dd className={`review-status status-${req.status}`}>{req.status}</dd></div>
            </dl>
            {req.status !== "pending" && <p className="review-note">This request is already <strong>{req.status}</strong>. You can still change the decision below.</p>}
            <div className="review-actions">
              <button className="review-approve" disabled={phase === "working"} data-hint={hint === "approve"} onClick={() => decide("approve")}>Approve access</button>
              <button className="review-reject" disabled={phase === "working"} data-hint={hint === "reject"} onClick={() => decide("reject")}>Reject</button>
            </div>
            <p className="review-note small">Approving mints the access key and emails it to them. Nothing else changed until you clicked.</p>
          </>
        )}

        {phase === "done" && <div className="review-done"><span aria-hidden>✓</span><p>{message}</p></div>}
      </div>
    </section>
  );
}
