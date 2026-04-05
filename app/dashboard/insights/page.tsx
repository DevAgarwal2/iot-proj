"use client";

import { useEffect, Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
  Filter
} from "lucide-react";
import { useRecordingsContext, RecordingSummary } from "@/contexts/RecordingsContext";
import type { TranscriptSegment } from "@/hooks/useTranscription";

function InsightsContent() {
  const searchParams = useSearchParams();
  const recordingIdFromUrl = searchParams.get("id");

  const {
    recordingsByDate,
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
    return filteredRecordings.filter(r => 
      r.title.toLowerCase().includes(query)
    );
  }, [filteredRecordings, searchQuery]);

  // Group filtered recordings by date for display
  const groupedFilteredRecordings = useMemo(() => {
    const grouped: Record<string, RecordingSummary[]> = {};
    searchFilteredRecordings.forEach(recording => {
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

  const handleStartEditTitle = (recording: RecordingSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRecordingId(recording.id);
    setEditingRecordingTitle(recording.title);
  };

  // Recording list view
  if (!selectedRecording) {
    return (
      <div className="h-full flex flex-col">
        <header className="h-14 flex items-center justify-between px-8 border-b border-[#e8e8e8] shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[13px] font-medium text-[#111]">Insights</h1>
            {selectedDate && (
              <span className="flex items-center gap-1.5 text-[11px] text-[#c2410c] bg-[#fff7ed] px-2 py-0.5 rounded-full border border-[#fed7aa]">
                <Filter className="h-3 w-3" />
                {getDateLabel(selectedDate)}
                <button 
                  onClick={clearDateFilter}
                  className="hover:text-[#9a3412] transition-colors ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <span className="text-[11px] text-[#999]">
              {searchFilteredRecordings.length} recording{searchFilteredRecordings.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#999]" />
            <Input
              type="text"
              placeholder="Search recordings..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="h-8 w-64 pl-8 text-[12px] border-[#e8e8e8] focus:border-[#999] focus:ring-0"
            />
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-[13px] text-[#999]">Loading...</p>
            </div>
          ) : searchFilteredRecordings.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <BarChart3 className="h-8 w-8 text-[#ddd] mb-3" strokeWidth={1} />
              <p className="text-[13px] text-[#bbb]">
                {searchQuery 
                  ? "No recordings match your search" 
                  : selectedDate 
                    ? "No recordings on this date" 
                    : "No recordings yet"}
              </p>
              <p className="text-[11px] text-[#ccc] mt-1">
                {searchQuery 
                  ? "Try a different search term" 
                  : selectedDate
                    ? "Select a different date or clear the filter"
                    : "Start a new recording to see insights here"}
              </p>
              {selectedDate && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearDateFilter}
                  className="mt-3 text-[11px] text-[#666] hover:text-[#333]"
                >
                  Clear date filter
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="px-8 py-6">
                {Object.entries(groupedFilteredRecordings)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([dateKey, recordings]) => (
                    <div key={dateKey} className="mb-6">
                      <div className="flex items-center gap-3 mb-3">
                        <Calendar className="h-3.5 w-3.5 text-[#bbb]" />
                        <h2 className="text-[11px] font-medium text-[#999] uppercase tracking-wider">
                          {formatDateGroup(dateKey)}
                        </h2>
                        <div className="flex-1 h-px bg-[#f0f0f0]" />
                      </div>
                      <div className="space-y-2">
                        {recordings
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((recording: RecordingSummary) => (
                          <div
                            key={recording.id}
                            className="w-full text-left p-4 border border-[#e8e8e8] rounded-lg hover:border-[#ccc] hover:bg-[#fafafa] transition-colors group"
                          >
                            <div className="flex items-start justify-between">
                              <div 
                                className="flex-1 cursor-pointer"
                                onClick={() => fetchRecording(recording.id)}
                              >
                                {editingRecordingId === recording.id ? (
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={editingRecordingTitle}
                                      onChange={(e) => setEditingRecordingTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveListTitle(recording.id);
                                        if (e.key === "Escape") setEditingRecordingId(null);
                                      }}
                                      className="h-7 px-2 text-[14px] font-medium border border-[#ddd] rounded focus:outline-none focus:border-[#999] flex-1"
                                      autoFocus
                                    />
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={() => handleSaveListTitle(recording.id)} 
                                      className="h-7 w-7 p-0"
                                    >
                                      <Check className="h-3.5 w-3.5 text-[#16a34a]" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      onClick={() => setEditingRecordingId(null)} 
                                      className="h-7 w-7 p-0"
                                    >
                                      <X className="h-3.5 w-3.5 text-[#999]" />
                                    </Button>
                                  </div>
                                ) : (
                                  <h3 className="text-[14px] font-medium text-[#333] group-hover:text-[#111]">
                                    {recording.title}
                                  </h3>
                                )}
                                <div className="flex items-center gap-4 mt-2">
                                  <span className="flex items-center gap-1.5 text-[11px] text-[#999]">
                                    <Clock className="h-3 w-3" />
                                    {formatDateTime(recording.date)}
                                  </span>
                                  <span className="text-[11px] text-[#bbb]">
                                    {formatDuration(recording.duration)}
                                  </span>
                                  <span className="flex items-center gap-1.5 text-[11px] text-[#999]">
                                    <FileText className="h-3 w-3" />
                                    {recording.segmentCount} segments
                                  </span>
                                  {recording.speakerCount > 0 && (
                                    <span className="flex items-center gap-1.5 text-[11px] text-[#999]">
                                      <Users className="h-3 w-3" />
                                      {recording.speakerCount} speakers
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {recording.hasInsights ? (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#dbeafe] text-[#2563eb]">
                                    Has Insights
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#f3f4f6] text-[#6b7280]">
                                    No Insights
                                  </span>
                                )}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleStartEditTitle(recording, e)}
                                    className="h-7 w-7 p-0 text-[#999] hover:text-[#333] hover:bg-[#f0f0f0]"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleDeleteRecording(recording.id, e)}
                                    className="h-7 w-7 p-0 text-[#999] hover:text-[#ef4444] hover:bg-[#fef2f2]"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
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
    <div className="h-full flex flex-col">
      <header className="h-14 flex items-center justify-between px-8 border-b border-[#e8e8e8] shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRecording(null)}
            className="h-7 px-2 text-[11px] text-[#999] hover:text-[#333] hover:bg-[#f0f0f0] -ml-2"
          >
            <ChevronLeft className="h-3 w-3 mr-1" />
            Back
          </Button>
          <div className="h-4 w-px bg-[#e8e8e8]" />
          <h1 className="text-[13px] font-medium text-[#111]">{selectedRecording.title}</h1>
          <span className="text-[11px] text-[#bbb]">{formatDateTime(selectedRecording.date)}</span>
          {insights && (
            <span className="text-[10px] font-mono text-[#ccc] uppercase">sarvam-105b</span>
          )}
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => handleDeleteRecording(selectedRecording.id)} 
          className="h-7 px-2 text-[11px] text-[#999] hover:text-[#ef4444] hover:bg-[#fef2f2]"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </header>

      <div className="flex-1 overflow-hidden">
        {!insights ? (
          <div className="h-full flex flex-col items-center justify-center">
            <BarChart3 className="h-8 w-8 text-[#ddd] mb-3" strokeWidth={1} />
            <p className="text-[13px] text-[#bbb]">No insights generated</p>
            <p className="text-[11px] text-[#ccc] mt-1">Insights are generated automatically after recording</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-8 py-8 max-w-3xl">
              {/* Stats */}
              <div className="flex gap-8 mb-10">
                {[
                  { label: "Duration", value: formatDuration(selectedRecording.duration), icon: Clock },
                  { label: "Segments", value: selectedRecording.segments.length.toString(), icon: MessageSquare },
                  { label: "Words", value: wordCount.toString(), icon: FileText },
                  { label: "Speakers", value: (selectedRecording.speakers?.length || 0).toString(), icon: Users },
                  { label: "Topics", value: (insights.topics?.length || 0).toString(), icon: Tag },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <stat.icon className="h-3 w-3 text-[#bbb]" />
                      <span className="text-[10px] uppercase tracking-widest text-[#bbb]">{stat.label}</span>
                    </div>
                    <span className="text-[20px] font-mono text-[#111] tabular-nums">{stat.value}</span>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <section className="mb-10">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-4 w-4 text-[#f97316]" />
                  <span className="text-[10px] uppercase tracking-widest text-[#bbb]">Summary</span>
                </div>
                <p className="text-[15px] leading-[1.8] text-[#444]">{insights.summary}</p>
              </section>

              {/* Key Points */}
              {insights.keyPoints && insights.keyPoints.length > 0 && (
                <section className="mb-10">
                  <span className="text-[10px] uppercase tracking-widest text-[#bbb] block mb-4">Key Points</span>
                  <div className="space-y-3">
                    {insights.keyPoints.map((point: string, i: number) => (
                      <div key={i} className="flex gap-4 items-baseline">
                        <span className="text-[11px] font-mono text-[#f97316] shrink-0 w-4 text-right">{i + 1}</span>
                        <p className="text-[13px] leading-[1.7] text-[#555]">{point}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Topics */}
              {insights.topics && insights.topics.length > 0 && (
                <section className="mb-10">
                  <span className="text-[10px] uppercase tracking-widest text-[#bbb] block mb-4">Topics</span>
                  <div className="flex flex-wrap gap-2">
                    {insights.topics.map((topic: string, i: number) => (
                      <span
                        key={i}
                        className="text-[12px] text-[#666] bg-[#f5f5f5] border border-[#e8e8e8] px-3 py-1.5 rounded-sm"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Speaker breakdown */}
              {selectedRecording.speakers && selectedRecording.speakers.length > 0 && (
                <section className="mb-10">
                  <span className="text-[10px] uppercase tracking-widest text-[#bbb] block mb-4">Speaker Breakdown</span>
                  <div className="space-y-3">
                    {selectedRecording.speakers.map((speaker) => {
                      const speakerSegments = selectedRecording.segments.filter(
                        (s: TranscriptSegment) => s.speakerId === speaker.id
                      );
                      const speakerWords = speakerSegments.reduce(
                        (acc: number, s: TranscriptSegment) => acc + s.text.split(/\s+/).length, 
                        0
                      );
                      const percentage = wordCount > 0 ? Math.round((speakerWords / wordCount) * 100) : 0;

                      return (
                        <div key={speaker.id} className="flex items-center gap-4">
                          <div 
                            className="h-3 w-3 rounded-full shrink-0" 
                            style={{ backgroundColor: speaker.color }}
                          />
                          <span className="text-[13px] text-[#555] w-32">
                            {speaker.name || speaker.label}
                          </span>
                          <div className="flex-1 h-2 bg-[#f0f0f0] rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all"
                              style={{ 
                                width: `${percentage}%`,
                                backgroundColor: speaker.color,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-[#999] w-12 text-right">
                            {percentage}%
                          </span>
                          <span className="text-[11px] text-[#ccc] w-20 text-right">
                            {speakerWords} words
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
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <p className="text-[13px] text-[#999]">Loading...</p>
      </div>
    }>
      <InsightsContent />
    </Suspense>
  );
}
