# Lecture Notes App

A voice transcription application for professors to record and organise lecture
notes. It captures lecture audio in the browser, transcribes it **live** with
Gnani (Vachana) STT, then produces a **speaker-labelled transcript**,
AI-generated **insights** (summary, key points, topics) and a **Class Pulse**
report that shows where students likely got lost. Built with Next.js 16,
Gnani Prisma, Sarvam 105B and PostgreSQL.

## What’s new in this build

- **Gnani Prisma v3.0** now handles all speech-to-text — live captions over a
  same-origin WebSocket proxy, and a diarized batch pass for the final
  transcript.
- **Local-first runtime** — AWS S3, Secrets Manager, SQS and Lambda are gone;
  audio is stored on disk and configuration comes from `.env`.
- **Warm editorial UI** — paper-white canvas, stone sidebar, Instrument Serif
  display type and a burnt-orange accent, with a recent-lecture rail and a
  dedicated live-notes panel.
- **Sarvam 105B** is the language engine for both lecture insights and the
  Class Pulse analysis/briefing.

## Features

- **Real-time recording** with live transcription via Gnani Realtime
- **Speaker diarization** — a Gnani Batch pass labels who said what
- **End words** — control transcript line breaks: a line ends only when the
  speaker says a configured word ("done", "next question", …)
- **AI insights** — summary, key points and topics per recording
- **Class Pulse** — a clarity score, a lecture map, likely confusion points,
  speaking-pace analysis and a spoken, multilingual briefing
- **Calendar + search** — organise recordings by date and title
- **Transcript tools** — view, edit, copy and export
- **Local-first storage** — recorded audio is written to disk, data lives in
  PostgreSQL

## Design

The interface is a warm editorial light theme built for a lecture hall:
paper-white canvas, a warm stone sidebar, Instrument Serif display type and a
burnt-orange accent. The sidebar keeps recent lectures and a compact calendar
within reach; during recording, live notes sit in a dedicated right rail so the
transcript never competes with the record control.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling / UI | Tailwind CSS v4, shadcn/ui, lucide-react, framer-motion |
| Data | Prisma ORM + `@prisma/adapter-pg` → PostgreSQL |
| STT | Gnani Vachana — Prisma v3.0 (Realtime + Batch with diarization) |
| LLM | Sarvam 105B (`sarvam-105b-conversations`, OpenAI-compatible chat completions) |
| TTS | Gnani Timbre v3.0 (`timbre-v3.0`, one curated voice per language) |
| Tooling | Bun, Playwright, `ws` (WebSocket proxy) |

## Models

Defined in `lib/gnani.ts` and `lib/sarvam.ts`.

| Purpose | Model |
| --- | --- |
| Live streaming transcription | Gnani `prisma-v3.0` (Realtime WebSocket) |
| Batch transcription + speaker diarization | Gnani `prisma-v3.0` (Batch API) |
| Insights, Class Pulse analysis and briefing | Sarvam `sarvam-105b-conversations` |
| Class Pulse read-aloud | Gnani `timbre-v3.0` (Vasudha, Shivani, Lakshmi, Riyaa, Chetana, Tarika, Kalpana, Yashraj by language) |

Both API keys are used **only on the server**. The browser talks to a same-origin
WebSocket proxy (`/api/stt/stream`) which attaches the Gnani key, so the key is
never exposed to the client. Sarvam is called server-side for insights and Class
Pulse.

> The app runs through `server.mjs` (not plain `next dev`) because that server
> also hosts the Gnani WebSocket proxy. `bun run dev` and `bun run start` already
> use it.

### Gnani specifics

- **Live**: 16 kHz mono PCM, 1024-byte frames at 32 ms cadence, proxied to
  `wss://api.vachana.ai/stt/v3/stream` with `model=prisma-v3.0`. The default
  language hint is `en-IN,hi-IN`: the proxy sends `en-IN` as the primary locale
  plus `multi_lang_codes=en-IN,hi-IN`. Sessions reconnect before Gnani's
  15-minute cap.
