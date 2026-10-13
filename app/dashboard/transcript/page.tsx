"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
  Filter
} from "lucide-react";
import { useRecordingsContext, RecordingSummary } from "@/contexts/RecordingsContext";
import type { TranscriptSegment, Speaker } from "@/hooks/useTranscription";

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

  const getLang = (code: string) => ({
    "en-IN": "English", "hi-IN": "Hindi", "bn-IN": "Bengali", "ta-IN": "Tamil",
    "te-IN": "Telugu", "gu-IN": "Gujarati", "kn-IN": "Kannada", "ml-IN": "Malayalam",
    "mr-IN": "Marathi", "pa-IN": "Punjabi", "od-IN": "Odia"
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
    const text = selectedRecording.segments.map((s: TranscriptSegment) => {
      const speakerLabel = s.speaker?.name || s.speaker?.label || "";
      return speakerLabel ? `[${speakerLabel}] ${s.text}` : s.text;
    }).join("\n");
    navigator.clipboard.writeText(text);
  };

  const downloadTranscript = () => {
    if (!selectedRecording) return;
    const text = selectedRecording.segments.map((s: TranscriptSegment) => {
      const time = new Date(s.timestamp).toLocaleTimeString();
      const speakerLabel = s.speaker?.name || s.speaker?.label || "";
      return `[${time}]${speakerLabel ? ` [${speakerLabel}]` : ""} ${s.text}`;
    }).join("\n");
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
      await updateSpeakerName(selectedRecording.id, editingSpeakerId, newSpeakerName.trim());
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
            <h1 className="text-[13px] font-medium text-[#111]">Transcripts</h1>
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
              <FileText className="h-8 w-8 text-[#ddd] mb-3" strokeWidth={1} />
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
                    : "Start a new recording to see transcripts here"}
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
                                <span className={`text-[10px] px-2 py-0.5 rounded ${
                                  recording.status === "completed" 
                                    ? "bg-[#dcfce7] text-[#16a34a]" 
                                    : recording.status === "processing"
                                      ? "bg-[#fef3c7] text-[#d97706]"
                                      : recording.status === "failed"
                                        ? "bg-[#fee2e2] text-[#dc2626]"
                                        : "bg-[#f3f4f6] text-[#6b7280]"
                                }`}>
                                  {recording.status}
                                </span>
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

  // Single recording view
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
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
                className="h-7 px-2 text-[13px] border border-[#ddd] rounded focus:outline-none focus:border-[#999]"
                autoFocus
              />
              <Button variant="ghost" size="sm" onClick={handleSaveTitle} className="h-7 w-7 p-0">
                <Check className="h-3 w-3 text-[#16a34a]" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingTitle(false)} className="h-7 w-7 p-0">
                <X className="h-3 w-3 text-[#999]" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h1 className="text-[13px] font-medium text-[#111]">{selectedRecording.title}</h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewTitle(selectedRecording.title);
                  setEditingTitle(true);
                }}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              >
                <Pencil className="h-2.5 w-2.5 text-[#999]" />
              </Button>
            </div>
          )}
          <span className="text-[11px] text-[#bbb]">{formatDateTime(selectedRecording.date)}</span>
          <span className="text-[11px] font-mono text-[#ccc]">{formatDuration(selectedRecording.duration)}</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={copyTranscript} className="h-7 px-2 text-[11px] text-[#999] hover:text-[#333] hover:bg-[#f0f0f0]">
            <Copy className="h-3 w-3 mr-1.5" />Copy
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadTranscript} className="h-7 px-2 text-[11px] text-[#999] hover:text-[#333] hover:bg-[#f0f0f0]">
            <Download className="h-3 w-3 mr-1.5" />Export
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => handleDeleteRecording(selectedRecording.id)} 
            className="h-7 px-2 text-[11px] text-[#999] hover:text-[#ef4444] hover:bg-[#fef2f2]"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </header>

      {/* Speaker legend */}
      {selectedRecording.speakers && selectedRecording.speakers.length > 0 && (
        <div className="px-8 py-3 border-b border-[#e8e8e8] bg-[#fafafa]">
          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-widest text-[#bbb]">Speakers</span>
            {selectedRecording.speakers.map((speaker: Speaker) => (
              <div key={speaker.id} className="flex items-center gap-2">
                <div 
                  className="h-2.5 w-2.5 rounded-full" 
                  style={{ backgroundColor: speaker.color }}
                />
                {editingSpeakerId === speaker.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newSpeakerName}
                      onChange={(e) => setNewSpeakerName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveSpeakerName()}
                      className="h-5 px-1.5 text-[11px] border border-[#ddd] rounded focus:outline-none focus:border-[#999] w-24"
                      autoFocus
                    />
                    <button onClick={handleSaveSpeakerName} className="text-[#16a34a]">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => setEditingSpeakerId(null)} className="text-[#999]">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingSpeakerId(speaker.id);
                      setNewSpeakerName(speaker.name || speaker.label);
                    }}
                    className="text-[11px] text-[#666] hover:text-[#333]"
                  >
                    {speaker.name || speaker.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {selectedRecording.segments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <FileText className="h-8 w-8 text-[#ddd] mb-3" strokeWidth={1} />
            <p className="text-[13px] text-[#bbb]">No transcript segments</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-8 py-6">
              {selectedRecording.segments
                .sort((a: TranscriptSegment, b: TranscriptSegment) => 
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                )
                .map((segment: TranscriptSegment, i: number) => (
                <div key={segment.id || i} className="flex gap-5 py-3 border-b border-[#f0f0f0] last:border-0 group">
                  <div className="flex flex-col items-end gap-1 pt-0.5 shrink-0 w-20">
                    <span className="text-[10px] font-mono text-[#ccc]">
                      {new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    {segment.speaker && (
                      <span 
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                        style={{ 
                          backgroundColor: `${segment.speaker.color}15`,
                          color: segment.speaker.color,
                        }}
                      >
                        {segment.speaker.name || segment.speaker.label}
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-[#ddd] uppercase">
                      {getLang(segment.languageCode).slice(0, 2)}
                    </span>
                  </div>
                  <p className="text-[13px] leading-[1.7] text-[#555] group-hover:text-[#333] transition-colors flex-1">
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
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <p className="text-[13px] text-[#999]">Loading...</p>
      </div>
    }>
      <TranscriptContent />
    </Suspense>
  );
}
