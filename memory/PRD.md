# Edu-Crack — Product Requirements

## Original problem
Add realtime AI one-to-one interview option with camera (self-view) and animated AI person.

## User choices (Feb 2026 iteration)
- LLM: Claude Sonnet 5
- Voice: OpenAI TTS + Whisper STT
- AI person: Stylized SVG avatar with real lip-sync

## Implemented (Feb 2026)
- Backend `/interview/start` and `/interview/answer` now use `anthropic/claude-sonnet-5` via emergentintegrations
- New `AIAvatar` component (`/app/frontend/src/components/AIAvatar.js`) — stylized SVG humanoid ("Aria") with:
  - Blinking eyes, animated brows, cheek highlights
  - WebAudio `AnalyserNode` amplitude-driven mouth (real lip-sync while TTS plays)
  - Glow rings, pulse animation while speaking
- Realtime/Live mode toggle in Interview page:
  - After Aria finishes speaking, mic auto-starts recording
  - Voice → Whisper → auto-submits answer → next question → Aria speaks again
  - Loop continues hands-free for 5 questions
- Camera self-view unchanged (still records the session for replay)
- User can also toggle back to manual voice/text answering

## Files touched
- `/app/backend/server.py` — interview endpoints switched to Claude Sonnet 5
- `/app/frontend/src/pages/Interview.js` — full rewrite for realtime + avatar + live mode
- `/app/frontend/src/components/AIAvatar.js` — new
- `/app/backend/.env` — added `EMERGENT_LLM_KEY`

## Known issues at handoff
- Emergent Universal LLM key is at 0.0 max budget — the interview endpoint returns 500 until user tops up
  (Profile → Manage plan → Universal Key → Add Balance)

## Backlog / P1
- Silence-detection auto-stop for the mic (currently user clicks "Stop & Submit")
- Multiple avatar looks / gender picker
- Real-time feedback bubble while Aria is thinking
