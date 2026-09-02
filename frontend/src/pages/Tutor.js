import { useState, useEffect, useRef } from "react";
import { api, streamChat } from "@/lib/api";
import { toast } from "sonner";
import MicButton from "@/components/MicButton";
import {
  Send, Volume2, VolumeX, Loader2, Sparkles, RefreshCw, Repeat2, Search, GraduationCap,
  Pause, Play, Square,
} from "lucide-react";

function renderContent(text) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((p, i) => {
    if (p.startsWith("```")) {
      const body = p.replace(/```[a-zA-Z]*\n?/, "").replace(/```$/, "");
      return (
        <pre key={i}><code>{body}</code></pre>
      );
    }
    return (
      <span key={i} dangerouslySetInnerHTML={{
        __html: p
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\n/g, "<br/>"),
      }} />
    );
  });
}

const MODES = [
  { id: "solve", label: "Solve", icon: Sparkles },
  { id: "explain_back", label: "Explain-It-Back", icon: Repeat2 },
  { id: "blind_spot", label: "Blind-Spot", icon: Search },
];

export default function Tutor() {
  const [catalog, setCatalog] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(() => `s_${Date.now()}`);
  const [subject, setSubject] = useState("General");
  const [language, setLanguage] = useState("en");
  const [teacher, setTeacher] = useState("prof");
  const [mode, setMode] = useState("solve");
  const [speaking, setSpeaking] = useState(null);
  const [paused, setPaused] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const endRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => { api.get("/catalog").then((r) => setCatalog(r.data)); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || streaming) return;
    const q = input.trim();
    setInput("");
    const assistantIdx = messages.length + 1;
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setStreaming(true);
    let acc = "";
    try {
      await streamChat(
        { message: q, session_id: sessionId, subject, language, teacher, mode },
        (delta) => { acc += delta; setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + delta };
          return copy;
        }); },
        () => { setStreaming(false); if (autoRead && acc.trim()) speak(acc, assistantIdx); },
      );
    } catch (e) {
      toast.error("Chat failed");
      setStreaming(false);
    }
  };

  const speak = async (text, idx) => {
    try {
      setSpeaking(idx);
      setPaused(false);
      const voice = catalog?.teachers.find((t) => t.id === teacher)?.voice || "nova";
      const res = await api.post("/tts", { text, voice });
      const url = process.env.REACT_APP_BACKEND_URL + res.data.url;
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setSpeaking(null); setPaused(false); };
      await audio.play();
    } catch (e) {
      toast.error("Voice generation failed");
      setSpeaking(null);
    }
  };

  const newChat = () => {
    setMessages([]);
    setSessionId(`s_${Date.now()}`);
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); try { audioRef.current.currentTime = 0; } catch {} }
    setSpeaking(null); setPaused(false);
  };

  const togglePause = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPaused(false); } else { a.pause(); setPaused(true); }
  };

  const suggestions = [
    "Explain integration by parts with an example",
    "Write a Python function for binary search",
    "What is a truth table? Show AND, OR, NOT",
    "Explain DBMS normalization simply",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] lg:h-[calc(100vh-5rem)]">
      {/* header controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2 mr-auto">
          <GraduationCap className="w-6 h-6 text-indigo-400" /> AI Tutor
        </h1>
        <Select value={subject} onChange={setSubject} testid="subject-select"
          options={["General", ...(catalog?.subjects || [])]} />
        <Select value={language} onChange={setLanguage} testid="language-select"
          options={(catalog?.languages || []).map((l) => l.code)}
          labels={Object.fromEntries((catalog?.languages || []).map((l) => [l.code, l.label]))} />
        <Select value={teacher} onChange={setTeacher} testid="teacher-select"
          options={(catalog?.teachers || []).map((t) => t.id)}
          labels={Object.fromEntries((catalog?.teachers || []).map((t) => [t.id, t.name]))} />
        <button onClick={() => setAutoRead((v) => !v)} data-testid="autoread-toggle"
          title={autoRead ? "Auto read-aloud on" : "Auto read-aloud off"}
          className={`p-2.5 rounded-xl transition-colors ${
            autoRead ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
              : "glass text-slate-400 hover:border-indigo-400/60"
          }`}>
          {autoRead ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <button onClick={newChat} data-testid="new-chat-btn"
          className="p-2.5 rounded-xl glass hover:border-indigo-400/60 transition-colors" title="New chat">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* mode toggle */}
      <div className="flex gap-2 mb-4">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)}
            data-testid={`mode-${m.id}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              mode === m.id ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                : "bg-slate-800/50 text-slate-400 border border-transparent hover:text-white"
            }`}>
            <m.icon className="w-3.5 h-3.5" /> {m.label}
          </button>
        ))}
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto glass rounded-2xl p-5 space-y-5" data-testid="chat-window">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 orb animate-float mb-4" />
            <p className="font-display text-xl font-semibold mb-1">Ask me anything</p>
            <p className="text-slate-500 text-sm mb-6">Any subject, any language — I'll solve it step by step.</p>
            <div className="grid sm:grid-cols-2 gap-2 max-w-lg">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-colors text-slate-300">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              m.role === "user" ? "bg-indigo-500 text-white" : "bg-slate-900/70 border border-slate-800"
            }`}>
              <div className="chat-md text-sm leading-relaxed">
                {m.content ? renderContent(m.content) : <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
                {m.role === "assistant" && streaming && i === messages.length - 1 && m.content && (
                  <span className="blink">▍</span>
                )}
              </div>
              {m.role === "assistant" && m.content && (
                speaking === i ? (
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={togglePause} data-testid={`pause-btn-${i}`}
                      className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                      {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      {paused ? "Resume" : "Pause"}
                    </button>
                    <button onClick={stopSpeaking} data-testid={`stop-btn-${i}`}
                      className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors">
                      <Square className="w-3.5 h-3.5 fill-current" /> Stop
                    </button>
                  </div>
                ) : (
                  <button onClick={() => speak(m.content, i)} data-testid={`speak-btn-${i}`}
                    className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors">
                    <Volume2 className="w-3.5 h-3.5" /> Listen
                  </button>
                )
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div className="mt-4 flex items-end gap-3">
        <MicButton language={language} onTranscript={(t) => setInput((prev) => (prev ? prev + " " : "") + t)} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type your doubt, or tap the mic to speak…"
          data-testid="chat-input"
          rows={1}
          className="flex-1 resize-none bg-slate-900/70 border border-slate-700 rounded-2xl px-4 py-3.5 text-sm outline-none focus:border-indigo-500 transition-colors max-h-32"
        />
        <button onClick={send} disabled={streaming || !input.trim()}
          data-testid="send-btn"
          className="p-3.5 rounded-2xl bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 transition-colors active:scale-95">
          {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

function Select({ value, onChange, options, labels, testid }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
      className="bg-slate-900/70 border border-slate-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-indigo-500 transition-colors max-w-[160px] text-slate-200">
      {options.map((o) => <option key={o} value={o}>{labels ? labels[o] : o}</option>)}
    </select>
  );
}
