import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { uploadAudio } from "@/lib/api";
import { toast } from "sonner";

// Reusable voice-to-text button. Records mic audio, transcribes via Whisper.
export default function MicButton({ onTranscript, language = "en", className = "", size = "md" }) {
  const [state, setState] = useState("idle"); // idle | recording | transcribing
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        setState("transcribing");
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        try {
          const { text } = await uploadAudio(blob, language);
          if (text) onTranscript(text);
          else toast.info("Didn't catch that, try again");
        } catch {
          toast.error("Transcription failed");
        } finally {
          setState("idle");
        }
      };
      rec.start();
      recorderRef.current = rec;
      setState("recording");
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stop = () => recorderRef.current?.stop();

  const dims = size === "sm" ? "w-9 h-9" : "w-11 h-11";

  return (
    <button
      type="button"
      data-testid="mic-btn"
      onClick={state === "recording" ? stop : state === "idle" ? start : undefined}
      className={`${dims} shrink-0 rounded-2xl flex items-center justify-center transition-colors active:scale-95 ${
        state === "recording"
          ? "bg-rose-500 text-white animate-pulse"
          : "glass hover:border-indigo-400/60 text-slate-300"
      } ${className}`}
      title={state === "recording" ? "Stop & transcribe" : "Speak your answer"}
    >
      {state === "transcribing" ? <Loader2 className="w-5 h-5 animate-spin" />
        : state === "recording" ? <Square className="w-4 h-4 fill-current" />
        : <Mic className="w-5 h-5" />}
    </button>
  );
}
