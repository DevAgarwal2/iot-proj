"use client";

import { useEffect, Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  ChevronLeft,
  Clock,
  FileText,
  Users,
  MessageSquare,
  Lightbulb,
  Tag,
  Trash2,
  Search,
  Calendar,
  Pencil,
  Check,
  X,
  Filter,
  Sparkles,
  Loader2,
  RefreshCw,
  ArrowRight,
  Mic,
} from "lucide-react";
import { useRecordingsContext, RecordingSummary } from "@/contexts/RecordingsContext";
import type { TranscriptSegment } from "@/hooks/useTranscription";

function InsightsContent() {
  const searchParams = useSearchParams();
  const recordingIdFromUrl = searchParams.get("id");

  const {
    selectedRecording,
    selectedDate,
    isLoading,
    fetchRecording,
    fetchRecordingsByDate,
    deleteRecording,
    updateRecordingTitle,
    getDateLabel,
    formatDuration,
    setSelectedRecording,
    filteredRecordings,
    clearDateFilter,
  } = useRecordingsContext();

  const [searchQuery, setSearchQuery] = useState("");

  // For inline editing in list view
  const [editingRecordingId, setEditingRecordingId] = useState<string | null>(null);
  const [editingRecordingTitle, setEditingRecordingTitle] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  // Generate (or regenerate) insights for the selected recording from its transcript
  const generateInsights = async () => {
    if (!selectedRecording || isGenerating) return;
    const transcript = selectedRecording.segments
      .map((s: TranscriptSegment) => s.text)
      .join(" ")
      .trim();

    if (!transcript) {
      setGenerateError("This recording has no transcript to analyse yet.");
      return;
    }

    try {
      setIsGenerating(true);
      setGenerateError("");

      const response = await fetch(
        `/api/recordings/${selectedRecording.id}/insights/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript }),
        }
      );
      if (!response.ok || !response.body) {
        throw new Error("Failed to generate insights");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
      }
      accumulated += decoder.decode();

      const match = accumulated.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Invalid insights response");
      const parsed = JSON.parse(match[0]);
      const wordCount = transcript.split(/\s+/).filter(Boolean).length;

      const save = await fetch(
        `/api/recordings/${selectedRecording.id}/insights`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: parsed.summary || "No summary available.",
            keyPoints: parsed.keyPoints || [],
            topics: parsed.topics || [],
            wordCount,
          }),
        }
      );
      if (!save.ok) throw new Error("Failed to save insights");

      await fetchRecording(selectedRecording.id);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate insights"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Load recording from URL param
  useEffect(() => {
    if (recordingIdFromUrl) {
      fetchRecording(recordingIdFromUrl);
    }
  }, [recordingIdFromUrl, fetchRecording]);

  // Refresh the list whenever this page mounts (so new recordings show up)
  useEffect(() => {
    fetchRecordingsByDate();
  }, [fetchRecordingsByDate]);

  // Apply search filter on top of date filter
  const searchFilteredRecordings = useMemo(() => {
    if (!searchQuery.trim()) return filteredRecordings;
    const query = searchQuery.toLowerCase();
    return filteredRecordings.filter((r) =>
      r.title.toLowerCase().includes(query)
    );
  }, [filteredRecordings, searchQuery]);

  // Group filtered recordings by date for display
  const groupedFilteredRecordings = useMemo(() => {
    const grouped: Record<string, RecordingSummary[]> = {};
    searchFilteredRecordings.forEach((recording) => {
      const dateKey = new Date(recording.date).toISOString().split("T")[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(recording);
    });
    return grouped;
  }, [searchFilteredRecordings]);

  const formatDateTime = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDateGroup = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    if (dateStr === todayStr) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  };

  const handleDeleteRecording = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (confirm("Are you sure you want to delete this recording?")) {
      await deleteRecording(id);
    }
  };

  const handleSaveListTitle = async (id: string) => {
    if (editingRecordingTitle.trim()) {
      await updateRecordingTitle(id, editingRecordingTitle.trim());
      await fetchRecordingsByDate();
    }
    setEditingRecordingId(null);
  };

  const handleStartEditTitle = (
    recording: RecordingSummary,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setEditingRecordingId(recording.id);
    setEditingRecordingTitle(recording.title);
  };

  // Recording list view
  if (!selectedRecording) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line/70 px-8">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-display text-[25px] leading-none tracking-[-0.02em]">
                Insights
              </h1>
              <p className="mt-1 text-[11px] text-ink-faint">
                The argument behind the lecture.
              </p>
            </div>
            {selectedDate && (
              <span className="ml-2 flex items-center gap-1.5 rounded-full border border-clay/20 bg-clay-soft px-2.5 py-1 text-[10px] font-medium text-clay-deep">
                <Filter className="h-3 w-3" />
                {getDateLabel(selectedDate)}
                <button
                  onClick={clearDateFilter}
                  className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-clay/10"
                  aria-label="Clear date filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <span className="text-[11px] text-ink-faint">
              {searchFilteredRecordings.length} recording
              {searchFilteredRecordings.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              type="text"
              placeholder="Search recordings…"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(e.target.value)
              }
              className="h-9 w-64 pl-9"
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[12px] text-ink-faint">Reading the notes…</p>
            </div>
          ) : searchFilteredRecordings.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel shadow-paper">
                <BarChart3 className="h-5 w-5 text-ink-faint" strokeWidth={1.4} />
              </div>
              <p className="font-display text-[34px] leading-tight tracking-[-0.02em] text-ink">
                {searchQuery
                  ? "Nothing matches that search."
                  : selectedDate
                    ? "A quiet day in the archive."
                    : "No insights yet."}
              </p>
              <p className="mt-2 max-w-sm text-[12px] leading-5 text-ink-faint">
                {searchQuery
                  ? "Try a different title, or clear the search to see everything."
                  : selectedDate
                    ? "Pick another date or clear the filter to browse the full library."
                    : "Record a lecture and its summary, key points and topics will live here."}
              </p>
              {selectedDate ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearDateFilter}
                  className="mt-5"
                >
                  Clear date filter
                </Button>
              ) : (
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
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-5xl px-8 py-8">
                {Object.entries(groupedFilteredRecordings)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([dateKey, recordings]) => (
                    <div key={dateKey} className="mb-8">
                      <div className="mb-3 flex items-baseline gap-3">
                        <Calendar className="h-3.5 w-3.5 text-ink-faint" />
                        <h2 className="font-display text-[20px] tracking-[-0.01em] text-ink-soft">
                          {formatDateGroup(dateKey)}
                        </h2>
                        <span className="font-mono text-[10px] text-ink-faint">
                          {recordings.length}
                        </span>
                        <div className="h-px flex-1 bg-line" />
                      </div>
                      <div className="space-y-2">
                        {recordings
                          .sort(
                            (a, b) =>
                              new Date(b.date).getTime() -
                              new Date(a.date).getTime()
                          )
                          .map((recording: RecordingSummary) => (
                            <div
                              key={recording.id}
                              className="group rounded-xl border border-line bg-panel/80 p-4 transition-all hover:border-line-strong hover:bg-panel hover:shadow-paper"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div
                                  className="min-w-0 flex-1 cursor-pointer"
                                  onClick={() => fetchRecording(recording.id)}
                                >
                                  {editingRecordingId === recording.id ? (
                                    <div
                                      className="flex items-center gap-2"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="text"
                                        value={editingRecordingTitle}
                                        onChange={(e) =>
                                          setEditingRecordingTitle(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")
                                            handleSaveListTitle(recording.id);
                                          if (e.key === "Escape")
                                            setEditingRecordingId(null);
                                        }}
                                        className="h-8 flex-1 rounded-md border border-line bg-cream/60 px-2.5 text-[15px] font-medium text-ink outline-none focus:border-clay/50"
                                        autoFocus
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() =>
                                          handleSaveListTitle(recording.id)
                                        }
                                      >
                                        <Check className="h-3.5 w-3.5 text-sage" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => setEditingRecordingId(null)}
                                      >
                                        <X className="h-3.5 w-3.5 text-ink-faint" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <h3 className="truncate font-display text-[22px] leading-tight tracking-[-0.01em] text-ink transition-colors group-hover:text-clay-deep">
                                      {recording.title}
                                    </h3>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                    <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                                      <Clock className="h-3 w-3 text-ink-faint" />
                                      {formatDateTime(recording.date)}
                                    </span>
                                    <span className="text-[11px] text-ink-faint">
                                      {formatDuration(recording.duration)}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                                      <FileText className="h-3 w-3 text-ink-faint" />
                                      {recording.segmentCount} lines
                                    </span>
                                    {recording.speakerCount > 0 && (
                                      <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                                        <Users className="h-3 w-3 text-ink-faint" />
                                        {recording.speakerCount} speakers
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      recording.hasInsights
                                        ? "bg-clay-soft text-clay-deep"
                                        : "bg-cream-deep text-ink-muted"
                                    }`}
                                  >
                                    {recording.hasInsights
                                      ? "Insight ready"
                                      : "Needs analysis"}
                                  </span>
                                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      onClick={(e) =>
                                        handleStartEditTitle(recording, e)
                                      }
                                      aria-label="Edit title"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      onClick={(e) =>
                                        handleDeleteRecording(recording.id, e)
                                      }
                                      aria-label="Delete recording"
                                      className="hover:text-destructive"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  <ArrowRight className="h-4 w-4 text-ink-faint opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    );
  }

  // Single recording insights view
  const insights = selectedRecording.insights;
  const wordCount = selectedRecording.segments.reduce(
    (acc: number, t: TranscriptSegment) => acc + t.text.split(/\s+/).length,
    0
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line/70 px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRecording(null)}
            className="-ml-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Button>
          <div className="h-4 w-px bg-line" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[24px] leading-none tracking-[-0.02em]">
                {selectedRecording.title}
              </h1>
              {insights && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={generateInsights}
                  disabled={isGenerating}
                  className="-ml-1"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Regenerate
                </Button>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-faint">
              <span>{formatDateTime(selectedRecording.date)}</span>
              <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
              <span className="font-mono">
                {formatDuration(selectedRecording.duration)}
              </span>
              {insights && (
                <>
                  <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
                  <span className="flex items-center gap-1 text-clay-deep">
                    <Sparkles className="h-3 w-3" />
                    analysed
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => handleDeleteRecording(selectedRecording.id)}
          className="hover:text-destructive"
          aria-label="Delete recording"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!insights ? (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel shadow-paper">
              <BarChart3 className="h-5 w-5 text-ink-faint" strokeWidth={1.4} />
            </div>
            <p className="font-display text-[34px] leading-tight tracking-[-0.02em] text-ink">
              No insights yet.
            </p>
            {selectedRecording.segments.length > 0 ? (
              <>
                <p className="mt-2 max-w-sm text-[12px] leading-5 text-ink-faint">
                  Ask Sarvam for the summary, key points and topics hiding in this
                  transcript.
                </p>
                <Button
                  onClick={generateInsights}
                  disabled={isGenerating}
                  className="mt-5"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {isGenerating ? "Generating…" : "Generate insights"}
                </Button>
              </>
            ) : (
              <p className="mt-2 max-w-sm text-[12px] leading-5 text-ink-faint">
                This recording has no transcript yet.
              </p>
            )}
            {generateError && (
              <p className="mt-3 text-[11px] text-destructive">{generateError}</p>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-4xl px-8 py-8">
              {/* Dossier stats */}
              <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-5">
                {[
                  { label: "Duration", value: formatDuration(selectedRecording.duration), icon: Clock },
                  { label: "Lines", value: selectedRecording.segments.length.toString(), icon: MessageSquare },
                  { label: "Words", value: wordCount.toString(), icon: FileText },
                  { label: "Speakers", value: (selectedRecording.speakers?.length || 0).toString(), icon: Users },
                  { label: "Topics", value: (insights.topics?.length || 0).toString(), icon: Tag },
                ].map((stat) => (
                  <div key={stat.label} className="bg-panel px-3.5 py-3">
                    <div className="flex items-center gap-1.5">
                      <stat.icon className="h-3 w-3 text-ink-faint" />
                      <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                        {stat.label}
                      </span>
                    </div>
                    <div className="mt-1.5 font-display text-[22px] leading-none tabular-nums text-ink">
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <section className="paper-noise relative overflow-hidden rounded-2xl border border-line bg-panel/85 p-6 shadow-paper">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-clay" strokeWidth={1.8} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                    Summary
                  </span>
                </div>
                <p className="mt-4 font-display text-[24px] leading-[1.5] tracking-[-0.01em] text-ink-soft">
                  {insights.summary}
                </p>
              </section>

              {/* Key Points */}
              {insights.keyPoints && insights.keyPoints.length > 0 && (
                <section className="mt-6 rounded-2xl border border-line bg-panel/70 p-6">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                      Key points
                    </span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  <div className="mt-4 space-y-0">
                    {insights.keyPoints.map((point: string, i: number) => (
                      <div
                        key={i}
                        className="grid grid-cols-[36px_1fr] gap-3 border-b border-line/60 py-3.5 last:border-0"
                      >
                        <span className="font-display text-[20px] leading-none text-clay">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <p className="text-[13px] leading-6 text-ink-soft">{point}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Topics */}
              {insights.topics && insights.topics.length > 0 && (
                <section className="mt-6">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                      Topics
                    </span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {insights.topics.map((topic: string, i: number) => (
                      <span
                        key={i}
                        className="rounded-full border border-line bg-panel px-3 py-1.5 text-[11px] text-ink-soft"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Speaker breakdown */}
              {selectedRecording.speakers && selectedRecording.speakers.length > 0 && (
                <section className="mt-6 rounded-2xl border border-line bg-panel/70 p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                      Speaker breakdown
                    </span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  <div className="space-y-3">
                    {selectedRecording.speakers.map((speaker) => {
                      const speakerSegments = selectedRecording.segments.filter(
                        (s: TranscriptSegment) => s.speakerId === speaker.id
                      );
                      const speakerWords = speakerSegments.reduce(
                        (acc: number, s: TranscriptSegment) =>
                          acc + s.text.split(/\s+/).length,
                        0
                      );
                      const percentage =
                        wordCount > 0
                          ? Math.round((speakerWords / wordCount) * 100)
                          : 0;

                      return (
                        <div key={speaker.id} className="flex items-center gap-3">
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: speaker.color }}
                          />
                          <span className="w-28 truncate text-[12px] font-medium text-ink-soft">
                            {speaker.name || speaker.label}
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-cream-deep">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: speaker.color,
                              }}
                            />
                          </div>
                          <span className="w-9 text-right font-mono text-[10px] text-ink-muted">
                            {percentage}%
                          </span>
                          <span className="w-16 text-right font-mono text-[10px] text-ink-faint">
                            {speakerWords} w
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-[12px] text-ink-faint">Loading…</p>
        </div>
      }
    >
      <InsightsContent />
    </Suspense>
  );
}
