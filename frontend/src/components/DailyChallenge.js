import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Zap, Clock, Check, X, Flame, Loader2, Award } from "lucide-react";

export default function DailyChallenge({ onComplete }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(-1);
  const [timeLeft, setTimeLeft] = useState(30);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const timerRef = useRef(null);
  const startedAt = useRef(null);

  useEffect(() => { api.get("/daily").then((r) => setData(r.data)); }, []);

  const submit = async (answer) => {
    if (submitting || result) return;
    setSubmitting(true);
    clearInterval(timerRef.current);
    const time_taken = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 30;
    try {
      const res = await api.post("/daily/submit", { answer, time_taken });
      setResult(res.data);
      if (res.data.correct) confetti({ particleCount: 90, spread: 70, origin: { y: 0.4 } });
      if (res.data.bonus_xp > 0) {
        confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 } });
      }
      (res.data.new_badges || []).forEach((b) => toast.success(`🏆 Badge unlocked: ${b.title}`));
      onComplete && onComplete();
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail?.includes("Already")) setData((d) => ({ ...d, done: true }));
    } finally { setSubmitting(false); }
  };

  const begin = () => {
    setStarted(true);
    startedAt.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current); submit(selectedRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  // keep latest selection for timer callback
  const selectedRef = useRef(-1);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => () => clearInterval(timerRef.current), []);

  if (!data) return null;

  const alreadyDone = data.done && !result;

  return (
    <div className="glass rounded-2xl p-6 border-amber-500/30" data-testid="daily-challenge">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" /> 30-Second Daily Spark
        </h3>
        <span className="text-xs font-mono px-2 py-1 rounded-full bg-slate-800 text-slate-400">{data.subject}</span>
      </div>

      {alreadyDone && (
        <div className="text-center py-4" data-testid="daily-done">
          <Flame className="w-10 h-10 text-amber-400 mx-auto mb-2" />
          <p className="font-semibold">You've sparked today! 🔥</p>
          <p className="text-sm text-slate-400 mt-1">Come back tomorrow to keep your streak alive.</p>
        </div>
      )}

      {!alreadyDone && !started && !result && (
        <div className="text-center py-4">
          <p className="text-slate-300 text-sm mb-4">One quick question. 30 seconds. Keep your streak growing.</p>
          <button onClick={begin} data-testid="daily-start-btn"
            className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-500/90 text-slate-900 font-bold transition-colors active:scale-95">
            Start Spark
          </button>
        </div>
      )}

      {started && !result && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className={`w-4 h-4 ${timeLeft <= 10 ? "text-rose-400" : "text-cyan-400"}`} />
            <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className={`h-full transition-all duration-1000 ${timeLeft <= 10 ? "bg-rose-500" : "bg-cyan-500"}`}
                style={{ width: `${(timeLeft / 30) * 100}%` }} />
            </div>
            <span className={`text-sm font-bold font-mono ${timeLeft <= 10 ? "text-rose-400" : "text-cyan-400"}`}>{timeLeft}s</span>
          </div>
          <p className="font-medium mb-3">{data.q}</p>
          <div className="grid gap-2">
            {data.options.map((o, oi) => (
              <button key={oi} onClick={() => setSelected(oi)}
                data-testid={`daily-opt-${oi}`}
                className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                  selected === oi ? "border-amber-500 bg-amber-500/15 text-white"
                    : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600"
                }`}>
                <span className="font-mono text-amber-400 mr-2">{String.fromCharCode(65 + oi)}</span>{o}
              </button>
            ))}
          </div>
          <button onClick={() => submit(selected)} disabled={selected === -1 || submitting}
            data-testid="daily-submit-btn"
            className="w-full mt-4 bg-emerald-500 hover:bg-emerald-600 font-semibold py-2.5 rounded-full transition-colors active:scale-95 disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Lock In Answer"}
          </button>
        </div>
      )}

      {result && (
        <div className="text-center py-4" data-testid="daily-result">
          {result.correct ? (
            <><Check className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <p className="font-display text-xl font-bold text-emerald-400">Correct! +{result.xp} XP</p></>
          ) : (
            <><X className="w-10 h-10 text-rose-400 mx-auto mb-2" />
              <p className="font-display text-xl font-bold text-rose-400">Not quite (+{result.xp} XP)</p>
              <p className="text-sm text-slate-300 mt-1">Answer: <span className="font-semibold">{data.options[result.answer]}</span></p></>
          )}
          <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">{result.explain}</p>
          {result.bonus_xp > 0 && (
            <p className="text-sm text-amber-300 font-bold mt-3 flex items-center justify-center gap-1" data-testid="streak-bonus">
              <Award className="w-4 h-4" /> Unstoppable! +{result.bonus_xp} bonus XP for a 7-day streak
            </p>
          )}
          <p className="text-sm text-amber-400 font-bold mt-3 flex items-center justify-center gap-1">
            <Flame className="w-4 h-4" /> {result.streak}-day streak
          </p>
        </div>
      )}
    </div>
  );
}
