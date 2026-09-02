import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useAuth } from "@/context/AuthContext";
import {
  Swords, Users, Clock, Crown, Loader2, Copy, Play, Trophy, Zap, LogOut,
} from "lucide-react";

const QUESTION_TIME = 15;

export default function Battle() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [subject, setSubject] = useState("Data Structures");
  const [difficulty, setDifficulty] = useState("medium");
  const [joinCode, setJoinCode] = useState("");
  const [code, setCode] = useState(null);
  const [state, setState] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(-1);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [myFinished, setMyFinished] = useState(false);
  const [busy, setBusy] = useState(false);

  const qStartRef = useRef(0);
  const qIndexRef = useRef(0);
  const selectedRef = useRef(-1);
  const timerRef = useRef(null);
  const answeringRef = useRef(false);

  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data)); }, []);
  useEffect(() => { qIndexRef.current = qIndex; }, [qIndex]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // poll state
  useEffect(() => {
    if (!code) return;
    let alive = true;
    let id;
    const poll = async () => {
      try {
        const r = await api.get(`/battle/${code}`);
        if (!alive) return;
        setState(r.data);
        if (r.data.status === "finished") clearInterval(id);
      } catch {}
    };
    poll();
    id = setInterval(poll, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [code]);

  // when active, load questions & begin
  useEffect(() => {
    if (state?.status === "active" && !questions) {
      api.get(`/battle/${code}/questions`).then((r) => {
        setQuestions(r.data.questions);
        setQIndex(0); setSelected(-1);
        startTimer();
      }).catch(() => {});
    }
  }, [state, questions, code]); // eslint-disable-line

  useEffect(() => () => clearInterval(timerRef.current), []);

  const startTimer = () => {
    clearInterval(timerRef.current);
    qStartRef.current = Date.now();
    setTimeLeft(QUESTION_TIME);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current); submitAnswer(selectedRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const submitAnswer = async (answer) => {
    if (answeringRef.current) return;
    answeringRef.current = true;
    clearInterval(timerRef.current);
    const idx = qIndexRef.current;
    const time_ms = Math.min(QUESTION_TIME * 1000, Date.now() - qStartRef.current);
    try {
      await api.post("/battle/answer", { code, q_index: idx, answer, time_ms });
    } catch {}
    const next = idx + 1;
    if (next >= (questions?.length || 5)) {
      setMyFinished(true);
    } else {
      setQIndex(next); setSelected(-1);
      setTimeout(() => { startTimer(); answeringRef.current = false; }, 300);
      return;
    }
    answeringRef.current = false;
  };

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post("/battle/create", { subject, difficulty });
      setCode(r.data.code);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to create"); }
    finally { setBusy(false); }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const r = await api.post("/battle/join", { code: joinCode.trim().toUpperCase() });
      setCode(r.data.code);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to join"); }
    finally { setBusy(false); }
  };

  const start = async () => {
    try { await api.post("/battle/start", { code }); } catch (e) { toast.error("Failed to start"); }
  };

  const leave = () => {
    clearInterval(timerRef.current);
    setCode(null); setState(null); setQuestions(null); setQIndex(0);
    setSelected(-1); setMyFinished(false); answeringRef.current = false;
  };

  // celebrate win on finish
  const finishedRef = useRef(false);
  useEffect(() => {
    if (state?.status === "finished" && !finishedRef.current) {
      finishedRef.current = true;
      const winner = state.players[0];
      if (winner?.user_id === user?.user_id) confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 } });
    }
    if (state?.status !== "finished") finishedRef.current = false;
  }, [state, user]);

  const copyCode = () => { navigator.clipboard.writeText(code); toast.success("Code copied!"); };

  // ---------- RENDER ----------
  if (!code) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" /> Create a Battle
            </h3>
            <div className="space-y-3">
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                data-testid="battle-subject-select"
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 text-slate-200">
                {(catalog?.subjects || []).map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                data-testid="battle-difficulty-select"
                className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 text-slate-200">
                {["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}
              </select>
              <button onClick={create} disabled={busy} data-testid="create-battle-btn"
                className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 font-semibold py-3 rounded-full transition-colors active:scale-95 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />} Create Battle Room
              </button>
            </div>
          </div>
          <div className="glass rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" /> Join a Battle
            </h3>
            <p className="text-sm text-slate-400 mb-3">Got a room code from a friend? Enter it below.</p>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              data-testid="battle-join-input" placeholder="ROOM CODE"
              className="w-full bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 text-slate-200 font-mono tracking-widest uppercase mb-3" />
            <button onClick={join} disabled={busy} data-testid="join-battle-btn"
              className="w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-semibold py-3 rounded-full transition-colors active:scale-95 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  const standings = state?.players || [];

  return (
    <div className="space-y-6">
      <Header />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Lobby */}
          {state?.status === "waiting" && (
            <div className="glass rounded-2xl p-8 text-center" data-testid="battle-lobby">
              <p className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-2">Share this code</p>
              <div className="flex items-center justify-center gap-3 mb-6">
                <span className="font-display text-4xl font-extrabold tracking-[0.3em] text-gradient" data-testid="battle-code">{code}</span>
                <button onClick={copyCode} className="p-2 rounded-lg glass hover:border-indigo-400/60 transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-slate-400 mb-6">{state.subject} · waiting for players to join…</p>
              {state.is_host ? (
                <button onClick={start} disabled={standings.length < 1} data-testid="start-battle-btn"
                  className="px-8 py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 font-semibold transition-colors active:scale-95">
                  Start Battle ({standings.length} in room)
                </button>
              ) : (
                <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Waiting for host to start…
                </p>
              )}
            </div>
          )}

          {/* Playing */}
          {state?.status === "active" && questions && !myFinished && (
            <div className="glass rounded-2xl p-6" data-testid="battle-play">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-indigo-400">Q{qIndex + 1}/{questions.length}</span>
                <Clock className={`w-4 h-4 ${timeLeft <= 5 ? "text-rose-400" : "text-cyan-400"}`} />
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${timeLeft <= 5 ? "bg-rose-500" : "bg-cyan-500"}`}
                    style={{ width: `${(timeLeft / QUESTION_TIME) * 100}%` }} />
                </div>
                <span className={`text-sm font-bold font-mono ${timeLeft <= 5 ? "text-rose-400" : "text-cyan-400"}`}>{timeLeft}s</span>
              </div>
              <p className="font-medium text-lg mb-4">{questions[qIndex].q}</p>
              <div className="grid gap-2">
                {questions[qIndex].options.map((o, oi) => (
                  <button key={oi} onClick={() => { setSelected(oi); submitAnswer(oi); }}
                    data-testid={`battle-opt-${oi}`}
                    disabled={selected !== -1}
                    className={`text-left text-sm px-4 py-3 rounded-xl border transition-colors ${
                      selected === oi ? "border-indigo-500 bg-indigo-500/20 text-white"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-indigo-500/40"
                    } disabled:opacity-70`}>
                    <span className="font-mono text-indigo-400 mr-2">{String.fromCharCode(65 + oi)}</span>{o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Finished mine, waiting others */}
          {state?.status === "active" && myFinished && (
            <div className="glass rounded-2xl p-8 text-center" data-testid="battle-waiting-others">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="font-display text-lg font-semibold">You finished! ⚡</p>
              <p className="text-sm text-slate-400 mt-1">Waiting for other players to complete…</p>
            </div>
          )}

          {/* Final results */}
          {state?.status === "finished" && (
            <div className="glass rounded-2xl p-8 text-center" data-testid="battle-results">
              <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-1">Winner</p>
              <p className="font-display text-3xl font-extrabold text-gradient mb-1">{standings[0]?.name}</p>
              <p className="text-sm text-slate-400 mb-6">{standings[0]?.score}/{state.num_questions} correct in {(standings[0]?.total_ms / 1000).toFixed(1)}s</p>
              <button onClick={leave} data-testid="battle-again-btn"
                className="px-6 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-600 font-semibold transition-colors active:scale-95">
                Play Again
              </button>
            </div>
          )}
        </div>

        {/* Live standings */}
        <div className="glass rounded-2xl p-6 h-fit" data-testid="battle-standings">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" /> Live Standings
            </h3>
            <button onClick={leave} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> Leave
            </button>
          </div>
          <div className="space-y-2">
            {standings.map((p, i) => (
              <div key={p.user_id} className={`flex items-center gap-3 p-2.5 rounded-xl ${
                p.user_id === user?.user_id ? "bg-indigo-500/15 border border-indigo-500/30" : "bg-slate-900/40"
              }`} data-testid={`standing-${i}`}>
                <span className="w-5 text-center font-bold font-mono text-slate-400">{i + 1}</span>
                {p.picture ? <img src={p.picture} className="w-8 h-8 rounded-full object-cover" alt="" />
                  : <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs font-bold">{p.name[0]}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{p.name}{p.user_id === user?.user_id && " (you)"}</p>
                  <p className="text-[11px] text-slate-500">
                    {p.finished ? `done · ${(p.total_ms / 1000).toFixed(1)}s` : `${p.answered} answered`}
                  </p>
                </div>
                <span className="text-sm font-bold text-amber-400">{p.score}</span>
              </div>
            ))}
            {standings.length === 0 && <p className="text-sm text-slate-500">No players yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <Swords className="w-7 h-7 text-rose-400" />
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold">Group Battle</h1>
        <p className="text-sm text-slate-500">Race friends head-to-head — fastest correct answers win.</p>
      </div>
    </div>
  );
}
