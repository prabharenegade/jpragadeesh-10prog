import { useEffect, useRef, useState } from "react";

// Stylized 3D-ish AI interviewer avatar with real lip-sync driven by audio amplitude.
// Pass the currently-playing <audio> element via `audioEl` and set `speaking` when it plays.
export default function AIAvatar({ audioEl, speaking }) {
  const [mouth, setMouth] = useState(0); // 0..1
  const [blink, setBlink] = useState(false);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  // Blink loop
  useEffect(() => {
    let alive = true;
    const loop = async () => {
      while (alive) {
        await new Promise((r) => setTimeout(r, 2200 + Math.random() * 2500));
        if (!alive) break;
        setBlink(true);
        await new Promise((r) => setTimeout(r, 140));
        setBlink(false);
      }
    };
    loop();
    return () => { alive = false; };
  }, []);

  // Lip sync — analyse audio amplitude
  useEffect(() => {
    if (!audioEl || !speaking) {
      setMouth(0);
      cancelAnimationFrame(rafRef.current);
      return;
    }
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      // (re)wire source
      if (sourceRef.current?._el !== audioEl) {
    try { sourceRef.current?.disconnect(); } catch (_e) { /* noop */ }
        const src = ctx.createMediaElementSource(audioEl);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        src._el = audioEl;
        sourceRef.current = src;
        analyserRef.current = analyser;
      }
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      const tick = () => {
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Amplify + clamp
        setMouth(Math.min(1, rms * 6));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // fallback fake lip-sync
      let t = 0;
      const tick = () => {
        t += 0.18;
        setMouth((Math.sin(t) * 0.4 + 0.4 + Math.random() * 0.15));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioEl, speaking]);

  const mouthH = 4 + mouth * 22;
  const mouthW = 26 + mouth * 8;

  return (
    <div className="relative w-full h-full flex items-center justify-center" data-testid="ai-avatar">
      {/* Ambient glow rings */}
      <div className={`absolute w-56 h-56 rounded-full blur-3xl transition-opacity ${
        speaking ? "opacity-70" : "opacity-30"
      }`} style={{ background: "radial-gradient(circle, #6366F1 0%, transparent 65%)" }} />
      {speaking && (
        <>
          <div className="absolute w-40 h-40 rounded-full border-2 border-indigo-400/70"
               style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
          <div className="absolute w-40 h-40 rounded-full border-2 border-cyan-400/60"
               style={{ animation: "pulse-ring 1.6s ease-out infinite 0.4s" }} />
        </>
      )}

      <svg viewBox="0 0 200 240" className="relative w-56 h-64 drop-shadow-2xl" style={{
        filter: speaking ? "drop-shadow(0 0 24px rgba(129,140,248,0.55))" : "drop-shadow(0 0 12px rgba(99,102,241,0.35))",
      }}>
        {/* Neck */}
        <rect x="82" y="150" width="36" height="30" rx="12"
              fill="url(#neckG)" />
        {/* Shoulders / body */}
        <path d="M 30 240 Q 30 180 100 178 Q 170 180 170 240 Z" fill="url(#bodyG)" />
        <path d="M 100 178 L 100 240" stroke="#334155" strokeWidth="1.5" opacity="0.7" />

        {/* Head */}
        <ellipse cx="100" cy="95" rx="52" ry="60" fill="url(#skinG)" stroke="#818CF8" strokeWidth="1.5" />
        {/* Hair top */}
        <path d="M 48 90 Q 60 34 100 34 Q 140 34 152 92 Q 138 62 100 60 Q 62 62 48 90 Z"
              fill="url(#hairG)" />
        {/* Cheek highlight */}
        <ellipse cx="70" cy="112" rx="10" ry="6" fill="#F472B6" opacity="0.18" />
        <ellipse cx="130" cy="112" rx="10" ry="6" fill="#F472B6" opacity="0.18" />

        {/* Eyes */}
        <g>
          <ellipse cx="78" cy="94" rx="8" ry={blink ? 0.6 : 7} fill="#0B0F19" />
          <ellipse cx="122" cy="94" rx="8" ry={blink ? 0.6 : 7} fill="#0B0F19" />
          {!blink && (
            <>
              <circle cx="80" cy="92" r="2" fill="#fff" />
              <circle cx="124" cy="92" r="2" fill="#fff" />
              <circle cx="78" cy="96" r="1.2" fill="#22D3EE" opacity="0.8" />
              <circle cx="122" cy="96" r="1.2" fill="#22D3EE" opacity="0.8" />
            </>
          )}
        </g>
        {/* Brows */}
        <path d="M 68 78 Q 78 74 88 78" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M 112 78 Q 122 74 132 78" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />

        {/* Nose */}
        <path d="M 100 100 Q 96 116 100 122 Q 104 116 100 100" fill="#C4B5FD" opacity="0.6" />

        {/* Mouth — animated */}
        <g transform={`translate(100 ${138 - mouthH / 2})`}>
          <ellipse cx="0" cy={mouthH / 2} rx={mouthW / 2} ry={mouthH / 2}
                   fill="#0B0F19" stroke="#F43F5E" strokeWidth="1.5" />
          {mouth > 0.15 && (
            <ellipse cx="0" cy={mouthH * 0.7} rx={mouthW / 3} ry={mouthH * 0.3}
                     fill="#F43F5E" opacity="0.65" />
          )}
        </g>

        {/* Tech circuit accent on body */}
        <circle cx="100" cy="215" r="8" fill="none" stroke="#22D3EE" strokeWidth="1.5" opacity={speaking ? 1 : 0.5} />
        <circle cx="100" cy="215" r="3" fill="#22D3EE" opacity={speaking ? 1 : 0.4}>
          {speaking && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" repeatCount="indefinite" />}
        </circle>

        <defs>
          <linearGradient id="skinG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#FCD9C6" />
            <stop offset="1" stopColor="#E8B49A" />
          </linearGradient>
          <linearGradient id="hairG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#312E81" />
            <stop offset="1" stopColor="#4C1D95" />
          </linearGradient>
          <linearGradient id="neckG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#E8B49A" />
            <stop offset="1" stopColor="#D19A80" />
          </linearGradient>
          <linearGradient id="bodyG" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4338CA" />
            <stop offset="1" stopColor="#1E1B4B" />
          </linearGradient>
        </defs>
      </svg>

      {/* Status label */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-black/50 px-2 py-1 rounded">
        {speaking ? <span className="text-indigo-300">● Speaking</span> : "● Listening"}
      </div>
    </div>
  );
}
