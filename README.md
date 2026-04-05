# Lecture Notes App

A voice transcription application for professors to record and organize lecture notes. Built with Next.js 16, Sarvam AI, and SQLite.

## Features

- **Real-time Recording**: Capture audio with live transcription
- **Multi-language Support**: Supports English, Hindi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Marathi, Punjabi, and Odia
- **Calendar Organization**: View and filter recordings by date
- **Search**: Find recordings by title
- **Transcript Management**: View, edit, copy, and download transcripts
- **AI Insights**: Automatic summary, key points, and topic extraction
- **SQLite Database**: Persistent storage with Prisma ORM

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: SQLite with Prisma
- **AI**: Sarvam AI for speech-to-text and insights
- **Package Manager**: Bun

## Getting Started

### Prerequisites

- Node.js 18+ and Bun
- Sarvam AI API key ([Get one here](https://www.sarvam.ai/))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/DevAgarwal2/iot-proj.git
cd iot-proj
```

2. Install dependencies:
```bash
bun install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```
Edit `.env.local` and add your Sarvam AI API key.

4. Set up the database:
```bash
bunx prisma migrate dev
```

5. Run the development server:
```bash
bun run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Create a `.env.local` file with the following variables:

```env
# Sarvam AI API Key
# Get your API key from: https://www.sarvam.ai/
SARVAM_API_KEY=your_sarvam_api_key_here
NEXT_PUBLIC_SARVAM_API_KEY=your_sarvam_api_key_here
```

**Important**: Both `SARVAM_API_KEY` and `NEXT_PUBLIC_SARVAM_API_KEY` should be set to the same value. The public one is used for client-side streaming, and the server one is used for API routes.

## Project Structure

```
app/
├── api/recordings/       # API routes for CRUD operations
├── dashboard/            # Dashboard pages
│   ├── record/          # Recording interface
│   ├── transcript/      # Transcript list and detail
│   └── insights/        # Insights list and detail
├── globals.css
└── layout.tsx

components/ui/           # shadcn/ui components
contexts/               # React contexts
hooks/                  # Custom React hooks
lib/
├── prisma.ts          # Prisma client
└── utils.ts
prisma/
└── schema.prisma      # Database schema
```

## Database Schema

The app uses SQLite with the following models:
- **Recording**: Stores recording metadata (title, duration, status)
- **TranscriptSegment**: Individual transcript segments with timestamps
- **Speaker**: Speaker information with color coding
- **Insights**: AI-generated summary, key points, and topics

## Usage

1. **Recording**: Go to the Record page and click the mic button to start recording
2. **Transcripts**: View all recordings, search by title, or filter by date using the calendar
3. **Insights**: Click on a recording to see AI-generated insights including summary and key points

## Calendar Filtering

- Click a date in the sidebar calendar to filter recordings to that specific date
- The active filter is shown as an orange indicator in both the sidebar and page header
- Click the X or select the same date again to clear the filter

## License

MIT
