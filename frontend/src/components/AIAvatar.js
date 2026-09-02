import { useEffect, useRef, useState } from "react";

// Realistic AI "human" interviewer:
// - Uses a professional AI-generated portrait as the face
// - Overlays a lip-sync mouth driven by real audio amplitude
// - Adds subtle breathing motion, ambient glow, pulse rings when speaking
const PORTRAITS = {
  aria: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=facearea&facepad=2.4&w=640&h=640&q=80",
  ravi: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=facearea&facepad=2.4&w=640&h=640&q=80",
};

export default function AIAvatar({ audioEl, speaking, persona = "aria" }) {
  const [mouth, setMouth] = useState(0);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

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
        setMouth((prev) => prev * 0.4 + Math.min(1, rms * 7) * 0.6);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (_e) {
      // fake sync
      let t = 0;
      const tick = () => {
        t += 0.22;
        setMouth(Math.abs(Math.sin(t)) * 0.6 + Math.random() * 0.2);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioEl, speaking]);

  const portrait = PORTRAITS[persona] || PORTRAITS.aria;
  const mouthOpen = 8 + mouth * 34;
  const mouthWide = 44 + mouth * 12;

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-900" data-testid="ai-avatar">
      {/* Ambient glow behind head */}
      <div className={`absolute w-72 h-72 rounded-full blur-3xl transition-opacity duration-500 ${
        speaking ? "opacity-80" : "opacity-30"
      }`} style={{ background: "radial-gradient(circle, #6366F1 0%, #06B6D4 45%, transparent 70%)" }} />

      {/* Pulse rings when speaking */}
      {speaking && (
        <>
          <div className="absolute w-56 h-56 rounded-full border-2 border-indigo-400/60"
               style={{ animation: "pulse-ring 1.6s ease-out infinite" }} />
          <div className="absolute w-56 h-56 rounded-full border-2 border-cyan-400/50"
               style={{ animation: "pulse-ring 1.6s ease-out infinite 0.5s" }} />
        </>
      )}

      {/* Portrait with subtle breathing */}
      <div className="relative" style={{
        width: 240, height: 240,
        animation: speaking ? "avatar-talk 0.6s ease-in-out infinite alternate" : "avatar-breath 4s ease-in-out infinite",
      }}>
        <img
          src={portrait}
          alt="AI Interviewer"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover rounded-full ring-4 ring-indigo-500/60 shadow-[0_0_80px_rgba(99,102,241,0.55)]"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />

        {/* Lip-sync mouth overlay */}
        <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 240 240">
          <g style={{ transition: "opacity 0.15s" }} opacity={mouth > 0.04 ? 1 : 0}>
            {/* Inner mouth (dark) */}
            <ellipse
              cx="120"
              cy="168"
              rx={mouthWide / 2}
              ry={mouthOpen / 2}
              fill="#1a0a0a"
            />
            {/* Teeth hint */}
            {mouth > 0.35 && (
              <rect x={120 - mouthWide / 3} y="162" width={mouthWide * 0.66} height="3"
                    fill="#f5eedb" rx="1" opacity="0.85" />
            )}
            {/* Tongue hint */}
            {mouth > 0.45 && (
              <ellipse cx="120" cy={168 + mouthOpen / 4} rx={mouthWide / 3.2} ry={mouthOpen / 5}
                       fill="#c14a5a" opacity="0.7" />
            )}
            {/* Upper lip shadow */}
            <path d={`M ${120 - mouthWide / 2} 166 Q 120 ${162 - mouth * 3} ${120 + mouthWide / 2} 166`}
                  stroke="#8a3a3a" strokeWidth="1.5" fill="none" opacity="0.6" />
          </g>
        </svg>

        {/* Voice equalizer bars near jaw */}
        {speaking && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-1 h-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="w-1 rounded-full bg-cyan-400" style={{
                height: `${20 + Math.max(4, mouth * 100 - i * 8) * 0.6}%`,
                animation: `bar-bounce 0.6s ease-in-out infinite ${i * 0.08}s`,
                boxShadow: "0 0 6px rgba(34,211,238,0.9)",
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Nameplate */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${speaking ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
        <span className="text-white">Aria</span>
        <span className="text-slate-400 text-[10px]">· AI Interviewer</span>
      </div>
    </div>
  );
}
