# Lecture Notes — One-Page Pitch

**Did the class actually get it?** Every professor ends a lecture with "any
questions?" — and gets silence. Silence doesn't mean understanding: most of the
class can be lost while the lecture moves on, and the professor has no feedback
until the exam.

## The solution

**Lecture Notes** is a lecture-hall companion that turns one spoken lecture into
a complete feedback loop — with zero extra effort for the professor:

- **Record & transcribe live.** The professor presses one button. Every word is
  transcribed in real time — Hindi and English mixed freely, as real classrooms
  actually speak — and live notes build themselves while the lecture happens.
- **Who said what.** When class ends, a second speech pass re-listens to the
  whole recording and produces a timestamped, speaker-labelled, searchable
  transcript.
- **Insights in seconds.** A 105-billion-parameter open-weights LLM reads every
  word and distils the lecture into a crisp summary, exam-ready key points and
  the topics covered.
- **Class Pulse — the feedback loop.** A clarity score, a lecture map showing
  exactly where students likely got lost (with the actual confusing moments
  quoted from the transcript), speaking-pace analysis, cognitive-overload
  windows — and a **spoken briefing for the professor in their own language**
  (10 Indian languages, natural neural voices), so the next lecture starts
  better.

## Why it's different

- **Built for Indian classrooms.** Live multilingual transcription (Hindi +
  English code-switching), Indian-language voices, and a professor-first UI —
  not an English-only meeting-notes tool.
- **Honest analytics.** Pace, pauses, time-per-topic and the clarity score are
  computed deterministically from real transcript timings; the LLM only makes
  judgement calls — and every claim is validated against the transcript before
  it is shown.
- **Private and simple.** Runs as a plain web app; API keys never leave the
  server, recordings stay local, one button starts everything.

## How it works

Browser mic → same-origin WebSocket proxy → **Gnani Prisma v3.0** realtime STT
for live captions; **Gnani Batch** with diarization for the final transcript;
an **open-weights 105B conversational LLM** (OpenAI-compatible) for insights and
Class Pulse analysis; **Gnani Timbre v3.0** TTS for the spoken briefing.
Next.js 16 · React 19 · Prisma + PostgreSQL · Tailwind v4.

## See it

- **Demo video (3:14, real lecture):** [`docs/shots/demo-final.mp4`](shots/demo-final.mp4)
- **Screenshots + walkthrough:** see the *Demo* section in the
  [README](../README.md#demo)
- **Detailed 10-page project report:** [`Lecture-Notes-Project-Report.pdf`](Lecture-Notes-Project-Report.pdf)

*Working build, tested end-to-end: 36 tests (unit, API and a headless-browser
E2E that records a real lecture through a simulated microphone).*
