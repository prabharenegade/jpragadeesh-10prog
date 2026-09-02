import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Brain, Code2, Trophy, Video, Dna, Sparkles, MessageSquareText,
  ArrowRight, Languages, Mic, Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const features = [
  { icon: MessageSquareText, title: "AI Doubt Solver", desc: "ChatGPT-style tutor that solves any doubt across 100+ subjects, step by step.", color: "text-indigo-400" },
  { icon: Dna, title: "Learning DNA", desc: "Starts at 0. Grows every day as we track what you master and where you slip.", color: "text-cyan-400" },
  { icon: Mic, title: "AI Voice Teacher", desc: "Pick your favourite teacher, hear explanations aloud in your language & accent.", color: "text-emerald-400" },
  { icon: Code2, title: "Code Lab", desc: "LeetCode-style online compiler for Python, JS, C, C++ & Java.", color: "text-amber-400" },
  { icon: Trophy, title: "Quiz Arena", desc: "AI quizzes, badges, XP and a live friends leaderboard.", color: "text-rose-400" },
  { icon: Video, title: "Mock Interview", desc: "1-on-1 AI interviewer with real feedback and scoring.", color: "text-indigo-400" },
];

const brain = [
  "AI Blind Spot Detector", "Explain-It-Back", "AI Time Machine", "Mistake Tracking",
  "Tanglish & Indian Languages", "Friend Competitions",
];

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-bg text-slate-200 relative overflow-hidden">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/20 blur-[120px]" />

      {/* Nav */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 orb" />
          <span className="font-display font-bold text-xl">Edu-Crack</span>
        </div>
        <button
          onClick={() => navigate(user ? "/dashboard" : "/login")}
          data-testid="nav-login-btn"
          className="px-5 py-2.5 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-colors active:scale-95"
        >
          {user ? "Go to Dashboard" : "Sign In"}
        </button>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-10 lg:pt-20 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-mono tracking-widest text-indigo-300 mb-6">
            <Sparkles className="w-3.5 h-3.5" /> AI-POWERED LEARNING FOR EVERY STUDENT
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Your personal <span className="text-gradient">AI professor</span> for every subject.
          </h1>
          <p className="mt-6 text-base lg:text-lg text-slate-400 max-w-xl leading-relaxed">
            Solve any doubt, code, take AI quizzes, ace mock interviews, and watch your
            Learning DNA grow from zero — with a voice teacher who speaks your language,
            even Tanglish.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <button
              onClick={() => navigate(user ? "/dashboard" : "/login")}
              data-testid="hero-start-btn"
              className="group px-7 py-3.5 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold flex items-center gap-2 transition-colors active:scale-95 glow-indigo"
            >
              Start Learning Free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate(user ? "/tutor" : "/login")}
              className="px-7 py-3.5 rounded-full glass hover:border-indigo-400/60 text-white font-semibold flex items-center gap-2 transition-colors"
            >
              <Zap className="w-4 h-4 text-amber-400" /> Try AI Tutor
            </button>
          </div>
          <div className="mt-10 flex flex-wrap gap-2">
            {brain.map((b) => (
              <span key={b} className="text-xs px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700 text-slate-300">
                {b}
              </span>
            ))}
          </div>
        </motion.div>

        {/* 3D-ish orb visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.2 }}
          className="relative h-[380px] lg:h-[460px] flex items-center justify-center"
        >
          <div className="absolute w-72 h-72 rounded-full border border-indigo-500/20 animate-spin-slow" />
          <div className="absolute w-96 h-96 rounded-full border border-cyan-500/10 animate-spin-slow" style={{ animationDirection: "reverse" }} />
          <div className="relative animate-float">
            <div className="w-56 h-56 orb glow-indigo" />
            <Brain className="absolute inset-0 m-auto w-24 h-24 text-white/90" strokeWidth={1.2} />
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full bg-cyan-400 glow-cyan animate-float"
              style={{
                top: `${20 + i * 18}%`, left: `${15 + i * 20}%`,
                animationDelay: `${i * 0.6}s`,
              }}
            />
          ))}
        </motion.div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-indigo-400 mb-3">Everything a student needs</p>
        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-12 max-w-2xl">
          One platform. Every subject. Real, working — not a demo.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glass rounded-2xl p-7 hover-lift"
            >
              <f.icon className={`w-9 h-9 ${f.color} mb-4`} strokeWidth={1.6} />
              <h3 className="font-display text-xl font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-slate-800 py-8 text-center text-sm text-slate-500">
        Edu-Crack © 2026 · Learn. Practice. Crack it.
      </footer>
    </div>
  );
}
