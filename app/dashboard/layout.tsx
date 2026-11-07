"use client";

import { useState, useSyncExternalStore, useMemo, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Mic, FileText, BarChart3, Activity, Settings, X, ArrowUpRight, Menu } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useTranscription } from "@/hooks/useTranscription";
import { RecordingsProvider, useRecordingsContext } from "@/contexts/RecordingsContext";

const nav = [
  { href: "/dashboard/record", icon: Mic, label: "Record" },
  { href: "/dashboard/transcript", icon: FileText, label: "Transcripts" },
  { href: "/dashboard/insights", icon: BarChart3, label: "Insights" },
  { href: "/dashboard/pulse", icon: Activity, label: "Class Pulse" },
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
  // Off-canvas sidebar on small screens.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
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

  const recentRecordings = useMemo(
    () =>
      Object.values(recordingsByDate.grouped)
        .flat()
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        .slice(0, 4),
    [recordingsByDate.grouped]
  );

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

  const status = isRecording
    ? "Recording"
    : isProcessing
      ? "Processing"
      : isConnected
        ? "Connected"
        : "Idle";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-cream text-ink lg:flex-row">
      {/* Mobile top bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line/70 bg-[#f3efe7] px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-panel hover:text-ink"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.7} />
        </button>
        <span className="font-display text-[20px] leading-none tracking-[-0.02em]">
          lecture<span className="text-clay">/</span>notes
        </span>
        <span className="flex h-9 w-9 items-center justify-center">
          {isRecording && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-clay" />
          )}
        </span>
      </div>

      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[276px] max-w-[85vw] border-r border-[#e4ddd0] bg-[#f3efe7] transition-transform duration-200 ease-out lg:static lg:z-auto lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:bg-[#f3efe7]/90 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
       <div className="paper-noise flex h-full min-h-0 flex-col">
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line/70 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-ink text-panel shadow-[0_1px_0_rgba(29,25,21,0.1)]">
            <span className="font-display text-[19px] leading-none">ln</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-[21px] tracking-[-0.02em]">
              lecture<span className="text-clay">/</span>notes
            </span>
            <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-ink-faint">
              AI lecture studio
            </span>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-panel hover:text-ink lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-4 pt-5">
          <Link
            href="/dashboard/record"
            onClick={closeDrawer}
            className="group flex h-10 items-center justify-between rounded-lg bg-ink px-3.5 text-[12px] font-medium text-panel transition-all hover:bg-[#2b241d] hover:shadow-lift"
          >
            <span className="flex items-center gap-2">
              <Mic className="h-3.5 w-3.5" strokeWidth={1.8} />
              New recording
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-panel/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <nav className="mt-6 shrink-0 px-3">
          <div className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            Library
          </div>
          <div className="space-y-1">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeDrawer}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] transition-all ${
                    active
                      ? "bg-panel text-ink shadow-paper ring-1 ring-line"
                      : "text-ink-muted hover:bg-panel/55 hover:text-ink"
                  }`}
                >
                  <item.icon
                    className={`h-4 w-4 transition-colors ${
                      active ? "text-clay" : "text-ink-faint group-hover:text-ink-muted"
                    }`}
                    strokeWidth={1.7}
                  />
                  <span className="font-medium">{item.label}</span>
                  {item.href === "/dashboard/record" && isRecording && (
                    <span className="ml-auto flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
                    </span>
                  )}
                  {item.href === "/dashboard/transcript" && totalRecordings > 0 && (
                    <span className="ml-auto rounded-full bg-cream-deep px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                      {totalRecordings}
                    </span>
                  )}
                  {active && item.href !== "/dashboard/record" && (
                    <span className="ml-auto h-1 w-1 rounded-full bg-clay/70" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-7 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-1 flex-col px-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Recent
            </span>
            {recentRecordings.length > 0 && (
              <Link
                href="/dashboard/transcript"
                onClick={closeDrawer}
                className="text-[10px] font-medium text-ink-faint transition-colors hover:text-clay-deep"
              >
                All
              </Link>
            )}
          </div>

          <div className="space-y-0.5 pb-3">
            {recentRecordings.length > 0 ? (
              recentRecordings.map((recording) => (
                <Link
                  key={recording.id}
                  href={`/dashboard/transcript?id=${recording.id}`}
                  onClick={closeDrawer}
                  className="group block rounded-lg px-3 py-2.5 transition-colors hover:bg-panel/65"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        recording.status === "completed"
                          ? "bg-sage"
                          : recording.status === "processing"
                            ? "bg-amber-500"
                            : recording.status === "failed"
                              ? "bg-destructive"
                              : "bg-ink-faint/50"
                      }`}
                    />
                    <span className="truncate text-[12px] font-medium text-ink-soft transition-colors group-hover:text-ink">
                      {recording.title}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between pl-3.5">
                    <span className="text-[10px] text-ink-faint">
                      {formatSelectedDate(new Date(recording.date))}
                    </span>
                    <span className="font-mono text-[9px] text-ink-faint/80">
                      {fmt(recording.duration)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="mx-1 mt-1 rounded-lg border border-dashed border-line-strong/70 bg-panel/40 px-3 py-4">
                <p className="text-[11px] font-medium text-ink-muted">
                  No lectures yet
                </p>
                <p className="mt-1 text-[10px] leading-4 text-ink-faint">
                  Your recent recordings will sit here.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto shrink-0 space-y-3 border-t border-line/70 px-4 py-4">
          <div className="rounded-xl border border-line bg-panel/75 p-3.5 shadow-paper">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
                Studio
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-cream-deep px-2 py-0.5 text-[10px] text-ink-muted">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRecording
                      ? "bg-clay"
                      : isProcessing
                        ? "bg-amber-500"
                        : isConnected
                          ? "bg-sage"
                          : "bg-ink-faint/60"
                  }`}
                />
                {status}
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="font-display text-[30px] leading-none tabular-nums tracking-[-0.02em]">
                  {fmt(recordingDuration)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  Session time
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[15px] text-ink-soft tabular-nums">
                  {liveTranscripts.length}
                </div>
                <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  lines
                </div>
              </div>
            </div>
          </div>

          {selectedDate && (
            <div className="flex items-center justify-between rounded-lg border border-clay/20 bg-clay-soft px-3 py-2">
              <span className="text-[11px] font-medium text-clay-deep">
                Showing {formatSelectedDate(selectedDate)}
              </span>
              <button
                onClick={clearDateFilter}
                className="rounded-full p-0.5 text-clay-deep/70 transition-colors hover:bg-clay/10 hover:text-clay-deep"
                aria-label="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="pt-1">
            {mounted ? (
              <Calendar
                mode="single"
                selected={calendarDate}
                onSelect={handleDateSelect}
                className="w-full rounded-lg border border-line bg-panel/70 p-2 text-[12px] [--cell-size:30px]"
                classNames={{
                  caption_label: "font-display text-[17px] tracking-[-0.01em]",
                  weekday: "flex-1 text-center text-[9px] font-medium uppercase tracking-[0.1em] text-ink-faint select-none",
                  day: "flex-1 rounded-md text-center",
                }}
                modifiers={{
                  hasRecording: (day) => hasRecordingsOnDate(day),
                  isSelected: (day) =>
                    selectedDate
                      ? day.toISOString().split("T")[0] === selectedDate.toISOString().split("T")[0]
                      : false,
                }}
                modifiersStyles={{
                  hasRecording: {
                    fontWeight: "600",
                    textDecoration: "underline",
                    textDecorationColor: "#c2410c",
                    textUnderlineOffset: "3px",
                  },
                }}
              />
            ) : (
              <div className="flex h-[260px] items-center justify-center rounded-lg border border-line bg-panel/40">
                <span className="text-[11px] text-ink-faint">Loading calendar…</span>
              </div>
            )}
            <p className="mt-2 text-center text-[10px] tracking-wide text-ink-faint">
              Pick a date to filter the library
            </p>
          </div>
        </div>
        </div>
       </div>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
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
