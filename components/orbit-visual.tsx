import Image from "next/image";

export function OrbitVisual() {
  return (
    <div className="orbit-visual" aria-label="Trenith Tools processes files on your device without a subscription">
      <svg className="orbit-lines" viewBox="0 0 640 500" aria-hidden="true">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#2f6bff" stopOpacity=".34" />
            <stop offset=".7" stopColor="#2f6bff" stopOpacity=".06" />
            <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#56d7ff" /><stop offset=".48" stopColor="#2f6bff" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx="315" cy="250" r="205" fill="url(#core)" />
        <g fill="none" stroke="url(#stroke)">
          <ellipse className="orbit-a" cx="315" cy="250" rx="255" ry="158" strokeOpacity=".38" />
          <ellipse className="orbit-b" cx="315" cy="250" rx="205" ry="204" strokeOpacity=".25" strokeDasharray="7 13" />
          <ellipse className="orbit-c" cx="315" cy="250" rx="145" ry="114" strokeOpacity=".7" />
          <ellipse cx="315" cy="250" rx="102" ry="102" strokeOpacity=".2" />
        </g>
        {/* Connector lines from the core out to each proof node, each ending in a node dot. */}
        <g stroke="#7d8aa6" strokeDasharray="3 5" strokeWidth="1.4">
          <path d="M425 168 L523 120" />
          <path d="M437 250 L556 250" />
          <path d="M425 332 L523 380" />
        </g>
        <g fill="url(#stroke)" filter="url(#glow)">
          <circle cx="523" cy="120" r="6" />
          <circle cx="556" cy="250" r="6" />
          <circle cx="523" cy="380" r="6" />
        </g>
        {/* Ambient node points riding the orbit rings. */}
        <g fill="#56d7ff" filter="url(#glow)"><circle cx="70" cy="250" r="4.5" /><circle cx="150" cy="118" r="3.5" /><circle cx="176" cy="404" r="4" /></g>
      </svg>
      <div className="orbit-core">
        <Image className="orbit-mark" src="/trenith-mark-dark.png" width={62} height={62} alt="Trenith" priority />
        <strong>Trenith<br />Tools</strong>
      </div>
      <div className="proof-node node-one"><span><OnDeviceIcon /></span><strong>ON YOUR DEVICE</strong><small>Audio, video, PDF &amp; images</small></div>
      <div className="proof-node node-two"><span><NoStoreIcon /></span><strong>NO FILE STORAGE</strong><small>Inputs stay in your browser</small></div>
      <div className="proof-node node-three"><span><KeyIcon /></span><strong>YOUR AI KEYS</strong><small>Connect provider accounts</small></div>
    </div>
  );
}

function OnDeviceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="15" height="15"><rect x="4" y="3" width="16" height="12" rx="2" /><path d="M8 19h8M12 15v4" /></svg>;
}

function NoStoreIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="15" height="15"><path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7l7-4z" /><path d="M9.5 12l1.7 1.7L15 10" /></svg>;
}

function KeyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="15" height="15"><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M19 19l2-2" /></svg>;
}
