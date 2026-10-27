"use client";

import { useEffect, useRef } from "react";

// `hidden` keeps an audio-only peer audible while the tile shows an avatar.
export function WatchVideo({ stream, muted = false, label, hidden = false }: { stream: MediaStream; muted?: boolean; label: string; hidden?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} style={hidden ? { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" } : undefined} />;
}
