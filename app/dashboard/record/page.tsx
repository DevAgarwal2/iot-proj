"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Mic,
  Square,
  Loader2,
  ArrowRight,
  AudioLines,
  Radio,
  SlidersHorizontal,
} from "lucide-react";
import { useTranscription } from "@/hooks/useTranscription";
import { useRecordings } from "@/hooks/useRecordings";
import { Button } from "@/components/ui/button";

// Stable per-bar variance for the audio visualizer (computed once, not during render)
const BAR_VARIANCE = Array.from({ length: 48 }, () => Math.random());

export default function RecordPage() {
  const router = useRouter();
  const [lectureTitle, setLectureTitle] = useState("");
  const [showTitleInput, setShowTitleInput] = useState(false);

  const {
    isRecording,
    isProcessing,
    liveTranscripts,
    detectedLanguage,
    audioLevel,
    recordingDuration,
    streamingText,
    startRecording,
    stopRecording,
    error,
  } = useTranscription();

  const { fetchRecordingsByDate, formatDuration } = useRecordings();

  const getLang = (code: string) =>
    ({
      "en-IN": "English",
      "hi-IN": "Hindi",
      "bn-IN": "Bengali",
      "ta-IN": "Tamil",
      "te-IN": "Telugu",
      "gu-IN": "Gujarati",
      "kn-IN": "Kannada",
      "ml-IN": "Malayalam",
      "mr-IN": "Marathi",
      "pa-IN": "Punjabi",
      "od-IN": "Odia",
    })[code] || code;

  const handleStartRecording = async () => {
    const title =
      lectureTitle.trim() ||
      `Lecture ${new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`;
    setShowTitleInput(false);
    await startRecording(title);
  };

  const handleStopRecording = async () => {
    const recording = await stopRecording();
    if (recording) {
      await fetchRecordingsByDate();
      router.push(`/dashboard/transcript?id=${recording.id}`);
    }
  };

  const handleRecordClick = () => {
    if (isRecording) {
      handleStopRecording();
    } else if (!showTitleInput) {
      setShowTitleInput(true);
    }
  };

  const headline = isProcessing
    ? "Turning audio into notes."
    : isRecording
      ? "Listening closely."
      : "Say it once. Keep it forever.";

  const subline = isProcessing
    ? "Labelling speakers, tightening the transcript and asking Sarvam for the key ideas."
    : isRecording
      ? "Speak naturally. Pauses and your end words decide when a line closes."
      : "One take captures the live transcript, speaker labels and a clean summary.";

  const transientNotice = /reconnect|briefly|paused|continues|unavailable/i.test(
    error
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line/70 px-8">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-[25px] leading-none tracking-[-0.02em]">
              Record a lecture
            </h1>
            <p className="mt-1 text-[11px] text-ink-faint">
              {isRecording ? "Live at the front of the room" : "Your next class starts here"}
            </p>
          </div>
          {detectedLanguage && (
            <span className="ml-2 rounded-full border border-line bg-panel px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              {getLang(detectedLanguage)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isRecording && (
            <span className="flex items-center gap-2 rounded-full border border-clay/20 bg-clay-soft px-3 py-1.5 text-[11px] font-medium text-clay-deep">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
              <span className="font-mono tabular-nums">{formatDuration(recordingDuration)}</span>
            </span>
          )}
          {error && (
            <span
              className={`max-w-[360px] truncate rounded-md px-2.5 py-1.5 text-[11px] ${
                transientNotice
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : "bg-destructive/8 text-destructive"
              }`}
            >
              {error}
            </span>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-h-0 flex-col overflow-y-auto px-8 py-8">
          <div className="paper-noise relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-line bg-panel px-8 py-12 shadow-paper">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[46%] h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(194,65,12,0.075), transparent 64%)",
              }}
            />

            <div className="relative z-10 flex max-w-xl flex-col items-center text-center">
              <div className="mb-5 flex items-center gap-2 rounded-full border border-line bg-cream/80 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted">
                <Radio className="h-3 w-3 text-clay" strokeWidth={1.8} />
                {isRecording ? "Recording" : isProcessing ? "Finishing" : "Ready when you are"}
              </div>

              <h2 className="font-display text-[42px] leading-[1.02] tracking-[-0.03em] text-ink sm:text-[52px]">
                {headline}
              </h2>
              <p className="mt-4 max-w-md text-[13px] leading-6 text-ink-muted">
                {subline}
              </p>

              {showTitleInput && !isRecording && !isProcessing && (
                <div className="mt-8 w-full max-w-md rounded-xl border border-line bg-panel p-4 text-left shadow-lift">
                  <label
                    htmlFor="lecture-title"
                    className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint"
                  >
                    Lecture title
                  </label>
                  <input
                    id="lecture-title"
                    type="text"
                    placeholder="Lecture title (optional)"
                    value={lectureTitle}
                    onChange={(event) => setLectureTitle(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleStartRecording()}
                    className="mt-2 w-full border-b border-line bg-transparent pb-2 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-clay"
                    autoFocus
                  />
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowTitleInput(false)}
                      className="text-[11px] text-ink-muted transition-colors hover:text-ink"
                    >
                      Cancel
                    </button>
                    <Button size="sm" onClick={handleStartRecording}>
                      Start Recording
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              {!showTitleInput && !isProcessing && (
                <div className="relative mt-10">
                  {isRecording && (
                    <div className="recording-ring absolute inset-0 rounded-full" />
                  )}
                  <button
                    onClick={handleRecordClick}
                    className={`group relative flex h-[124px] w-[124px] items-center justify-center rounded-full transition-all duration-300 ${
                      isRecording
                        ? "bg-clay text-panel shadow-[0_20px_45px_-22px_rgba(194,65,12,0.8)] hover:bg-clay-deep"
                        : "bg-ink text-panel shadow-[0_22px_45px_-24px_rgba(29,25,21,0.7)] hover:-translate-y-0.5 hover:bg-[#2b241d]"
                    }`}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                  >
                    <span className="absolute inset-2 rounded-full border border-panel/15" />
                    {isRecording ? (
                      <Square className="h-7 w-7" fill="currentColor" strokeWidth={0} />
                    ) : (
                      <Mic className="h-8 w-8" strokeWidth={1.4} />
                    )}
                  </button>
                </div>
              )}

              {isProcessing && (
                <div className="mt-9 flex flex-col items-center gap-4">
                  <div className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full border border-line bg-cream">
                    <Loader2 className="h-6 w-6 animate-spin text-clay" />
                  </div>
                  <p className="text-[11px] text-ink-faint">
                    This usually takes a few seconds.
                  </p>
                </div>
              )}

              {isRecording && (
                <div className="mt-9 flex h-12 items-center gap-[3px]">
                  {BAR_VARIANCE.map((variance, index) => (
                    <motion.div
                      key={index}
                      className="w-[2px] rounded-full bg-clay"
                      animate={{
                        height: [4, 5 + variance * (audioLevel * 0.5), 4],
                        opacity: [0.28, 0.45 + audioLevel / 180, 0.28],
                      }}
                      transition={{
                        duration: 0.32,
                        repeat: Infinity,
                        delay: index * 0.012,
                      }}
                    />
                  ))}
                </div>
              )}

              {!isRecording && !isProcessing && !showTitleInput && (
                <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[10px] text-ink-faint">
                  <span className="rounded-full border border-line bg-panel px-2.5 py-1">
                    Live captions
                  </span>
                  <span className="rounded-full border border-line bg-panel px-2.5 py-1">
                    Speaker labels
                  </span>
                  <span className="rounded-full border border-line bg-panel px-2.5 py-1">
                    AI summary
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between px-1 text-[10px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <AudioLines className="h-3 w-3" />
              Gnani Prisma · 16 kHz mono
            </span>
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3 w-3" />
              End words shape the line breaks
            </span>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-line/70 bg-[#f7f4ee]">
          <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-line/70 px-5">
            <div className="flex items-center gap-2">
              <span className="font-display text-[19px] tracking-[-0.01em]">
                Live notes
              </span>
              {isRecording && (
                <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.16em] text-clay">
                  <span className="h-1 w-1 animate-pulse rounded-full bg-clay" />
                  on air
                </span>
              )}
            </div>
            <span className="rounded-full bg-panel px-2 py-0.5 font-mono text-[10px] text-ink-muted">
              {liveTranscripts.length}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {streamingText.trim() && (
              <div className="mb-3 rounded-xl border border-clay/20 bg-panel p-4 shadow-paper">
                <div className="mb-2 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-clay">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
                  In progress
                </div>
                <p className="text-[13px] leading-6 text-ink-soft">
                  {streamingText.trim()}
                  <span className="cursor-blink" />
                </p>
              </div>
            )}

            {liveTranscripts.length > 0 ? (
              <div className="space-y-1.5">
                {[...liveTranscripts]
                  .reverse()
                  .slice(0, 16)
                  .map((segment, index) => (
                    <div
                      key={`${segment.timestamp}-${index}`}
                      className={`rounded-lg border px-3.5 py-3 transition-colors ${
                        index === 0
                          ? "border-line bg-panel shadow-paper"
                          : "border-transparent bg-transparent hover:bg-panel/55"
                      }`}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">
                          {getLang(segment.languageCode)}
                        </span>
                        <span className="font-mono text-[9px] text-ink-faint">
                          {formatDuration(Math.round(segment.startTime))}
                        </span>
                      </div>
                      <p
                        className={`text-[12.5px] leading-6 ${
                          index === 0 ? "text-ink-soft" : "text-ink-muted"
                        }`}
                      >
                        {segment.text}
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex h-full min-h-[340px] flex-col items-center justify-center rounded-xl border border-dashed border-line-strong/80 bg-panel/65 px-8 text-center">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-panel">
                  <AudioLines className="h-4 w-4 text-ink-faint" strokeWidth={1.6} />
                </div>
                <p className="font-display text-[24px] leading-tight text-ink">
                  Your words land here.
                </p>
                <p className="mt-2 max-w-[220px] text-[11px] leading-5 text-ink-faint">
                  Start a recording and watch the transcript arrive line by line.
                </p>
                <Link
                  href="/dashboard/settings"
                  className="mt-5 text-[10px] font-medium uppercase tracking-[0.14em] text-clay hover:text-clay-deep"
                >
                  Set end words
                </Link>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-line/70 px-5 py-3.5 text-[10px] leading-5 text-ink-faint">
            Lines close on natural pauses, or every 8 seconds of continuous speech.
          </div>
        </aside>
      </div>
    </div>
  );
}