- **Final transcript**: Gnani Batch with `with_diarization: true`. Uploads up to
  10 MB go direct; larger recordings use Gnani's presigned upload.
- **Rate limiting**: this account allows one active request at a time, so `429`
  responses are retried with exponential backoff.

## Getting Started

### Prerequisites

- Node.js 18+ and **Bun**
- **PostgreSQL** (local)
- A **Gnani** API key ([docs.gnani.ai](https://docs.gnani.ai/))
- A **Sarvam AI** API key ([dashboard.sarvam.ai](https://dashboard.sarvam.ai/)) for
  insights and Class Pulse

### Installation

```bash
git clone https://github.com/DevAgarwal2/iot-proj.git
cd iot-proj
bun install
```

Start a local PostgreSQL:

```bash
docker run -d --name lecture-pg \
  -e POSTGRES_USER=lecture -e POSTGRES_PASSWORD=lecture -e POSTGRES_DB=lecturenotes \
  -p 5432:5432 postgres:16
```

Configure the environment and database:

```bash
cp .env.local.example .env.local     # then edit it
bun x prisma migrate dev             # create the schema
bun run dev                          # http://localhost:3000
```

> Recording requires a **secure context** — `http://localhost` works in dev, and
> a deployment must be served over HTTPS for microphone access to be allowed.

## Environment Variables

`.env.local` (see `.env.local.example`):

```env
# Database
DATABASE_URL="postgresql://lecture:lecture@localhost:5432/lecturenotes"

# Gnani / Vachana speech-to-text
GNANI_API_KEY=your_gnani_api_key_here

# Sarvam AI (insights + Class Pulse)
SARVAM_API_KEY=your_sarvam_api_key_here
```

Optional overrides: `SARVAM_MODEL` (defaults to `sarvam-105b-conversations`,
the fast conversational 105B variant; set `sarvam-105b` for the slower flagship
reasoning model), `SARVAM_BASE_URL` (defaults to `https://api.sarvam.ai`),
`GNANI_TTS_MODEL` (defaults to `timbre-v3.0`) and `GNANI_TTS_VOICE` (a global
voice override; must be a Timbre v3.0 voice). The Gnani key is shared with
speech-to-text.

## End Words (transcript line breaks)

By default a transcript line closes at each speech pause, or every 8 seconds of
continuous speech. Professors can instead control line breaks with **end
words** — a line ends only when one is spoken, and the end word is **kept** at
the end of the line.

1. Open **Settings** in the sidebar and add one or more words/phrases
   (e.g. `done`, `next question`). Matching is case-insensitive and whole-word.
2. While recording, everything spoken accumulates into the current line (shown
   as live in-progress text). When an end word is heard, the line is finalised
   and a new line begins.
3. The final diarized transcript is re-grouped by the same end words, so line
   breaks and speaker labels share one source of truth.

Stored in the `EndWord` table via `/api/settings/end-words`. With no end words,
each Gnani transcript segment becomes its own line.

## Project Structure

```
app/
├── api/
│   ├── settings/end-words/         # End-word configuration
│   └── recordings/                 # CRUD, [id]/diarize, [id]/audio,
│                                   #   [id]/insights, [id]/pulse, segments, speakers
├── dashboard/                      # record, transcript, insights, pulse, settings pages
└── layout.tsx

server.mjs                          # Next.js server + Gnani WebSocket proxy
components/ui/                      # shadcn/ui components
contexts/                           # React contexts
hooks/useTranscription.tsx          # recording + transcription orchestration
lib/
├── prisma.ts                       # Prisma client (pg adapter)
├── gnani.ts                        # Gnani batch STT + diarization client
├── sarvam.ts                       # Sarvam 105B chat client (insights + Pulse)
├── tts.ts                          # Gnani Timbre v3.0 voice per language
├── pulse.ts                        # Class Pulse analysis engine (pace, topics, score)
├── storage.ts                      # local audio storage + reads
├── processing.ts                   # transcription/diarization core
├── endWords.ts                     # end-word splitting/grouping
├── audio.ts                        # WAV / PCM / base64 helpers
└── transcription.ts                # language normalisation

Dockerfile                          # optional standalone Next.js image
tests/                              # unit + API + browser E2E tests
```

## Database Schema

PostgreSQL via Prisma (`prisma/schema.prisma`):

- **Recording** — metadata (title, date, duration, status, `audioPath`)
- **TranscriptSegment** — one transcript line (text, timestamps, language, speaker)
- **Speaker** — diarized speaker (label, name, colour)
- **Insights** — summary, key points (JSON), topics (JSON), word count
- **EndWord** — configured words that finish a transcript line

## Usage

1. **Record** — open *Record*, name the lecture, press the mic.
2. **Transcripts** — browse/search recordings; the calendar filters by date.
3. **Insights** — open a recording to read its summary, key points and topics
   (a transcript can be (re)analysed with the **Generate/Regenerate** button).
4. **Class Pulse** — open *Class Pulse* and pick a lecture. The report builds
   automatically: a clarity score, a topic map, likely confusion points,
   speaking pace and the time each topic deserved. Use the **Briefing language**
   menu to translate the written briefing, and **Listen to briefing** for a
   short, natural spoken summary.

### How Class Pulse works

- Pace, pauses, time per topic and the clarity score are computed
  deterministically from the transcript timings (`lib/pulse.ts`).
- Sarvam is asked only for judgement calls: topic boundaries, likely confusion
  points and plain-language coaching. Every answer is validated against the real
  transcript before it is shown.
- The report starts on its own; there is no "Analyse" button. Analysis, the
  translated briefing and the text-to-speech script are separate cached requests,
  so opening a lecture again is instant and changing language only re-runs the
  short briefing request.
- The spoken script is written by a dedicated TTS prompt (short sentences, no
  lists or symbols), not read verbatim from the written briefing.
- The script is spoken by **Gnani Timbre v3.0**, Gnani's latest TTS model. Each
  of the ten supported languages has a curated voice, so the briefing sounds
  native instead of using the browser's robotic system voice. Audio is warmed in
  the background, so pressing **Listen** starts almost immediately.
- Nothing is stored in the database; analyses, briefings, spoken scripts and
  synthesized audio are cached in the browser keyed by transcript fingerprint
  and language.

## Testing

Tests use Bun's runner and exercise the real HTTP API, database, Gnani and
Sarvam APIs, so a reachable `DATABASE_URL`, `GNANI_API_KEY` and
`SARVAM_API_KEY` are required. The suite currently has **36 tests** (15 unit,
20 API, 1 browser E2E).

```bash
bun run test:unit     # fast, no network
bun run test:api      # boots the app and exercises every route
bun run test:e2e      # headless Chromium: record → transcript → insights
bun test              # all of the above
```

| Suite | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit.test.ts` | audio/WAV/base64 helpers, language normalisation, Sarvam client, end-word split/group |
| API | `tests/api.test.ts` | recordings CRUD, segments/speakers, end-word config, Gnani diarization, insights, realtime WebSocket proxy |
| E2E | `tests/e2e.test.ts` | fake-mic recording → live transcript → diarization → insights → transcript page |

The E2E suite plays a speech fixture as the browser's microphone. Regenerate it
on macOS:

```bash
say -v Daniel -o /tmp/fixture.aiff "The quick brown fox jumps over the lazy dog. Machine learning models learn patterns from data."
ffmpeg -y -i /tmp/fixture.aiff -ac 1 -ar 16000 -c:a pcm_s16le tests/fixtures/speech.wav
```

## License

MIT
