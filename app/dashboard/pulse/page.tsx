"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ChevronLeft,
  Filter,
  Gauge,
  Languages,
  Lightbulb,
  Loader2,
  Mic,
  Pause,
  Play,
  Search,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useRecordingsContext,
  type RecordingSummary,
} from "@/contexts/RecordingsContext";
import type { Recording } from "@/hooks/useTranscription";
import { gnaniTtsVoice } from "@/lib/tts";
import {
  KIND_LABEL,
  PACE_BURST,
  PACE_CHART_MAX,
  PACE_FAST,
  PULSE_LANGUAGES,
  buildTimeline,
  computePace,
  computeScore,
  formatClock,
  formatMinutes,
  topicForLine,
  type PaceBucket,
  type PaceStats,
  type PulseAnalysis,
  type PulseBrief,
  type PulseSpeech,
  type Timeline,
  type TopicTime,
} from "@/lib/pulse";

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

const LANG_KEY = "pulse:lang:v1";
const TOPIC_COLORS = [
  "#c2410c",
  "#2f5d4a",
  "#b7791f",
  "#7c5cbf",
  "#2563eb",
  "#a8556b",
  "#4b8a8a",
  "#8a7a3a",
];

const cacheKey = (
  kind: "a" | "b" | "s",
  id: string,
  fingerprint: string,
  lang?: string
) => `pulse:${kind}:v1:${id}:${fingerprint}${lang ? `:${lang}` : ""}`;

function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked - the report just won't be cached */
  }
}

function readSavedLanguage(): string {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved && PULSE_LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    /* ignore */
  }
  return "en-IN";
}

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-line bg-panel px-2.5 text-[12px] text-ink outline-none transition-colors focus-visible:border-clay";

/* ------------------------------------------------------------------ */
/* Gnani TTS audio                                                     */
/* ------------------------------------------------------------------ */

type AudioState = "idle" | "loading" | "playing" | "paused";

/**
 * Plays the WAV returned by `/api/tts`. One hidden <audio> element is reused so
 * play/pause/resume and the progress bar behave exactly like a normal player.
 */
function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioState>("idle");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";

    const onTime = () => {
      setProgress(
        audio.duration > 0
          ? Math.min(1, audio.currentTime / audio.duration)
          : 0
      );
    };
    const onEnded = () => {
      setState("idle");
      setProgress(0);
    };
    const onError = () => {
      setState("idle");
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(async (src: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== src) {
      audio.src = src;
    }
    if (
      audio.ended ||
      (audio.duration > 0 && audio.currentTime >= audio.duration)
    ) {
      audio.currentTime = 0;
    }
    setState("loading");
    try {
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setState("paused");
  }, []);

  const resume = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setState("loading");
    try {
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setState("idle");
    setProgress(0);
  }, []);

  return { state, progress, play, pause, resume, stop };
}

/* ------------------------------------------------------------------ */
/* Visual pieces                                                       */
/* ------------------------------------------------------------------ */

function SectionTitle({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="font-display text-[22px] leading-none tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {note && <p className="text-[11px] text-ink-faint">{note}</p>}
      <div className="hidden h-px min-w-6 flex-1 bg-line sm:block" />
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const color = value >= 75 ? "#2f5d4a" : value >= 50 ? "#b7791f" : "#c2410c";
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke="#efe9dd"
          strokeWidth="9"
        />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-[34px] leading-none tabular-nums text-ink">
          {value}
        </span>
        <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-ink-faint">
          Clarity
        </span>
      </div>
    </div>
  );
}

