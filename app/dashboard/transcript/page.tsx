"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Copy,
  Download,
  FileText,
  ChevronLeft,
  Calendar,
  Clock,
  Users,
  Trash2,
  Pencil,
  Check,
  X,
  Search,
  Filter,
  ArrowRight,
  Mic,
} from "lucide-react";
import { useRecordingsContext, RecordingSummary } from "@/contexts/RecordingsContext";
import type { TranscriptSegment, Speaker } from "@/hooks/useTranscription";

const statusStyles: Record<string, string> = {
  completed: "bg-sage-soft text-sage",
  processing: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  recording: "bg-cream-deep text-ink-muted",
};

function TranscriptContent() {
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
    updateSpeakerName,
    getDateLabel,
    formatDuration,
    setSelectedRecording,
    filteredRecordings,
    clearDateFilter,
  } = useRecordingsContext();

  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // For inline editing in list view
  const [editingRecordingId, setEditingRecordingId] = useState<string | null>(null);
  const [editingRecordingTitle, setEditingRecordingTitle] = useState("");

  // Load recording from URL param
  useEffect(() => {
    if (recordingIdFromUrl) {
      fetchRecording(recordingIdFromUrl);
    }
  }, [recordingIdFromUrl, fetchRecording]);

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

  const copyTranscript = () => {
    if (!selectedRecording) return;
    const text = selectedRecording.segments
      .map((s: TranscriptSegment) => {
        const speakerLabel = s.speaker?.name || s.speaker?.label || "";
        return speakerLabel ? `[${speakerLabel}] ${s.text}` : s.text;
      })
      .join("\n");
    navigator.clipboard.writeText(text);
  };

  const downloadTranscript = () => {
    if (!selectedRecording) return;
    const text = selectedRecording.segments
      .map((s: TranscriptSegment) => {
        const time = new Date(s.timestamp).toLocaleTimeString();
        const speakerLabel = s.speaker?.name || s.speaker?.label || "";
        return `[${time}]${speakerLabel ? ` [${speakerLabel}]` : ""} ${s.text}`;
      })
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedRecording.title.replace(/\s+/g, "_")}.txt`;
    a.click();
  };

  const handleSaveTitle = async () => {
    if (selectedRecording && newTitle.trim()) {
      await updateRecordingTitle(selectedRecording.id, newTitle.trim());
      setEditingTitle(false);
    }
  };

  const handleSaveSpeakerName = async () => {
    if (selectedRecording && editingSpeakerId && newSpeakerName.trim()) {
      await updateSpeakerName(
        selectedRecording.id,
        editingSpeakerId,
        newSpeakerName.trim()
      );
      setEditingSpeakerId(null);
    }
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
                Transcripts
              </h1>
              <p className="mt-1 text-[11px] text-ink-faint">
                Every lecture, written down.
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
              <p className="text-[12px] text-ink-faint">Opening the archive…</p>
            </div>
          ) : searchFilteredRecordings.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-line bg-panel shadow-paper">
                <FileText className="h-5 w-5 text-ink-faint" strokeWidth={1.4} />
              </div>
              <p className="font-display text-[34px] leading-tight tracking-[-0.02em] text-ink">
                {searchQuery
                  ? "Nothing matches that search."
                  : selectedDate
                    ? "A quiet day in the archive."
                    : "No lectures yet."}
              </p>
              <p className="mt-2 max-w-sm text-[12px] leading-5 text-ink-faint">
                {searchQuery
                  ? "Try a different title, or clear the search to see everything."
                  : selectedDate
                    ? "Pick another date or clear the filter to browse the full library."
                    : "Record your first class and its transcript will appear here."}
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
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                                      statusStyles[recording.status] ??
                                      "bg-cream-deep text-ink-muted"
                                    }`}
                                  >
                                    {recording.status}
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

  // Single recording view
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
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                  className="h-8 rounded-md border border-line bg-cream/60 px-2.5 text-[15px] font-medium text-ink outline-none focus:border-clay/50"
                  autoFocus
                />
                <Button variant="ghost" size="icon-xs" onClick={handleSaveTitle}>
                  <Check className="h-3.5 w-3.5 text-sage" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setEditingTitle(false)}
                >
                  <X className="h-3.5 w-3.5 text-ink-faint" />
                </Button>
              </div>
            ) : (
              <div className="group flex items-center gap-2">
                <h1 className="truncate font-display text-[24px] leading-none tracking-[-0.02em]">
                  {selectedRecording.title}
                </h1>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => {
                    setNewTitle(selectedRecording.title);
                    setEditingTitle(true);
                  }}
                  className="opacity-0 group-hover:opacity-100"
                  aria-label="Edit title"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-faint">
              <span>{formatDateTime(selectedRecording.date)}</span>
              <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
              <span className="font-mono">
                {formatDuration(selectedRecording.duration)}
              </span>
              <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
              <span>{selectedRecording.segments.length} lines</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyTranscript}>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadTranscript}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <div className="mx-1 h-4 w-px bg-line" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleDeleteRecording(selectedRecording.id)}
            className="hover:text-destructive"
            aria-label="Delete recording"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* Speaker legend */}
      {selectedRecording.speakers && selectedRecording.speakers.length > 0 && (
        <div className="shrink-0 border-b border-line/70 bg-cream-deep/35 px-8 py-3">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
              Speakers
            </span>
            {selectedRecording.speakers.map((speaker: Speaker) => (
              <div
                key={speaker.id}
                className="flex items-center gap-2 rounded-full border border-line bg-panel px-2.5 py-1"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: speaker.color }}
                />
                {editingSpeakerId === speaker.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newSpeakerName}
                      onChange={(e) => setNewSpeakerName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveSpeakerName()}
                      className="h-5 w-24 rounded border border-line bg-cream/60 px-1.5 text-[11px] outline-none focus:border-clay/50"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveSpeakerName}
                      className="text-sage"
                      aria-label="Save speaker name"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingSpeakerId(null)}
                      className="text-ink-faint"
                      aria-label="Cancel speaker edit"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingSpeakerId(speaker.id);
                      setNewSpeakerName(speaker.name || speaker.label);
                    }}
                    className="text-[11px] font-medium text-ink-soft transition-colors hover:text-clay-deep"
                  >
                    {speaker.name || speaker.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedRecording.segments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <FileText className="mb-3 h-7 w-7 text-ink-faint" strokeWidth={1.2} />
            <p className="font-display text-[28px] text-ink">
              This recording has no transcript.
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">
              The audio is stored — diarization may still be running.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-4xl px-8 py-8">
              {selectedRecording.segments
                .sort(
                  (a: TranscriptSegment, b: TranscriptSegment) =>
                    new Date(a.timestamp).getTime() -
                    new Date(b.timestamp).getTime()
                )
                .map((segment: TranscriptSegment, i: number) => (
                  <div
                    key={segment.id || i}
                    className="group grid grid-cols-[80px_1fr] gap-6 border-b border-line/60 py-5 last:border-0"
                  >
                    <div className="flex flex-col items-start gap-1.5 pt-0.5">
                      <span className="font-mono text-[10px] text-ink-faint tabular-nums">
                        {new Date(segment.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      {segment.speaker && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-medium"
                          style={{
                            backgroundColor: `${segment.speaker.color}18`,
                            color: segment.speaker.color,
                          }}
                        >
                          {segment.speaker.name || segment.speaker.label}
                        </span>
                      )}
                      <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-ink-faint/70">
                        {getLang(segment.languageCode).slice(0, 2)}
                      </span>
                    </div>
                    <p className="text-[15px] leading-8 text-ink-soft transition-colors group-hover:text-ink">
                      {segment.text}
                    </p>
                  </div>
                ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

export default function TranscriptPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-[12px] text-ink-faint">Loading…</p>
        </div>
      }
    >
      <TranscriptContent />
    </Suspense>
  );
}
