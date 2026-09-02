import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Trophy, Loader2, Check, X, Crown, Sparkles } from "lucide-react";

export default function Quiz() {
  const [catalog, setCatalog] = useState(null);
  const [subject, setSubject] = useState("Data Structures");
  const [difficulty, setDifficulty] = useState("medium");
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState([]);

  const loadBoard = () => api.get("/leaderboard").then((r) => setBoard(r.data));
  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data)); loadBoard(); }, []);

  const generate = async () => {
    setLoading(true); setResult(null); setQuiz(null);
    try {
      const res = await api.post("/quiz/generate", { subject, difficulty });
      setQuiz(res.data);
      setAnswers(new Array(res.data.questions.length).fill(-1));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to generate quiz");
    } finally { setLoading(false); }
  };

  const submit = async () => {
    if (answers.includes(-1)) { toast.error("Answer all questions first"); return; }
    setLoading(true);
    try {
      const res = await api.post("/quiz/submit", { quiz_id: quiz.quiz_id, answers });
      setResult(res.data);
      loadBoard();
      if (res.data.score === res.data.total) {
        confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
      }
      if (res.data.new_badges?.length) {
        res.data.new_badges.forEach((b) => toast.success(`🏆 Badge unlocked: ${b.title}`));
      }
    } catch (e) {
      toast.error("Submit failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="w-7 h-7 text-amber-400" />
        <h1 className="font-display text-2xl lg:text-3xl font-bold">Quiz Arena</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* setup */}
          {!quiz && !result && (
            <div className="glass rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold mb-4">Generate an AI Quiz</h3>
              <div className="flex flex-wrap gap-3 mb-5">
                <select value={subject} onChange={(e) => setSubject(e.target.value)}
                  data-testid="quiz-subject-select"
                  className="bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 text-slate-200">
                  {(catalog?.subjects || []).map((s) => <option key={s}>{s}</option>)}
                </select>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                  data-testid="quiz-difficulty-select"
                  className="bg-slate-900/70 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 text-slate-200">
                  {["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={generate} disabled={loading} data-testid="generate-quiz-btn"
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 font-semibold px-6 py-3 rounded-full transition-colors active:scale-95 disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "Generating…" : "Generate Quiz"}
              </button>
            </div>
          )}

          {/* quiz */}
          {quiz && !result && (
            <div className="space-y-4" data-testid="quiz-questions">
              {quiz.questions.map((q, qi) => (
                <div key={qi} className="glass rounded-2xl p-5">
                  <p className="font-medium mb-3"><span className="text-indigo-400 font-mono mr-2">{qi + 1}.</span>{q.q}</p>
                  <div className="grid gap-2">
                    {q.options.map((o, oi) => (
                      <button key={oi} onClick={() => { const a = [...answers]; a[qi] = oi; setAnswers(a); }}
                        data-testid={`q${qi}-opt${oi}`}
                        className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                          answers[qi] === oi ? "border-indigo-500 bg-indigo-500/15 text-white"
                            : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600"
                        }`}>
                        <span className="font-mono text-indigo-400 mr-2">{String.fromCharCode(65 + oi)}</span>{o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={submit} disabled={loading} data-testid="submit-quiz-btn"
                className="w-full bg-emerald-500 hover:bg-emerald-600 font-semibold py-3.5 rounded-full transition-colors active:scale-95 disabled:opacity-50">
                {loading ? "Scoring…" : "Submit Quiz"}
              </button>
            </div>
          )}

          {/* result */}
          {result && (
            <div className="space-y-4" data-testid="quiz-result">
              <div className="glass rounded-2xl p-8 text-center">
                <p className="text-xs font-mono uppercase tracking-widest text-indigo-400 mb-2">Your Score</p>
                <p className="font-display text-5xl font-extrabold text-gradient">{result.score}/{result.total}</p>
                <button onClick={() => { setQuiz(null); setResult(null); }}
                  data-testid="new-quiz-btn"
                  className="mt-5 px-6 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-600 font-semibold transition-colors active:scale-95">
                  New Quiz
                </button>
              </div>
              {result.review.map((r, i) => (
                <div key={i} className="glass rounded-2xl p-5">
                  <p className="font-medium mb-3">{i + 1}. {r.q}</p>
                  <div className="space-y-1.5">
                    {r.options.map((o, oi) => {
                      const correct = oi === r.answer;
                      const chosen = oi === r.chosen;
                      return (
                        <div key={oi} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                          correct ? "bg-emerald-500/15 text-emerald-300"
                            : chosen ? "bg-rose-500/15 text-rose-300" : "text-slate-400"
                        }`}>
                          {correct ? <Check className="w-4 h-4" /> : chosen ? <X className="w-4 h-4" /> : <span className="w-4" />}
                          {o}
                        </div>
                      );
                    })}
                  </div>
                  {r.explain && <p className="text-xs text-slate-400 mt-2 border-t border-slate-800 pt-2">{r.explain}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* leaderboard */}
        <div className="glass rounded-2xl p-6 h-fit" data-testid="leaderboard">
          <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" /> Leaderboard
          </h3>
          <div className="space-y-2">
            {board.map((r, i) => (
              <div key={r.user_id} className={`flex items-center gap-3 p-2.5 rounded-xl ${
                r.is_me ? "bg-indigo-500/15 border border-indigo-500/30" : "bg-slate-900/40"
              }`}>
                <span className="w-6 text-center font-bold font-mono text-slate-400">{i + 1}</span>
                {r.picture ? <img src={r.picture} className="w-8 h-8 rounded-full object-cover" alt="" />
                  : <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs font-bold">{r.name[0]}</div>}
                <span className="text-sm flex-1 truncate">{r.name}{r.is_me && " (you)"}</span>
                <span className="text-sm font-bold text-amber-400">{r.xp}</span>
              </div>
            ))}
            {board.length === 0 && <p className="text-sm text-slate-500">Add friends to compete!</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
