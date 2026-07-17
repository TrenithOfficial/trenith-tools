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
          <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#56d7ff"/><stop offset=".48" stopColor="#2f6bff"/><stop offset="1" stopColor="#7c3aed"/></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="315" cy="250" r="205" fill="url(#core)" />
        <g fill="none" stroke="url(#stroke)">
          <ellipse className="orbit-a" cx="315" cy="250" rx="255" ry="158" strokeOpacity=".38" />
          <ellipse className="orbit-b" cx="315" cy="250" rx="205" ry="204" strokeOpacity=".25" strokeDasharray="7 13" />
          <ellipse className="orbit-c" cx="315" cy="250" rx="145" ry="114" strokeOpacity=".7" />
          <ellipse cx="315" cy="250" rx="102" ry="102" strokeOpacity=".2" />
        </g>
        <g fill="#56d7ff" filter="url(#glow)"><circle cx="60" cy="250" r="4"/><circle cx="520" cy="155" r="5"/><circle cx="175" cy="414" r="4"/></g>
        <g stroke="#52627f" strokeDasharray="3 5"><path d="M405 195 L520 138"/><path d="M417 250 L545 250"/><path d="M405 305 L520 362"/></g>
      </svg>
      <div className="orbit-core"><ImageMark /><strong>Trenith<br/>Tools</strong></div>
      <div className="proof-node node-one"><span>▣</span><strong>ON YOUR DEVICE</strong><small>Audio, video, PDF & images</small></div>
      <div className="proof-node node-two"><span>◇</span><strong>NO FILE STORAGE</strong><small>Inputs stay in your browser</small></div>
      <div className="proof-node node-three"><span>⌁</span><strong>YOUR AI KEYS</strong><small>Connect provider accounts</small></div>
    </div>
  );
}

function ImageMark() {
  return <span className="mini-mark" aria-hidden="true"><i /><i /><i /></span>;
}
