"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Mic, FileText, BarChart3, Settings, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useTranscription } from "@/hooks/useTranscription";
import { RecordingsProvider, useRecordingsContext } from "@/contexts/RecordingsContext";

const nav = [
  { href: "/dashboard/record", icon: Mic, label: "Record" },
  { href: "/dashboard/transcript", icon: FileText, label: "Transcripts" },
  { href: "/dashboard/insights", icon: BarChart3, label: "Insights" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

const emptySubscribe = () => () => {};

function DashboardSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // `false` during server render / hydration, `true` once mounted on the client.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);
  const { isRecording, isConnected, isProcessing, liveTranscripts, recordingDuration } = useTranscription();
  const { 
    recordingsByDate, 
    hasRecordingsOnDate, 
    setSelectedDate, 
    selectedDate,
    clearDateFilter,
  } = useRecordingsContext();

  // Handle calendar date selection - clicking a date sets it as filter
  const handleDateSelect = (date: Date | undefined) => {
    setCalendarDate(date);
    if (date) {
      // Check if clicking the same date again (toggle off filter)
      if (selectedDate && date.toISOString().split("T")[0] === selectedDate.toISOString().split("T")[0]) {
        clearDateFilter();
      } else {
        setSelectedDate(date);
      }
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  // Get count of recordings for badge
  const totalRecordings = recordingsByDate.dates.length > 0 
    ? Object.values(recordingsByDate.grouped).flat().length 
    : 0;

  // Format selected date for display
  const formatSelectedDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = date.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    if (dateStr === todayStr) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex h-screen bg-[#fafafa]">
      <aside className="w-64 border-r border-[#e8e8e8] flex flex-col bg-[#fafafa]">
        <div className="h-14 flex items-center px-5 border-b border-[#e8e8e8]">
          <span className="text-[13px] font-medium tracking-tight text-[#999]">
            lecture<span className="text-[#222]">/</span>notes
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-sm transition-colors ${
                  active
                    ? "bg-[#f0f0f0] text-[#111]"
                    : "text-[#888] hover:text-[#555] hover:bg-[#f5f5f5]"
                }`}
              >
                <item.icon className="h-4 w-4" strokeWidth={1.5} />
                {item.label}
                {item.href === "/dashboard/record" && isRecording && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ef4444] animate-pulse" />
                  </span>
                )}
                {item.href === "/dashboard/transcript" && totalRecordings > 0 && (
                  <span className="ml-auto text-[11px] font-mono text-[#bbb]">
                    {totalRecordings}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-[#e8e8e8] space-y-3">
          {isRecording && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-[#bbb]">Rec</span>
              <span className="text-[13px] font-mono text-[#111] tabular-nums">
                {fmt(recordingDuration)}
              </span>
            </div>
          )}
          {isRecording && liveTranscripts.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-[#bbb]">Segments</span>
              <span className="text-[13px] font-mono text-[#666] tabular-nums">
                {liveTranscripts.length}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest text-[#bbb]">Status</span>
            <div className="flex items-center gap-1.5">
              <div className={`h-1.5 w-1.5 rounded-full ${
                isRecording ? "bg-[#ef4444]" : isProcessing ? "bg-[#f97316] animate-pulse" : isConnected ? "bg-[#f97316]" : "bg-[#ddd]"
              }`} />
              <span className="text-[11px] text-[#999]">
                {isRecording ? "Recording" : isProcessing ? "Processing" : isConnected ? "Connected" : "Idle"}
              </span>
            </div>
          </div>
          
          {/* Date filter indicator */}
          {selectedDate && (
            <div className="flex items-center justify-between py-2 px-3 bg-[#fff7ed] border border-[#fed7aa] rounded-md">
              <span className="text-[11px] text-[#c2410c]">
                Showing: {formatSelectedDate(selectedDate)}
              </span>
              <button 
                onClick={clearDateFilter}
                className="text-[#c2410c] hover:text-[#9a3412] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          
          <div className="pt-2 border-t border-[#e8e8e8]">
            {mounted ? (
              <Calendar
                mode="single"
                selected={calendarDate}
                onSelect={handleDateSelect}
                className="w-full"
                modifiers={{
                  hasRecording: (day) => hasRecordingsOnDate(day),
                  isSelected: (day) => selectedDate ? day.toISOString().split("T")[0] === selectedDate.toISOString().split("T")[0] : false,
                }}
                modifiersStyles={{
                  hasRecording: {
                    fontWeight: "bold",
                    textDecoration: "underline",
                    textDecorationColor: "#f97316",
                    textUnderlineOffset: "3px",
                  },
                }}
              />
            ) : (
              <div className="h-[280px] flex items-center justify-center">
                <span className="text-[11px] text-[#ccc]">Loading calendar...</span>
              </div>
            )}
            <p className="text-[10px] text-[#bbb] mt-2 text-center">
              Click a date to filter recordings
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RecordingsProvider>
      <DashboardSidebar>{children}</DashboardSidebar>
    </RecordingsProvider>
  );
}
