# Lecture Notes App

A voice transcription application for professors to record and organise lecture
notes. It captures lecture audio in the browser, transcribes it **live**, then
produces a **speaker-labelled transcript** and AI-generated **insights**
(summary, key points, topics). Built with Next.js 16, Mistral AI (Voxtral) and
PostgreSQL, and deployable to AWS.

## Features

- **Real-time recording** with live transcription via Voxtral Realtime
- **Speaker diarization** — a second Voxtral pass labels who said what
- **End words** — control transcript line breaks: a line ends only when the
  speaker says a configured word ("done", "next question", …)
- **AI insights** — summary, key points and topics per recording
- **Calendar + search** — organise recordings by date and title
- **Transcript tools** — view, edit, copy and export
- **Cloud-ready** — recorded audio in Amazon S3 (presigned playback), data in
  Amazon RDS, secrets in AWS Secrets Manager, async processing via SQS + Lambda

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling / UI | Tailwind CSS v4, shadcn/ui, lucide-react, framer-motion |
| Data | Prisma ORM + `@prisma/adapter-pg` → PostgreSQL (Amazon RDS) |
| AI | Mistral AI — Voxtral (speech-to-text), Mistral Small (insights) |
| Cloud | Amazon S3, RDS, Secrets Manager, SQS, Lambda, ECR, EC2 |
| Tooling | Bun, Docker, Playwright |

## Models

Defined in `lib/mistral.ts` (see the [Mistral audio docs](https://docs.mistral.ai/capabilities/audio/)).

| Purpose | Model |
| --- | --- |
| Live streaming transcription | `voxtral-mini-transcribe-realtime-2602` |
| Batch transcription + speaker diarization | `voxtral-mini-latest` |
| Insights / summaries | `mistral-small-latest` |

The API key is used **only on the server**. The browser receives short-lived
realtime tokens minted via `/api/realtime/session`, so the key is never exposed
to the client.

## Getting Started

### Prerequisites

- Node.js 18+ and **Bun**
- **PostgreSQL** (local or Amazon RDS)
- A Mistral AI API key ([console.mistral.ai](https://console.mistral.ai/))

### Installation

```bash
git clone https://github.com/DevAgarwal2/iot-proj.git
cd iot-proj
bun install
```

Start a local PostgreSQL (or point `DATABASE_URL` at RDS):

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
DATABASE_URL="postgresql://user:pass@host:5432/lecturenotes?sslmode=require"

# Mistral API key (local dev; omit on AWS to use Secrets Manager)
MISTRAL_API_KEY=your_mistral_api_key_here

# AWS (optional / deployment)
AWS_REGION=us-west-2
AUDIO_BUCKET=your-audio-bucket
MISTRAL_SECRET_ARN=arn:aws:secretsmanager:...:secret:lecture-notes/mistral-api-key-xxxxxx
SQS_QUEUE_URL=https://sqs.us-west-2.amazonaws.com/<account>/lecture-notes-processing
PROCESS_SECRET=change-me
```

## End Words (transcript line breaks)

By default a transcript line closes every few seconds. Professors can instead
control line breaks with **end words** — a line ends only when one is spoken, and
the end word is **kept** at the end of the line.

1. Open **Settings** in the sidebar and add one or more words/phrases
   (e.g. `done`, `next question`). Matching is case-insensitive and whole-word.
2. While recording, everything spoken accumulates into the current line (shown
   as live in-progress text). When an end word is heard, the line is finalised
   and a new line begins.
3. The final diarized transcript is re-grouped by the same end words, so line
   breaks and speaker labels share one source of truth.

Stored in the `EndWord` table via `/api/settings/end-words`. With no end words
configured the fallback is a periodic line break every 4 seconds.

## Project Structure

```
app/
├── api/
│   ├── realtime/session/           # Mints short-lived Voxtral realtime tokens
│   ├── settings/end-words/         # End-word configuration
│   └── recordings/                 # CRUD, [id]/diarize, [id]/process,
│                                   #   [id]/audio, [id]/insights, segments, speakers
├── dashboard/                      # record, transcript, insights, settings pages
└── layout.tsx

components/ui/                      # shadcn/ui components
contexts/                           # React contexts
hooks/useTranscription.tsx          # recording + transcription orchestration
lib/
├── prisma.ts                       # Prisma client (pg adapter)
├── mistral.ts                      # Mistral client + model config
├── secrets.ts                      # Mistral key from env / Secrets Manager
├── storage.ts                      # S3 audio + presigned URLs
├── processing.ts                   # shared transcription/diarization core
├── endWords.ts                     # end-word splitting/grouping
├── audio.ts                        # WAV / PCM / base64 helpers
├── transcription.ts                # language normalisation
└── queue.ts                        # SQS enqueue helper

lambda/process-audio/               # SQS worker (calls /api/recordings/[id]/process)
infra/sst.config.ts                 # reference SST (v3) infrastructure-as-code
scripts/aws-provision.sh            # reproducible AWS CLI provisioning
Dockerfile                          # Next.js standalone image for ECR
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

## AWS Deployment

```
Browser ──▶ Next.js (EC2 container) ──▶ Mistral (Voxtral realtime + transcription)
                │  ├── Amazon RDS PostgreSQL (Prisma)
                │  ├── Amazon S3 (audio + presigned GET)
                │  └── AWS Secrets Manager (Mistral key, DB URL)
                └── SQS ──▶ Lambda ──▶ POST /api/recordings/{id}/process
```

- **EC2** (t4g.small, Docker image from **ECR**, `LabInstanceProfile`) runs the app.
- **nginx + Let's Encrypt** terminate HTTPS (microphone needs a secure context).
- **S3** stores audio; `Recording.audioPath` points at it and playback uses a
  presigned URL (`/api/recordings/[id]/audio`).
- **Secrets Manager** provides the Mistral key at runtime (no key in env on AWS).
- **SQS + Lambda** decouple processing (`/api/recordings/[id]/process`, guarded
  by `PROCESS_SECRET`).

`scripts/aws-provision.sh` provisions the stack with the AWS CLI;
`infra/sst.config.ts` is the equivalent infrastructure-as-code for a full account.

## Testing

Tests use Bun's runner and exercise the real HTTP API, database and Mistral API,
so a reachable `DATABASE_URL` and `MISTRAL_API_KEY` are required.

```bash
bun run test:unit     # fast, no network
bun run test:api      # boots the app and exercises every route
bun run test:e2e      # headless Chromium: record → transcript → insights
bun test              # all of the above
```

| Suite | File | Covers |
| --- | --- | --- |
| Unit | `tests/unit.test.ts` | audio/WAV/base64 helpers, language normalisation, Mistral client, end-word split/group |
| API | `tests/api.test.ts` | recordings CRUD, segments/speakers, end-word config, realtime token mint, diarization, insights, realtime WebSocket |
| E2E | `tests/e2e.test.ts` | fake-mic recording → live transcript → diarization → insights → transcript page |

The E2E suite plays a speech fixture as the browser's microphone. Regenerate it
on macOS:

```bash
say -v Daniel -o /tmp/fixture.aiff "The quick brown fox jumps over the lazy dog. Machine learning models learn patterns from data."
ffmpeg -y -i /tmp/fixture.aiff -ac 1 -ar 16000 -c:a pcm_s16le tests/fixtures/speech.wav
```

## License

MIT
