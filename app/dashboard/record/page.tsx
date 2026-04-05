"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mic, Square, Loader2 } from "lucide-react";
import { useTranscription } from "@/hooks/useTranscription";
import { useRecordings } from "@/hooks/useRecordings";
import { Button } from "@/components/ui/button";

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
    startRecording, 
    stopRecording, 
    error 
  } = useTranscription();
  
  const { fetchRecordingsByDate, formatDuration } = useRecordings();

  const getLang = (code: string) => ({
    "en-IN": "EN", "hi-IN": "HI", "bn-IN": "BN", "ta-IN": "TA",
    "te-IN": "TE", "gu-IN": "GU", "kn-IN": "KN", "ml-IN": "ML",
    "mr-IN": "MR", "pa-IN": "PA", "od-IN": "OD"
  })[code] || code;

  const handleStartRecording = async () => {
    const title = lectureTitle.trim() || `Lecture ${new Date().toLocaleString("en-US", { 
      month: "short", 
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    })}`;
    setShowTitleInput(false);
    await startRecording(title);
  };

  const handleStopRecording = async () => {
    const recording = await stopRecording();
    if (recording) {
      // Refresh the recordings list
      await fetchRecordingsByDate();
      // Navigate to the transcript page for this recording
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

  return (
    <div className="h-full flex flex-col">
      <header className="h-14 flex items-center px-8 border-b border-[#e8e8e8] shrink-0">
        <h1 className="text-[13px] font-medium text-[#111]">Record Lecture</h1>
        {detectedLanguage && (
          <span className="ml-3 text-[11px] font-mono text-[#999]">{getLang(detectedLanguage)}</span>
        )}
        {isRecording && (
          <span className="ml-3 text-[13px] font-mono text-[#ef4444] tabular-nums">
            {formatDuration(recordingDuration)}
          </span>
        )}
        {error && <span className="ml-auto text-[11px] text-[#ef4444]">{error}</span>}
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        {/* Title input before recording */}
        {showTitleInput && !isRecording && !isProcessing && (
          <div className="flex flex-col items-center gap-4 mb-4">
            <input
              type="text"
              placeholder="Lecture title (optional)"
              value={lectureTitle}
              onChange={(e) => setLectureTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartRecording()}
              className="w-64 px-4 py-2 text-[13px] border border-[#ddd] rounded-md focus:outline-none focus:border-[#999] bg-white"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTitleInput(false)}
                className="text-[12px] text-[#999]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleStartRecording}
                className="text-[12px] bg-[#111] text-white hover:bg-[#333]"
              >
                Start Recording
              </Button>
            </div>
          </div>
        )}

        {/* Processing state */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-4">
            <div className="h-20 w-20 rounded-full flex items-center justify-center bg-[#f0f0f0] border border-[#ddd]">
              <Loader2 className="h-6 w-6 text-[#f97316] animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-[13px] text-[#666]">Processing recording...</p>
              <p className="text-[11px] text-[#999] mt-1">Analyzing speakers and generating insights</p>
            </div>
          </div>
        )}

        {/* Record button */}
        {!isProcessing && (
          <button
            onClick={handleRecordClick}
            className="group relative"
            disabled={showTitleInput}
          >
            {isRecording && (
              <div className="absolute inset-0 rounded-full bg-[#ef4444]/10 animate-pulse" style={{ margin: "-12px" }} />
            )}
            <div className={`h-20 w-20 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording
                ? "bg-[#ef4444] hover:bg-[#dc2626]"
                : showTitleInput
                  ? "bg-[#e8e8e8] border border-[#ddd] opacity-50"
                  : "bg-[#f0f0f0] hover:bg-[#e8e8e8] border border-[#ddd]"
            }`}>
              {isRecording ? (
                <Square className="h-6 w-6 text-white" fill="white" />
              ) : (
                <Mic className="h-6 w-6 text-[#666]" strokeWidth={1.5} />
              )}
            </div>
          </button>
        )}

        {/* Audio visualization */}
        {isRecording && (
          <div className="flex items-center gap-[3px] h-12">
            {[...Array(40)].map((_, i) => (
              <motion.div
                key={i}
                className="w-[2px] rounded-full bg-[#f97316]"
                animate={{
                  height: [3, 4 + Math.random() * (audioLevel * 0.4), 3],
                  opacity: [0.3, 0.5 + (audioLevel / 200), 0.3]
                }}
                transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.015 }}
              />
            ))}
          </div>
        )}

        {/* Instructions */}
        {!isRecording && !isProcessing && !showTitleInput && liveTranscripts.length === 0 && (
          <p className="text-[13px] text-[#bbb]">Click to start a new lecture recording</p>
        )}
      </div>

      {/* Live transcript feed */}
      {liveTranscripts.length > 0 && !isProcessing && (
        <div className="border-t border-[#e8e8e8] max-h-[240px] overflow-y-auto">
          <div className="px-8 py-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-[#bbb]">Live Transcript</span>
              <span className="text-[11px] font-mono text-[#ccc]">{liveTranscripts.length} segments</span>
            </div>
            {[...liveTranscripts].reverse().slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-baseline gap-3">
                <span className="text-[10px] font-mono text-[#ccc] shrink-0 w-6">{getLang(t.languageCode)}</span>
                <p className={`text-[13px] leading-relaxed ${i === 0 ? "text-[#333]" : "text-[#999]"}`}>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