function MiniMeter({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "#2f5d4a" : value >= 50 ? "#b7791f" : "#c2410c";
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
          {value}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream-deep">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function levelColor(level: PaceBucket["level"]) {
  if (level === "burst") return "#c2410c";
  if (level === "fast") return "#d99a2b";
  if (level === "calm") return "#2f5d4a";
  return "#e4ddd0";
}

function PaceChart({ pace }: { pace: PaceStats }) {
  const toPct = (wpm: number) => Math.min(100, (wpm / PACE_CHART_MAX) * 100);
  return (
    <div>
      <div className="relative h-40 sm:h-48">
        <div
          className="absolute inset-x-0 border-t border-dashed border-amber-500/60"
          style={{ bottom: `${toPct(PACE_FAST)}%` }}
        >
          <span className="absolute -top-4 right-0 text-[9px] uppercase tracking-[0.12em] text-amber-700">
            {PACE_FAST} fast
          </span>
        </div>
        <div
          className="absolute inset-x-0 border-t border-dashed border-clay/60"
          style={{ bottom: `${toPct(PACE_BURST)}%` }}
        >
          <span className="absolute -top-4 left-0 text-[9px] uppercase tracking-[0.12em] text-clay">
            {PACE_BURST} burst
          </span>
        </div>
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {pace.buckets.map((bucket) => (
            <div
              key={bucket.index}
              className="min-w-[2px] flex-1 rounded-t-[3px]"
              style={{
                height: `${Math.max(2, toPct(bucket.wpm))}%`,
                backgroundColor: levelColor(bucket.level),
              }}
              title={`${formatClock(bucket.start)}–${formatClock(bucket.end)} · ${
                bucket.level === "silent" ? "little speech" : `${bucket.wpm} wpm`
              }`}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-faint">
        <span>00:00</span>
        <span>{formatClock(pace.totalSeconds / 2)}</span>
        <span>{formatClock(pace.totalSeconds)}</span>
      </div>
    </div>
  );
}

interface MapPiece {
  topic: TopicTime;
  colorIndex: number;
  start: number;
  end: number;
}

function buildMapPieces(topics: TopicTime[], timeline: Timeline): MapPiece[] {
  const total = Math.max(timeline.totalSeconds, 1);
  const pieces: { topic: TopicTime; colorIndex: number; fromLine: number }[] = [];
  topics.forEach((topic, colorIndex) => {
    for (const span of topic.spans) {
      pieces.push({ topic, colorIndex, fromLine: span.fromLine });
    }
  });
  pieces.sort((a, b) => a.fromLine - b.fromLine);
  return pieces.map((piece, i) => {
    const startOf = (line: number) =>
      line <= 1 ? 0 : (timeline.lines[line - 1]?.start ?? 0);
    const start = startOf(piece.fromLine);
    const next = pieces[i + 1];
    const end = next ? Math.max(startOf(next.fromLine), start) : total;
    return { topic: piece.topic, colorIndex: piece.colorIndex, start, end };
  });
}

function LectureMap({
  topics,
  analysis,
  pace,
  timeline,
  nameOf,
}: {
  topics: TopicTime[];
  analysis: PulseAnalysis;
  pace: PaceStats;
  timeline: Timeline;
  nameOf: (t: TopicTime) => string;
}) {
  const total = Math.max(timeline.totalSeconds, 1);
  const pieces = useMemo(
    () => buildMapPieces(topics, timeline),
    [topics, timeline]
  );
  const pct = (seconds: number) => `${(seconds / total) * 100}%`;

  return (
    <div>
      <div className="relative pt-6">
        {analysis.confusion.map((c) => (
          <span
            key={c.id}
            className="absolute top-0 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-white bg-clay text-[8px] font-semibold text-white shadow-sm"
            style={{ left: pct(c.time) }}
            title={`${formatClock(c.time)} · ${KIND_LABEL[c.kind]}`}
          >
            !
          </span>
        ))}
        <div className="flex h-11 overflow-hidden rounded-lg border border-line">
          {pieces.map((piece, i) => {
            const width = ((piece.end - piece.start) / total) * 100;
            return (
              <div
                key={`${piece.topic.id}-${i}`}
                className="flex min-w-[3px] items-center overflow-hidden border-r border-white/60 last:border-r-0"
                style={{
                  width: `${width}%`,
                  backgroundColor: TOPIC_COLORS[piece.colorIndex % TOPIC_COLORS.length],
                }}
                title={`${nameOf(piece.topic)} · ${formatMinutes(piece.end - piece.start)} min`}
              >
                {width > 14 && (
                  <span className="truncate px-2 text-[10px] font-medium text-white">
                    {nameOf(piece.topic)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="relative mt-1.5 h-1.5 rounded-full bg-cream-deep">
          {pace.bursts.map((burst, i) => (
            <div
              key={i}
              className="absolute top-0 h-full rounded-full bg-clay"
              style={{
                left: pct(burst.start),
                width: `max(4px, ${pct(burst.end - burst.start)})`,
              }}
              title={`Fast burst ${formatClock(burst.start)}–${formatClock(burst.end)}`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-faint">
          <span>00:00</span>
          <span>{formatClock(total)}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {topics.map((topic, i) => (
          <span
            key={topic.id}
            className="flex items-center gap-1.5 text-[11px] text-ink-muted"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: TOPIC_COLORS[i % TOPIC_COLORS.length] }}
            />
            {nameOf(topic)}
            <span className="font-mono text-[10px] text-ink-faint">
              {formatMinutes(topic.seconds)}m
            </span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span className="h-2 w-2 rounded-full bg-clay" />
          Pins mark likely confusion · red bar marks fast bursts
        </span>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<
  TopicTime["status"],
  { label: string; badge: string; bar: string }
> = {
  rushed: {
    label: "Rushed",
    badge: "bg-clay-soft text-clay-deep",
    bar: "#c2410c",
  },
  over: {
    label: "More time than needed",
    badge: "bg-amber-50 text-amber-800",
    bar: "#d99a2b",
  },
  balanced: {
    label: "Well balanced",
    badge: "bg-sage-soft text-sage",
    bar: "#2f5d4a",
  },
};

/* ------------------------------------------------------------------ */
/* Recording list                                                      */
/* ------------------------------------------------------------------ */

function PulseList() {
  const {
    filteredRecordings,
    isLoading,
    fetchRecordingsByDate,
    selectedDate,
    getDateLabel,
    clearDateFilter,
    formatDuration,
  } = useRecordingsContext();
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchRecordingsByDate();
  }, [fetchRecordingsByDate]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...filteredRecordings]
      .filter((r) => !q || r.title.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredRecordings, query]);

  const fmtDate = (date: Date | string) =>
    new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-line/70 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[25px] leading-none tracking-[-0.02em]">
              Class Pulse
            </h1>
            <p className="mt-1 truncate text-[11px] text-ink-faint">
              Where the room got lost.
            </p>
          </div>
          {selectedDate && (
            <span className="hidden items-center gap-1.5 rounded-full border border-clay/20 bg-clay-soft px-2.5 py-1 text-[10px] font-medium text-clay-deep sm:flex">
              <Filter className="h-3 w-3" />
              {getDateLabel(selectedDate)}
              <button
                onClick={clearDateFilter}
                className="ml-0.5 rounded-full p-0.5 hover:bg-clay/10"
                aria-label="Clear date filter"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(e.target.value)
            }
            className="h-9 w-36 pl-9 sm:w-64"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[12px] text-ink-faint">Loading lectures…</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel shadow-paper">
              <Activity className="h-5 w-5 text-ink-faint" strokeWidth={1.4} />
            </div>
            <p className="font-display text-[30px] leading-tight tracking-[-0.02em] sm:text-[34px]">
              {query ? "Nothing matches that search." : "No lectures to read yet."}
            </p>
            <p className="mt-2 max-w-sm text-[12px] leading-5 text-ink-faint">
              Record a lecture and Class Pulse will show where students likely
              got lost, how fast you spoke and where the time went.
            </p>
            {!query && (
              <Link
                href="/dashboard/record"
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-ink px-4 text-[12px] font-medium text-panel transition-colors hover:bg-ink/90"
              >
                <Mic className="h-3.5 w-3.5" />
                Record a lecture
              </Link>
            )}
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-3 px-4 py-6 sm:grid-cols-2 sm:px-8 sm:py-8">
            {visible.map((recording: RecordingSummary) => (
              <Link
                key={recording.id}
                href={`/dashboard/pulse?id=${recording.id}`}
                className="group rounded-xl border border-line bg-panel p-4 shadow-paper transition-all hover:-translate-y-0.5 hover:border-line-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-[20px] leading-tight tracking-[-0.01em]">
                    {recording.title}
                  </h3>
                  <Activity className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-clay" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                  <span>{fmtDate(recording.date)}</span>
                  <span className="font-mono">{formatDuration(recording.duration)}</span>
                  <span>
                    {recording.segmentCount > 0
                      ? `${recording.segmentCount} lines`
                      : "No transcript yet"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recording detail                                                    */
/* ------------------------------------------------------------------ */

function PulseDetail({ id }: { id: string }) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [lang, setLang] = useState("en-IN");
  const [analysis, setAnalysis] = useState<PulseAnalysis | null>(null);
  const [brief, setBrief] = useState<PulseBrief | null>(null);
  const [speechScript, setSpeechScript] = useState<PulseSpeech | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const audioInFlightRef = useRef<Map<string, Promise<string>>>(new Map());
  const audioPrefetchRef = useRef<Set<string>>(new Set());
  const prefetchedRef = useRef("");
  const langRef = useRef(lang);
  const analyzingRef = useRef(false);
  const autoRanRef = useRef("");

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  /* ---- load the recording ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/recordings/${id}`);
        if (!res.ok) throw new Error("We could not open that recording.");
        const data = (await res.json()) as Recording;
        if (!cancelled) setRecording(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load the recording."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const timeline = useMemo(
    () =>
      recording
        ? buildTimeline(recording.segments, recording.duration)
        : null,
    [recording]
  );
  const pace = useMemo(() => (timeline ? computePace(timeline) : null), [timeline]);

  /* ---- restore saved language + cached report ---- */
  const fingerprint = timeline?.fingerprint ?? "";
  const hasTranscript = Boolean(
    timeline && timeline.lines.length > 0 && timeline.professorWords >= 20
  );

  useEffect(() => {
    if (!fingerprint) return;
    const savedLang = readSavedLanguage();
    setLang(savedLang);
    langRef.current = savedLang;
    const cachedAnalysis = readCache<PulseAnalysis>(cacheKey("a", id, fingerprint));
    if (!cachedAnalysis) return;
    setAnalysis(cachedAnalysis);
    const cachedBrief = readCache<PulseBrief>(
      cacheKey("b", id, fingerprint, savedLang)
    );
    if (cachedBrief) setBrief(cachedBrief);
    const cachedSpeech = readCache<PulseSpeech>(
      cacheKey("s", id, fingerprint, savedLang)
    );
    if (cachedSpeech) setSpeechScript(cachedSpeech);
  }, [id, fingerprint]);

  const player = useAudioPlayer();
  const stopAudio = player.stop;
  const playAudio = player.play;
  const ttsAvailable = Boolean(gnaniTtsVoice(lang));

  useEffect(
    () => () => {
      audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioCacheRef.current.clear();
    },
    []
  );

  /* ---- API calls ---- */
  const runBrief = useCallback(
    async (source: PulseAnalysis, code: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBriefing(true);
      setError("");
      try {
        const res = await fetch(`/api/recordings/${id}/pulse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "brief", language: code, analysis: source }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.brief) {
          throw new Error(data?.error || "Could not write the briefing.");
        }
        setBrief(data.brief as PulseBrief);
        writeCache(cacheKey("b", id, source.fingerprint, code), data.brief);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not write the briefing.");
      } finally {
        if (abortRef.current === controller) setBriefing(false);
      }
    },
    [id]
  );

  const runAnalysis = useCallback(async () => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    abortRef.current?.abort();
    stopAudio();
    setAnalyzing(true);
    setError("");
    try {
      const res = await fetch(`/api/recordings/${id}/pulse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "analyze" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.analysis) {
        throw new Error(data?.error || "Could not analyse this lecture.");
      }
      const fresh = data.analysis as PulseAnalysis;
      setAnalysis(fresh);
      setBrief(null);
      setSpeechScript(null);
      writeCache(cacheKey("a", id, fresh.fingerprint), fresh);
      setAnalyzing(false);
      analyzingRef.current = false;
      void runBrief(fresh, langRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyse this lecture.");
      setAnalyzing(false);
      analyzingRef.current = false;
    }
  }, [id, runBrief, stopAudio]);

  /* ---- start automatically; the professor never has to click "Analyse" ---- */
  useEffect(() => {
    if (!fingerprint || !hasTranscript) return;
    const runKey = `${id}:${fingerprint}`;
    if (autoRanRef.current === runKey) return;
    autoRanRef.current = runKey;

    const savedLang = readSavedLanguage();
    langRef.current = savedLang;

    const cachedAnalysis = readCache<PulseAnalysis>(
      cacheKey("a", id, fingerprint)
    );
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
      const cachedBrief = readCache<PulseBrief>(
        cacheKey("b", id, fingerprint, savedLang)
      );
      if (cachedBrief) setBrief(cachedBrief);
      else void runBrief(cachedAnalysis, savedLang);
      return;
    }
    void runAnalysis();
  }, [fingerprint, hasTranscript, id, runAnalysis, runBrief]);

  const changeLanguage = (code: string) => {
    setLang(code);
    langRef.current = code;
    try {
      window.localStorage.setItem(LANG_KEY, code);
    } catch {
      /* ignore */
    }
    stopAudio();
    if (!analysis) return;

    const cached = readCache<PulseBrief>(
      cacheKey("b", id, analysis.fingerprint, code)
    );
    abortRef.current?.abort();
    if (cached) {
      setBriefing(false);
      setBrief(cached);
    } else {
      setBrief(null);
      void runBrief(analysis, code);
    }
    setSpeechScript(
      readCache<PulseSpeech>(cacheKey("s", id, analysis.fingerprint, code))
    );
  };

  const requestSpeech = useCallback(
    async (quiet = false): Promise<PulseSpeech | null> => {
      if (!analysis) return null;
      const code = langRef.current;
      const cached = readCache<PulseSpeech>(
        cacheKey("s", id, analysis.fingerprint, code)
      );
      if (cached) {
        setSpeechScript(cached);
        return cached;
      }

      try {
        const res = await fetch(`/api/recordings/${id}/pulse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "speech", language: code, analysis }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.speech) {
          throw new Error(data?.error || "Could not write the spoken script.");
        }
        if (data.speech.language !== langRef.current) return null;
        setSpeechScript(data.speech as PulseSpeech);
        writeCache(cacheKey("s", id, analysis.fingerprint, code), data.speech);
        return data.speech as PulseSpeech;
      } catch (err) {
        if (!quiet) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not write the spoken script."
          );
        }
        return null;
      }
    },
    [analysis, id]
  );

  /* Warm the spoken script in the background so "Listen" feels instant. */
  useEffect(() => {
    if (!analysis || !brief || brief.language !== lang) return;
    if (!gnaniTtsVoice(lang)) return;
    if (speechScript && speechScript.language === lang) return;
    const key = `${analysis.fingerprint}:${lang}`;
    if (prefetchedRef.current === key) return;
    prefetchedRef.current = key;
    void requestSpeech(true);
  }, [analysis, brief, lang, requestSpeech, speechScript]);

  const getAudioUrl = useCallback(
    async (script: PulseSpeech): Promise<string> => {
      const cacheKeyForAudio = `${analysis?.fingerprint ?? ""}:${
        script.language
      }`;
      const cached = audioCacheRef.current.get(cacheKeyForAudio);
      if (cached) return cached;

      // Share one request when the background prefetch and "Listen" overlap.
      const inFlight = audioInFlightRef.current.get(cacheKeyForAudio);
      if (inFlight) return inFlight;

      const request = (async () => {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: script.script,
            language: script.language,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Could not generate the spoken audio.");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioCacheRef.current.set(cacheKeyForAudio, url);
        return url;
      })();

      audioInFlightRef.current.set(cacheKeyForAudio, request);
      try {
        return await request;
      } finally {
        audioInFlightRef.current.delete(cacheKeyForAudio);
      }
    },
    [analysis]
  );

  /* Warm the audio too, so the first "Listen" starts immediately. */
  useEffect(() => {
    if (!analysis || !speechScript || speechScript.language !== lang) return;
    if (!gnaniTtsVoice(lang)) return;
    const key = `${analysis.fingerprint}:${lang}`;
    if (audioCacheRef.current.has(key) || audioPrefetchRef.current.has(key)) {
      return;
    }
    audioPrefetchRef.current.add(key);
    void getAudioUrl(speechScript).catch(() => {
      audioPrefetchRef.current.delete(key);
    });
  }, [analysis, getAudioUrl, lang, speechScript]);

  const handleListen = useCallback(async () => {
    if (!analysis) return;
    const code = langRef.current;
    if (!gnaniTtsVoice(code)) return;

    setSpeechLoading(true);
    setError("");
    try {
      const script =
        speechScript && speechScript.language === code
          ? speechScript
          : await requestSpeech();
      if (!script) return;
      const url = await getAudioUrl(script);
      await playAudio(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not play the spoken audio."
      );
    } finally {
      setSpeechLoading(false);
    }
  }, [analysis, getAudioUrl, playAudio, requestSpeech, speechScript]);

  /* ---- derived view data ---- */
  const activeBrief = brief && brief.language === lang ? brief : null;

  const nameOf = useCallback(
    (t: TopicTime) => activeBrief?.topics[t.id]?.name ?? t.name,
    [activeBrief]
  );
  const topicWhy = (t: TopicTime) => activeBrief?.topics[t.id]?.why ?? t.why;

  const score = useMemo(
    () =>
      analysis && pace
        ? computeScore(pace, analysis.topics, analysis.confusion)
        : null,
    [analysis, pace]
  );

  const burstTopics = useMemo(() => {
    if (!analysis || !timeline || !pace) return [] as (string | null)[];
    return pace.bursts.map((burst) => {
      const line = timeline.lines.find((l) => l.start >= burst.start - 0.5);
      const topic = line ? topicForLine(analysis.topics, line.n) : null;
      return topic ? nameOf(topic) : null;
    });
  }, [analysis, timeline, pace, nameOf]);

  const dateText = recording
    ? new Date(recording.date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  /* ---- states ---- */
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[12px] text-ink-faint">Opening the lecture…</p>
      </div>
    );
  }

  if (loadError || !recording || !timeline || !pace) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-[30px] leading-tight tracking-[-0.02em]">
          {loadError || "Recording not found."}
        </p>
        <Link
          href="/dashboard/pulse"
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-[12px] font-medium hover:bg-cream-deep"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to lectures
        </Link>
      </div>
    );
  }

  const busy = analyzing || briefing;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-line/70 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard/pulse"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-panel text-ink-muted transition-colors hover:bg-cream-deep hover:text-ink"
            aria-label="Back to lectures"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[25px] leading-none tracking-[-0.02em]">
              {recording.title}
            </h1>
            <p className="mt-1 truncate text-[11px] text-ink-faint">
              Class Pulse · {dateText} · {formatClock(timeline.totalSeconds)}
            </p>
          </div>
        </div>
        {hasTranscript && (
          <div className="flex shrink-0 items-center gap-2 text-[11px] text-ink-faint">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-clay" />}
            <span className="hidden sm:inline">
              {analyzing
                ? "Reading the lecture…"
                : briefing
                  ? "Writing your briefing…"
                  : "Up to date"}
            </span>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-8 sm:py-8">
          {!hasTranscript ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-panel/70 px-6 py-14 text-center">
              <p className="font-display text-[28px] leading-tight tracking-[-0.02em]">
                This lecture has no transcript yet.
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[12px] leading-5 text-ink-faint">
                Class Pulse reads the transcript, so record or process the
                lecture first.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[12px] text-destructive">
                  {error}
                </div>
              )}

              {/* ---------- Hero ---------- */}
              {analysis && score ? (
                <section className="paper-noise relative overflow-hidden rounded-2xl border border-line bg-panel p-5 shadow-paper sm:p-6">
                  <div className="flex flex-col gap-6 md:flex-row md:items-start">
                    <div className="flex items-center gap-5 md:flex-col md:items-start">
                      <ScoreRing value={score.total} />
                      <div className="grid w-full min-w-[150px] gap-3 md:w-[150px]">
                        <MiniMeter label="Confusion" value={score.confusion} />
                        <MiniMeter label="Pace" value={score.pace} />
                        <MiniMeter label="Balance" value={score.balance} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-clay">
                        Your briefing
                      </p>
                      {activeBrief ? (
                        <p className="mt-2 font-display text-[26px] leading-[1.15] tracking-[-0.02em] text-ink sm:text-[30px]">
                          {activeBrief.headline || "Here is how the lecture landed."}
                        </p>
                      ) : (
                        <div className="mt-3">
                          {briefing || !error ? (
                            <div className="space-y-2" aria-hidden>
                              <div className="h-6 w-full max-w-md animate-pulse rounded bg-cream-deep" />
                              <div className="h-6 w-2/3 animate-pulse rounded bg-cream-deep" />
                            </div>
                          ) : (
                            <>
                              <p className="text-[13px] leading-5 text-ink-muted">
                                The numbers are ready. The briefing in{" "}
                                {PULSE_LANGUAGES.find((l) => l.code === lang)
                                  ?.name ?? lang}{" "}
                                could not be written.
                              </p>
                              <Button
                                size="sm"
                                className="mt-3"
                                onClick={() => void runBrief(analysis, lang)}
                              >
                                Try again
                              </Button>
                            </>
                          )}
                        </div>
                      )}

                      {activeBrief && activeBrief.coaching.length > 0 && (
                        <ul className="mt-4 space-y-2">
                          {activeBrief.coaching.map((tip, i) => (
                            <li
                              key={i}
                              className="flex gap-2.5 text-[13px] leading-5 text-ink-soft"
                            >
                              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay" />
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Language + read aloud */}
                      <div className="mt-5 rounded-xl border border-line bg-cream/70 p-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="min-w-0">
                            <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                              <Languages className="h-3 w-3" />
                              Briefing language
                            </span>
                            <select
                              className={selectClass}
                              value={lang}
                              onChange={(e) => changeLanguage(e.target.value)}
                              disabled={analyzing}
                            >
                              {PULSE_LANGUAGES.map((l) => (
                                <option key={l.code} value={l.code}>
                                  {l.native}
                                  {l.native !== l.name ? ` · ${l.name}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>

                          {ttsAvailable && (
                            <div className="min-w-0">
                              <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                                <Volume2 className="h-3 w-3" />
                                Voice
                              </span>
                              <div className="flex h-9 items-center rounded-md border border-line bg-panel px-2.5 text-[12px] text-ink-muted">
                                {gnaniTtsVoice(lang)?.voice} · Gnani Timbre v3.0
                              </div>
                            </div>
                          )}
                        </div>

                        {!ttsAvailable ? (
                          <p className="mt-3 text-[11px] leading-4 text-ink-faint">
                            Read-aloud covers English and the nine Indian
                            languages supported by Gnani. The written briefing is
                            still available in this language.
                          </p>
                        ) : (
                          <>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {(player.state === "idle" ||
                                player.state === "loading") && (
                                <Button
                                  size="sm"
                                  onClick={() => void handleListen()}
                                  disabled={
                                    !activeBrief ||
                                    speechLoading ||
                                    player.state === "loading"
                                  }
                                >
                                  {speechLoading ||
                                  player.state === "loading" ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <Play />
                                  )}
                                  {speechLoading
                                    ? "Writing the script…"
                                    : player.state === "loading"
                                      ? "Preparing audio…"
                                      : "Listen to briefing"}
                                </Button>
                              )}
                              {player.state === "playing" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={player.pause}
                                >
                                  <Pause />
                                  Pause
                                </Button>
                              )}
                              {player.state === "paused" && (
                                <Button
                                  size="sm"
                                  onClick={() => void player.resume()}
                                >
                                  <Play />
                                  Resume
                                </Button>
                              )}
                              {player.state !== "idle" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={player.stop}
                                >
                                  <Square />
                                  Stop
                                </Button>
                              )}
                              {player.state !== "idle" && (
                                <div className="h-1 min-w-16 flex-1 overflow-hidden rounded-full bg-cream-deep">
                                  <div
                                    className="h-full rounded-full bg-clay transition-all"
                                    style={{
                                      width: `${Math.max(
                                        4,
                                        player.progress * 100
                                      )}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                            <p className="mt-2.5 text-[11px] leading-4 text-ink-faint">
                              Spoken by {gnaniTtsVoice(lang)?.voice} with Gnani
                              Timbre v3.0.
                            </p>
                          </>
                        )}

                        {speechScript && speechScript.language === lang && (
                          <details className="mt-3 group">
                            <summary className="cursor-pointer text-[11px] font-medium text-ink-muted hover:text-ink">
                              Read the spoken script
                            </summary>
                            <p className="mt-2 text-[12px] leading-5 text-ink-soft">
                              {speechScript.script}
                            </p>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="paper-noise relative overflow-hidden rounded-2xl border border-line bg-panel px-5 py-10 text-center shadow-paper sm:px-10">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-cream">
                    {analyzing ? (
                      <Loader2 className="h-5 w-5 animate-spin text-clay" />
                    ) : (
                      <Activity className="h-5 w-5 text-clay" strokeWidth={1.6} />
                    )}
                  </div>
                  <p className="font-display text-[30px] leading-tight tracking-[-0.02em] sm:text-[36px]">
                    {analyzing
                      ? "Reading the lecture…"
                      : "Class Pulse could not read this lecture."}
                  </p>
                  <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-ink-muted">
                    {analyzing
                      ? "Finding the topics, the likely confusion points and the pace. This usually takes a few seconds."
                      : error ||
                        "Something went wrong while reading the transcript."}
                  </p>
                  {!analyzing && (
                    <Button
                      size="sm"
                      className="mt-5"
                      onClick={() => void runAnalysis()}
                    >
                      Try again
                    </Button>
                  )}
                </section>
              )}

              {/* ---------- Lecture map ---------- */}
              {analysis && (
                <section>
                  <SectionTitle
                    title="Lecture map"
                    note="Topics in the order you taught them"
                  />
                  <div className="rounded-xl border border-line bg-panel p-4 shadow-paper sm:p-5">
                    <LectureMap
                      topics={analysis.topics}
                      analysis={analysis}
                      pace={pace}
                      timeline={timeline}
                      nameOf={nameOf}
                    />
                  </div>
                </section>
              )}

              {/* ---------- Confusion ---------- */}
              {analysis && (
                <section>
                  <SectionTitle
                    title="Where students likely got lost"
                    note={
                      analysis.confusion.length > 0
                        ? `${analysis.confusion.length} moment${
                            analysis.confusion.length === 1 ? "" : "s"
                          } worth revisiting`
                        : undefined
                    }
                  />
                  {analysis.confusion.length === 0 ? (
                    <div className="rounded-xl border border-line bg-sage-soft px-5 py-6 text-[13px] leading-6 text-sage">
                      Nothing in this transcript clearly shows students getting
                      lost. That is a good sign, but it only covers what was
                      said out loud.
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {analysis.confusion.map((point) => {
                        const text = activeBrief?.confusion[point.id];
                        return (
                          <article
                            key={point.id}
                            className="flex flex-col rounded-xl border border-line bg-panel p-4 shadow-paper"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[10px] text-panel">
                                {formatClock(point.time)}
                              </span>
                              <span className="rounded-full bg-cream-deep px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                                {KIND_LABEL[point.kind]}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  point.basis === "observed"
                                    ? "bg-sage-soft text-sage"
                                    : "bg-amber-50 text-amber-800"
                                }`}
                              >
                                {point.basis === "observed" ? "Observed" : "Predicted"}
                              </span>
                              <span
                                className="ml-auto flex gap-0.5"
                                title={`Severity ${point.severity} of 3`}
                              >
                                {[1, 2, 3].map((n) => (
                                  <span
                                    key={n}
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      n <= point.severity ? "bg-clay" : "bg-line-strong"
                                    }`}
                                  />
                                ))}
                              </span>
                            </div>
                            {point.topic && (
                              <p className="mt-2.5 text-[11px] text-ink-faint">
                                During{" "}
                                {(() => {
                                  const topic = analysis.topics.find(
                                    (t) => t.name === point.topic
                                  );
                                  return topic ? nameOf(topic) : point.topic;
                                })()}
                              </p>
                            )}
                            <blockquote className="mt-2 border-l-2 border-clay/40 pl-3 text-[13px] italic leading-5 text-ink-soft">
                              {`“${point.evidence}”`}
                            </blockquote>
                            <p className="mt-2.5 text-[13px] leading-5 text-ink">
                              {text?.why || point.why}
                            </p>
                            {(text?.fix || point.fix) && (
                              <div className="mt-3 rounded-lg bg-sage-soft px-3 py-2.5">
                                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-sage">
                                  Say this next class
                                </p>
                                <p className="mt-1 text-[12px] leading-5 text-ink-soft">
                                  {text?.fix || point.fix}
                                </p>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* ---------- Pace ---------- */}
              <section>
                <SectionTitle
                  title="Speaking pace"
                  note="Words per minute, measured from the recording"
                />
                {pace.timing === "estimated" && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] leading-4 text-amber-800">
                    This recording has no per-line timing, so pace is estimated
                    from its total length and will look flat.
                  </div>
                )}
                <div className="rounded-xl border border-line bg-panel p-4 shadow-paper sm:p-5">
                  <PaceChart pace={pace} />
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      {
                        label: "Average pace",
                        value: `${pace.avgWpm}`,
                        unit: "wpm",
                        sub: `${pace.speakingWpm} while speaking`,
                      },
                      {
                        label: "In the fast zone",
                        value: `${Math.round(pace.fastShare * 100)}`,
                        unit: "%",
                        sub: `${Math.round(pace.burstShare * 100)}% at burst speed`,
                      },
                      {
                        label: "Wait pauses",
                        value: `${pace.waitPauses}`,
                        unit: "",
                        sub: "silences of 3s or more",
                      },
                      {
                        label: "Longest pause",
                        value: `${Math.round(pace.longestPause)}`,
                        unit: "s",
                        sub: "time to think",
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg bg-cream px-3 py-2.5"
                      >
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                          {stat.label}
                        </p>
                        <p className="mt-1 font-display text-[26px] leading-none tabular-nums">
                          {stat.value}
                          <span className="ml-0.5 text-[12px] text-ink-muted">
                            {stat.unit}
                          </span>
                        </p>
                        <p className="mt-1 text-[10px] text-ink-faint">{stat.sub}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                      <Gauge className="h-3 w-3" />
                      Cognitive overload windows
                    </p>
                    {pace.bursts.length === 0 ? (
                      <p className="text-[12px] leading-5 text-ink-muted">
                        No stretch of this lecture stayed above burst speed. A
                        comfortable lecturing pace is roughly 120 to 160 words
                        per minute.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {pace.bursts.map((burst, i) => (
                          <li
                            key={i}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-clay/15 bg-clay-soft/60 px-3 py-2 text-[12px]"
                          >
                            <span className="font-mono text-clay-deep">
                              {formatClock(burst.start)}–{formatClock(burst.end)}
                            </span>
                            <span className="text-ink-soft">
                              peaked at {burst.peakWpm} wpm
                            </span>
                            {burstTopics[i] && (
                              <span className="text-ink-muted">
                                while covering {burstTopics[i]}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>

              {/* ---------- Time vs importance ---------- */}
              {analysis && (
                <section>
                  <SectionTitle
                    title="Time vs importance"
                    note="Bar is time spent, tick is time it deserved"
                  />
                  {activeBrief?.balanceNote && (
                    <p className="mb-3 rounded-lg border border-line bg-cream px-4 py-3 text-[13px] leading-5 text-ink-soft">
                      {activeBrief.balanceNote}
                    </p>
                  )}
                  <div className="space-y-3">
                    {analysis.topics.map((topic, i) => {
                      const style = STATUS_STYLE[topic.status];
                      return (
                        <div
                          key={topic.id}
                          className="rounded-xl border border-line bg-panel p-4 shadow-paper"
                        >
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: TOPIC_COLORS[i % TOPIC_COLORS.length],
                              }}
                            />
                            <h3 className="min-w-0 text-[14px] font-medium text-ink">
                              {nameOf(topic)}
                            </h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}
                            >
                              {style.label}
                            </span>
                            <span className="ml-auto font-mono text-[12px] tabular-nums text-ink-muted">
                              {formatMinutes(topic.seconds)} min ·{" "}
                              {Math.round(topic.share * 100)}%
                            </span>
                          </div>
                          <div className="relative mt-3.5 h-2.5 rounded-full bg-cream-deep">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, topic.share * 100)}%`,
                                backgroundColor: style.bar,
                              }}
                            />
                            <div
                              className="absolute -top-[3px] h-4 w-0.5 rounded bg-ink"
                              style={{
                                left: `${Math.min(99.5, topic.expectedShare * 100)}%`,
                              }}
                              title={`Deserved about ${Math.round(
                                topic.expectedShare * 100
                              )}%`}
                            />
                          </div>
                          <p className="mt-2.5 text-[11px] leading-4 text-ink-faint">
                            Deserved about {Math.round(topic.expectedShare * 100)}%
                            {topicWhy(topic) ? ` · ${topicWhy(topic)}` : ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <p className="pb-2 text-center text-[10px] leading-4 text-ink-faint">
                Pace, pauses and time per topic are measured from the recording.
                Confusion points marked &quot;Predicted&quot; are the model&apos;s
                judgement from the transcript, not something students said.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entry                                                               */
/* ------------------------------------------------------------------ */

function PulseRouter() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  return id ? <PulseDetail key={id} id={id} /> : <PulseList />;
}

export default function PulsePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-[12px] text-ink-faint">Loading…</p>
        </div>
      }
    >
      <PulseRouter />
    </Suspense>
  );
}
