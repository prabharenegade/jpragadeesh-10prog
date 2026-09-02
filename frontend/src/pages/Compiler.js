import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Play, Loader2, Terminal, Code2, FileCode } from "lucide-react";

const LANGS = [
  { id: "python", label: "Python", sample: "print('Hello Edu-Crack')\nfor i in range(3):\n    print('square', i*i)" },
  { id: "javascript", label: "JavaScript", sample: "console.log('Hello Edu-Crack');\n[1,2,3].forEach(n => console.log(n*n));" },
  { id: "c", label: "C", sample: "#include <stdio.h>\nint main(){ printf(\"Hello Edu-Crack\\n\"); return 0; }" },
  { id: "cpp", label: "C++", sample: "#include <iostream>\nusing namespace std;\nint main(){ cout << \"Hello Edu-Crack\" << endl; return 0; }" },
  { id: "java", label: "Java", sample: "public class Main {\n  public static void main(String[] a){\n    System.out.println(\"Hello Edu-Crack\");\n  }\n}" },
];

export default function Compiler() {
  const [lang, setLang] = useState("python");
  const [code, setCode] = useState(LANGS[0].sample);
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [problems, setProblems] = useState([]);

  useEffect(() => { api.get("/compile/problems").then((r) => setProblems(r.data)); }, []);

  const changeLang = (id) => {
    setLang(id);
    setCode(LANGS.find((l) => l.id === id).sample);
    setOutput("");
  };

  const run = async () => {
    setRunning(true);
    setOutput("");
    try {
      const res = await api.post("/compile", { language: lang, code, stdin });
      setOutput(res.data.output);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Execution failed");
      setOutput("Error: " + (e.response?.data?.detail || "failed"));
    } finally {
      setRunning(false);
    }
  };

  const loadProblem = (p) => {
    const starter = p.starter[lang] || p.starter.python;
    if (p.starter[lang]) setCode(starter);
    else { setLang("python"); setCode(p.starter.python); }
    setOutput("");
    toast.info(`Loaded: ${p.title}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Code2 className="w-7 h-7 text-amber-400" />
        <h1 className="font-display text-2xl lg:text-3xl font-bold">Code Lab</h1>
      </div>

      {/* problems */}
      <div className="flex flex-wrap gap-3">
        {problems.map((p) => (
          <button key={p.id} onClick={() => loadProblem(p)}
            data-testid={`problem-${p.id}`}
            className="glass rounded-xl px-4 py-3 text-left hover-lift">
            <div className="flex items-center gap-2 mb-1">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold">{p.title}</span>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${
              p.difficulty === "Easy" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
            }`}>{p.difficulty}</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* editor */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/40">
            {LANGS.map((l) => (
              <button key={l.id} onClick={() => changeLang(l.id)}
                data-testid={`lang-${l.id}`}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  lang === l.id ? "bg-indigo-500/20 text-indigo-300" : "text-slate-400 hover:text-white"
                }`}>{l.label}</button>
            ))}
            <button onClick={run} disabled={running} data-testid="run-btn"
              className="ml-auto flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors active:scale-95 disabled:opacity-50">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="code-editor"
            spellCheck={false}
            className="w-full h-80 bg-transparent p-4 font-mono text-sm outline-none resize-none text-emerald-200 leading-relaxed"
          />
        </div>

        {/* output + stdin */}
        <div className="space-y-5">
          <div className="glass rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/40">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold">Output</span>
            </div>
            <pre data-testid="output-console"
              className="p-4 font-mono text-sm h-56 overflow-auto whitespace-pre-wrap text-slate-200">
              {running ? "Running…" : (output || "// Output will appear here")}
            </pre>
          </div>
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/40 text-sm font-semibold">Stdin (input)</div>
            <textarea value={stdin} onChange={(e) => setStdin(e.target.value)}
              data-testid="stdin-input"
              placeholder="Program input…"
              className="w-full h-20 bg-transparent p-3 font-mono text-sm outline-none resize-none text-slate-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
