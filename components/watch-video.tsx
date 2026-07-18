"use client";

import { useEffect, useRef } from "react";

export function WatchVideo({ stream, muted = false, label }: { stream: MediaStream; muted?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} aria-label={label} />;
}
