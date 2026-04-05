"use client";

import { useState, useEffect, useCallback } from "react";
import type { Recording } from "./useTranscription";

interface RecordingsByDate {
  grouped: Record<string, RecordingSummary[]>;
  dates: string[];
}

export interface RecordingSummary {
  id: string;
  title: string;
  date: Date;
  duration: number;
  status: string;
  segmentCount: number;
  speakerCount: number;
  hasInsights: boolean;
}

export function useRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingsByDate, setRecordingsByDate] = useState<RecordingsByDate>({
    grouped: {},
    dates: [],
  });
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all recordings grouped by date
  const fetchRecordingsByDate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/recordings/by-date");
      if (!response.ok) throw new Error("Failed to fetch recordings");
      const data = await response.json();
      setRecordingsByDate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch recordings for a specific date
  const fetchRecordingsForDate = useCallback(async (date: Date) => {
    setIsLoading(true);
    setError(null);
    try {
      const dateStr = date.toISOString().split("T")[0];
      const response = await fetch(`/api/recordings?date=${dateStr}`);
      if (!response.ok) throw new Error("Failed to fetch recordings");
      const data = await response.json();
      setRecordings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch a single recording by ID
  const fetchRecording = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/recordings/${id}`);
      if (!response.ok) throw new Error("Failed to fetch recording");
      const data = await response.json();
      
      // Parse insights JSON fields if they exist
      if (data.insights) {
        data.insights = {
          ...data.insights,
          keyPoints: typeof data.insights.keyPoints === 'string' 
            ? JSON.parse(data.insights.keyPoints) 
            : data.insights.keyPoints,
          topics: typeof data.insights.topics === 'string' 
            ? JSON.parse(data.insights.topics) 
            : data.insights.topics,
        };
      }
      
      setSelectedRecording(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete a recording
  const deleteRecording = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete recording");
      
      // Refresh the list
      await fetchRecordingsByDate();
      
      // Clear selected if it was deleted
      if (selectedRecording?.id === id) {
        setSelectedRecording(null);
      }
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      return false;
    }
  }, [fetchRecordingsByDate, selectedRecording?.id]);

  // Update recording title
  const updateRecordingTitle = useCallback(async (id: string, title: string) => {
    try {
      const response = await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error("Failed to update recording");
      
      // Refresh data
      await fetchRecordingsByDate();
      if (selectedRecording?.id === id) {
        await fetchRecording(id);
      }
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      return false;
    }
  }, [fetchRecordingsByDate, fetchRecording, selectedRecording?.id]);

  // Update speaker name
  const updateSpeakerName = useCallback(async (recordingId: string, speakerId: string, name: string) => {
    try {
      const response = await fetch(`/api/recordings/${recordingId}/speakers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerId, name }),
      });
      if (!response.ok) throw new Error("Failed to update speaker");
      
      // Refresh the recording
      if (selectedRecording?.id === recordingId) {
        await fetchRecording(recordingId);
      }
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update speaker");
      return false;
    }
  }, [fetchRecording, selectedRecording?.id]);

  // Get recordings for selected date
  const getRecordingsForDate = useCallback((date: Date): RecordingSummary[] => {
    const dateStr = date.toISOString().split("T")[0];
    return recordingsByDate.grouped[dateStr] || [];
  }, [recordingsByDate.grouped]);

  // Check if a date has recordings
  const hasRecordingsOnDate = useCallback((date: Date): boolean => {
    const dateStr = date.toISOString().split("T")[0];
    return recordingsByDate.dates.includes(dateStr);
  }, [recordingsByDate.dates]);

  // Get date label (Today, Yesterday, or formatted date)
  const getDateLabel = useCallback((date: Date): string => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = date.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    if (dateStr === todayStr) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, []);

  // Format duration
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchRecordingsByDate();
  }, [fetchRecordingsByDate]);

  return {
    recordings,
    recordingsByDate,
    selectedRecording,
    selectedDate,
    isLoading,
    error,
    setSelectedDate,
    setSelectedRecording,
    fetchRecordingsByDate,
    fetchRecordingsForDate,
    fetchRecording,
    deleteRecording,
    updateRecordingTitle,
    updateSpeakerName,
    getRecordingsForDate,
    hasRecordingsOnDate,
    getDateLabel,
    formatDuration,
  };
}
