import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import DailyChallenge from "@/components/DailyChallenge";
import {
  Flame, TrendingUp, AlertTriangle, Sparkles, Award, Target, Brain, RotateCcw,
} from "lucide-react";

function Ring({ value, label, color }) {
  const r = 34, c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="86" height="86" className="-rotate-90">
        <circle cx="43" cy="43" r={r} stroke="#1E293B" strokeWidth="7" fill="none" />
        <circle cx="43" cy="43" r={r} stroke={color} strokeWidth="7" fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <span className="text-xs text-slate-400 text-center max-w-[90px] truncate">{label}</span>
      <span className="text-sm font-bold -mt-1" style={{ color }}>{value}%</span>
    </div>
  );
}

const COLORS = ["#6366F1", "#06B6D4", "#10B981", "#F59E0B", "#F43F5E", "#818CF8"];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dna, setDna] = useState(null);
  const [badges, setBadges] = useState([]);
  const [mistakes, setMistakes] = useState([]);

  const load = async () => {
    const [d, b, m] = await Promise.all([
      api.get("/dna"), api.get("/badges"), api.get("/mistakes"),
    ]);
    setDna(d.data); setBadges(b.data); setMistakes(m.data);
  };
  useEffect(() => { load(); }, []);

  if (!dna) return <div className="text-slate-400">Loading your Learning DNA…</div>;

  const tm = dna.time_machine;
  const empty = dna.subjects.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-indigo-400 mb-2">
          Hey {user?.name?.split(" ")[0]}, this is your
        </p>
        <h1 className="font-display text-3xl lg:text-4xl font-bold flex items-center gap-3">
          <Brain className="w-8 h-8 text-indigo-400" /> Learning DNA
        </h1>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Sparkles} color="text-indigo-400" label="Total XP" value={dna.total_xp} testid="stat-xp" />
        <Stat icon={Flame} color="text-amber-400" label="Day Streak" value={dna.streak} testid="stat-streak" />
        <Stat icon={Target} color="text-cyan-400" label="Subjects Touched" value={dna.subjects.length} />
        <Stat icon={Award} color="text-emerald-400" label="Badges" value={badges.filter(b => b.earned).length} />
      </div>

      <DailyChallenge onComplete={load} />

      {empty && (
        <div className="glass rounded-2xl p-8 text-center">
          <div className="w-12 h-12 orb mx-auto mb-4 animate-float" />
          <h3 className="font-display text-xl font-semibold mb-2">Your DNA starts at 0.</h3>
          <p className="text-slate-400 text-sm mb-5 max-w-md mx-auto">
            Ask the AI Tutor a doubt or take a quiz — watch your mastery rings grow day by day.
          </p>
          <button onClick={() => navigate("/tutor")}
            data-testid="empty-start-btn"
            className="px-6 py-3 rounded-full bg-indigo-500 hover:bg-indigo-600 font-semibold transition-colors active:scale-95">
            Ask your first doubt
          </button>
        </div>
      )}

      {!empty && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* mastery rings */}
          <div className="lg:col-span-2 glass rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-5">Subject Mastery</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-5" data-testid="mastery-grid">
              {dna.subjects.slice(0, 8).map((s, i) => (
                <Ring key={s.subject} value={s.level} label={s.subject} color={COLORS[i % COLORS.length]} />
              ))}
            </div>
          </div>

          {/* time machine */}
          <div className="glass rounded-2xl p-6" data-testid="time-machine">
            <h3 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-cyan-400" /> AI Time Machine
            </h3>
            <p className="text-xs text-slate-500 mb-4">How your understanding evolves.</p>
            <TMRow color="text-emerald-400" icon={TrendingUp} label="Strong" items={tm.strong} />
            <TMRow color="text-cyan-400" icon={Sparkles} label="Improving" items={tm.improving} />
            <TMRow color="text-amber-400" icon={AlertTriangle} label="Needs revision" items={tm.needs_revision} />
            <TMRow color="text-rose-400" icon={RotateCcw} label="Repeated mistakes" items={tm.repeated_mistakes} />
          </div>
        </div>
      )}

      {/* badges */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold mb-5 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-400" /> Achievements
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {badges.map((b) => (
            <div key={b.code}
              className={`rounded-xl p-4 border text-center transition-colors ${
                b.earned ? "border-amber-500/40 bg-amber-500/10" : "border-slate-800 bg-slate-900/40 opacity-50"
              }`}>
              <Award className={`w-7 h-7 mx-auto mb-2 ${b.earned ? "text-amber-400" : "text-slate-600"}`} />
              <p className="text-sm font-semibold">{b.title}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-tight">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* mistakes */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-400" /> Mistake Tracking
        </h3>
        {mistakes.length === 0 ? (
          <p className="text-sm text-slate-500">No mistakes logged yet. Keep practising!</p>
        ) : (
          <div className="space-y-2" data-testid="mistake-list">
            {mistakes.slice(0, 8).map((m, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-mono whitespace-nowrap">{m.subject}</span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{m.topic}</p>
                  <p className="text-xs text-slate-500">{m.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, color, label, value, testid }) {
  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 hover-lift" data-testid={testid}>
      <Icon className={`w-6 h-6 ${color} mb-3`} />
      <p className="text-2xl font-bold font-display">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </motion.div>
  );
}

function TMRow({ color, icon: Icon, label, items }) {
  return (
    <div className="mb-3">
      <div className={`flex items-center gap-2 text-sm font-medium ${color} mb-1.5`}>
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.length ? items.map((t) => (
          <span key={t} className="text-[11px] px-2 py-1 rounded-md bg-slate-800/70 text-slate-300">{t}</span>
        )) : <span className="text-xs text-slate-600">—</span>}
      </div>
    </div>
  );
}
