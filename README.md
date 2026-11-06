# Lecture Notes App

A voice transcription application for professors to record and organise lecture
notes. It captures lecture audio in the browser, transcribes it **live** with
Gnani (Vachana) STT, then produces a **speaker-labelled transcript** and
AI-generated **insights** (summary, key points, topics). Built with Next.js 16,
Gnani Prisma, Mistral and PostgreSQL.

## What’s new in this build

- **Gnani Prisma v3.0** now handles all speech-to-text — live captions over a
  same-origin WebSocket proxy, and a diarized batch pass for the final
  transcript.
- **Local-first runtime** — AWS S3, Secrets Manager, SQS and Lambda are gone;
  audio is stored on disk and configuration comes from `.env`.
- **Warm editorial UI** — paper-white canvas, stone sidebar, Instrument Serif
  display type and a burnt-orange accent, with a recent-lecture rail and a
  dedicated live-notes panel.
- **Mistral Small** remains the insights engine only.

## Features

- **Real-time recording** with live transcription via Gnani Realtime
- **Speaker diarization** — a Gnani Batch pass labels who said what
- **End words** — control transcript line breaks: a line ends only when the
  speaker says a configured word ("done", "next question", …)
- **AI insights** — summary, key points and topics per recording
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
| Insights | Mistral Small |
| Tooling | Bun, Playwright, `ws` (WebSocket proxy) |

## Models

Defined in `lib/gnani.ts` and `lib/mistral.ts`.

| Purpose | Model |
| --- | --- |
| Live streaming transcription | Gnani `prisma-v3.0` (Realtime WebSocket) |
| Batch transcription + speaker diarization | Gnani `prisma-v3.0` (Batch API) |
| Insights / summaries | `mistral-small-latest` |

Both API keys are used **only on the server**. The browser talks to a same-origin
WebSocket proxy (`/api/stt/stream`) which attaches the Gnani key, so the key is
never exposed to the client. Mistral is called server-side for insights.

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
- A **Mistral** API key ([console.mistral.ai](https://console.mistral.ai/)) for insights

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

# Mistral (insights only)
MISTRAL_API_KEY=your_mistral_api_key_here
```

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
│                                   #   [id]/insights, segments, speakers
├── dashboard/                      # record, transcript, insights, settings pages
└── layout.tsx

server.mjs                          # Next.js server + Gnani WebSocket proxy
components/ui/                      # shadcn/ui components
contexts/                           # React contexts
hooks/useTranscription.tsx          # recording + transcription orchestration
lib/
├── prisma.ts                       # Prisma client (pg adapter)
├── gnani.ts                        # Gnani batch STT + diarization client
├── mistral.ts                      # Mistral client (insights)
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

## Testing

Tests use Bun's runner and exercise the real HTTP API, database, Gnani and
Mistral APIs, so a reachable `DATABASE_URL`, `GNANI_API_KEY` and
`MISTRAL_API_KEY` are required. The suite currently has **36 tests** (15 unit,
20 API, 1 browser E2E).

```bash
bun run test:unit     # fast, no network
bun run test:api      # boots the app and exercises every route
bun run test:e2e      # headless Chromium: record → transcript → insights
bun test              # all of the above
```

| Suite | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit.test.ts` | audio/WAV/base64 helpers, language normalisation, Mistral client, end-word split/group |
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
