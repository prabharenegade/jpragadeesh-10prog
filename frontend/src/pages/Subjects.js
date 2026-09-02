import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { BookOpen, ChevronRight, Search } from "lucide-react";

export default function Subjects() {
  const [catalog, setCatalog] = useState({});
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();

  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data.catalog)); }, []);

  const ask = (subj) => navigate("/tutor");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-7 h-7 text-emerald-400" />
        <h1 className="font-display text-2xl lg:text-3xl font-bold">Subject Library</h1>
      </div>
      <p className="text-slate-400 text-sm max-w-2xl">
        Every subject below is stored in the backend and fully supported by the AI Tutor —
        from high-level maths to core CSE, engineering, medical, law and emerging tech.
      </p>

      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={filter} onChange={(e) => setFilter(e.target.value.toLowerCase())}
          data-testid="subject-filter"
          placeholder="Filter subjects…"
          className="w-full bg-slate-900/70 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-indigo-500 text-slate-200" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {Object.entries(catalog).map(([cat, subs]) => {
          const filtered = subs.filter((s) => s.toLowerCase().includes(filter));
          if (filtered.length === 0) return null;
          return (
            <div key={cat} className="glass rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold mb-4 text-indigo-300">{cat}</h3>
              <div className="flex flex-wrap gap-2">
                {filtered.map((s) => (
                  <button key={s} onClick={() => ask(s)}
                    className="group flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 text-slate-300 transition-colors">
                    {s}
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
