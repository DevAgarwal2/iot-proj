"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  ReactNode,
} from "react";
import {
  convertFloat32ToInt16,
  createWavBuffer,
} from "@/lib/audio";
import { splitByEndWords } from "@/lib/endWords";

// Types matching our Prisma schema
export interface Speaker {
  id: string;
  label: string;
  name: string | null;
  color: string;
}

export interface TranscriptSegment {
  id?: string;
  text: string;
  timestamp: Date;
  startTime: number;
  endTime: number;
  languageCode: string;
  confidence?: number;
  speaker?: Speaker | null;
  speakerId?: string | null;
}

export interface Insights {
  id: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  wordCount: number;
}

export interface Recording {
  id: string;
  title: string;
  date: Date;
  duration: number;
  status: string;
  audioPath?: string | null;
  segments: TranscriptSegment[];
  speakers: Speaker[];
  insights?: Insights | null;
}

interface TranscriptionContextType {
  // Recording state
  isRecording: boolean;
  isConnected: boolean;
  isProcessing: boolean;
  isGeneratingSummary: boolean;
  currentRecordingId: string | null;

  // Live transcription data
  liveTranscripts: TranscriptSegment[];
  detectedLanguage: string;
  audioLevel: number;
  recordingDuration: number;
  streamingText: string;

  // Error state
  error: string;

  // Actions
  startRecording: (title?: string) => Promise<void>;
  stopRecording: () => Promise<Recording | null>;
  clearLiveData: () => void;

  // Utility
  formatDuration: (seconds: number) => string;
}

const TranscriptionContext = createContext<TranscriptionContextType | null>(
  null
);

// Realtime events emitted by the Gnani streaming proxy.
interface RealtimeEventData {
  type?: string;
  text?: string;
  message?: string;
  detected_language_code?: string;
  segment_index?: number;
  is_final?: boolean;
  error?: { message?: string };
}

export function TranscriptionProvider({ children }: { children: ReactNode }) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(
    null
  );

  // Live transcription data
  const [liveTranscripts, setLiveTranscripts] = useState<TranscriptSegment[]>(
    []
  );
  const [detectedLanguage, setDetectedLanguage] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [streamingText, setStreamingText] = useState("");

  // Error state
  const [error, setError] = useState<string>("");

  // Refs for audio handling
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for data persistence
  const liveTranscriptsRef = useRef<TranscriptSegment[]>([]);
  const durationRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(0);
  const detectedLanguageRef = useRef<string>("");
  const pendingTextRef = useRef<string>("");
  const lastSegmentEndRef = useRef<number>(0);
  const endWordsRef = useRef<string[]>([]);
  const realtimeErrorRef = useRef<boolean>(false);

  // Audio recording for the final high-quality diarization pass
  const audioChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(16000);

  // Helper functions
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Merge all audio chunks into a single WAV file
  const createFullAudioBlob = (): Blob => {
    const totalLength = audioChunksRef.current.reduce(
      (acc, chunk) => acc + chunk.length,
      0
    );
    const fullAudio = new Float32Array(totalLength);

    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      fullAudio.set(chunk, offset);
      offset += chunk.length;
    }

    const wavBuffer = createWavBuffer(fullAudio, sampleRateRef.current);
    return new Blob([wavBuffer], { type: "audio/wav" });
  };

  const pushLiveSegment = (segment: TranscriptSegment) => {
    setLiveTranscripts((prev) => {
      const next = [...prev, segment];
      liveTranscriptsRef.current = next;
      return next;
    });
  };

  const elapsedSeconds = () =>
    recordingStartTimeRef.current
      ? (Date.now() - recordingStartTimeRef.current) / 1000
      : 0;

  // Finalize one transcript line (used by both flush strategies).
  const pushSegmentLine = (text: string, endTime = elapsedSeconds()) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const startTime = lastSegmentEndRef.current;
    const clampedEnd = Math.max(endTime, startTime);

    pushLiveSegment({
      text: trimmed,
      timestamp: new Date(),
      startTime,
      endTime: clampedEnd,
      languageCode: detectedLanguageRef.current || "en-IN",
    });

    lastSegmentEndRef.current = clampedEnd;
  };

  // End-word mode: only finalize a line when a configured end word is spoken.
  const consumePendingByEndWords = () => {
    const pending = pendingTextRef.current;
    if (!pending) return;

    const { lines, remainder } = splitByEndWords(pending, endWordsRef.current);

    if (lines.length === 0) {
      if (endWordsRef.current.length > 0) setStreamingText(pending);
      return;
    }

    const endTime = elapsedSeconds();
    for (const line of lines) pushSegmentLine(line, endTime);

    pendingTextRef.current = remainder;
    setStreamingText(remainder.trimStart());
  };

  // Fallback behaviour when no end words are configured: flush on a timer.
  const flushPendingByTimer = () => {
    const text = pendingTextRef.current.trim();
    if (!text) return;
    pushSegmentLine(text);
    pendingTextRef.current = "";
    setStreamingText("");
  };

  // Flush whatever is left when the recording stops.
  const flushRemainder = () => {
    const text = pendingTextRef.current.trim();
    if (text) pushSegmentLine(text);
    pendingTextRef.current = "";
    setStreamingText("");
  };

  const handleRealtimeMessage = (raw: string) => {
    let data: RealtimeEventData;
    try {
      data = JSON.parse(raw) as RealtimeEventData;
    } catch {
      return;
    }

    switch (data.type) {
      case "connected":
        setIsConnected(true);
        realtimeErrorRef.current = false;
        setError("");
        break;

      case "transcript":
        if (data.detected_language_code) {
          detectedLanguageRef.current = data.detected_language_code;
          setDetectedLanguage(data.detected_language_code);
        }

        if (typeof data.text === "string" && data.text.trim()) {
          // Recovered: clear any transient live-transcription error.
          if (realtimeErrorRef.current) {
            realtimeErrorRef.current = false;
            setError("");
          }

          const text = data.text.trim();
          const prefix =
            pendingTextRef.current &&
            !pendingTextRef.current.endsWith(" ")
              ? " "
              : "";
          pendingTextRef.current += prefix + text;

          if (endWordsRef.current.length === 0) {
            // Gnani already splits on speech pauses, so each transcript is a line.
            flushPendingByTimer();
          } else {
            consumePendingByEndWords();
          }
        }
        break;

      case "done":
        flushRemainder();
        break;

      case "error": {
        const message =
          typeof data.message === "string"
            ? data.message
            : typeof data.error?.message === "string"
              ? data.error.message
              : "";
        realtimeErrorRef.current = true;
        // Provider/connection errors should not look catastrophic; the
        // recording continues and is transcribed on stop.
        if (
          !message ||
          /rate|limit|busy|timeout|unavailable|connection|socket/i.test(message)
        ) {
          setError(
            "Live transcription is briefly unavailable — recording continues"
          );
        } else {
          setError(message.slice(0, 140));
        }
        break;
      }
    }
  };

  // Connect to the same-origin WebSocket proxy that talks to Gnani. The proxy
  // attaches the API key, which a browser cannot send on a WebSocket.
  const connectToGnani = async () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/api/stt/stream`
    );
    socketRef.current = socket;

    socket.onmessage = (event) => handleRealtimeMessage(String(event.data));
    socket.onerror = () => {
      realtimeErrorRef.current = true;
      setError("Live captions reconnecting — recording continues");
    };
    socket.onclose = () => setIsConnected(false);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out connecting to transcription service")),
        12000
      );
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Failed to connect to transcription service"));
        },
        { once: true }
      );
    });

    setIsConnected(true);
  };

  // Send an audio chunk for live transcription (and keep it for the final pass).
  const sendAudioChunk = (audioData: Float32Array) => {
    audioChunksRef.current.push(new Float32Array(audioData));

    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    try {
      const pcm16 = convertFloat32ToInt16(audioData);
      socket.send(pcm16);
    } catch (err) {
      console.error("Audio send error:", err);
    }
  };

  // Generate AI insights through the server-side Sarvam route.
  const generateInsights = async (recordingId: string, fullText: string) => {
    setIsGeneratingSummary(true);
    setStreamingText("");

    try {
      const response = await fetch(
        `/api/recordings/${recordingId}/insights/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: fullText }),
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
        setStreamingText(accumulated);
      }
      accumulated += decoder.decode();

      const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const wordCount = fullText.split(/\s+/).filter(Boolean).length;

        await fetch(`/api/recordings/${recordingId}/insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: parsed.summary || "No summary available.",
            keyPoints: parsed.keyPoints || [],
            topics: parsed.topics || [],
            wordCount,
          }),
        });
      }
    } catch (err) {
      console.error("Insights generation error:", err);
      setError("Failed to generate insights");
    } finally {
      setIsGeneratingSummary(false);
      setStreamingText("");
    }
  };

  // Start recording
  const startRecording = async (title?: string) => {
    try {
      setError("");
      setLiveTranscripts([]);
      liveTranscriptsRef.current = [];
      setRecordingDuration(0);
      durationRef.current = 0;
      audioChunksRef.current = [];
      detectedLanguageRef.current = "";
      setDetectedLanguage("");
      pendingTextRef.current = "";
      lastSegmentEndRef.current = 0;
      realtimeErrorRef.current = false;
      recordingStartTimeRef.current = Date.now();

      // Load configured end words. With end words, a line only ends when one is
      // spoken; otherwise we fall back to periodic flushing.
      try {
        const endWordsResponse = await fetch("/api/settings/end-words");
        if (endWordsResponse.ok) {
          const rows = (await endWordsResponse.json()) as Array<{
            word: string;
          }>;
          endWordsRef.current = rows.map((row) => row.word);
        } else {
          endWordsRef.current = [];
        }
      } catch {
        endWordsRef.current = [];
      }

      // Create recording in database
      const response = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || `Lecture ${new Date().toLocaleString()}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create recording");
      }

      const recording = await response.json();
      setCurrentRecordingId(recording.id);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const processor = audioContext.createScriptProcessor(16384, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        sendAudioChunk(e.inputBuffer.getChannelData(0));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Audio level visualization
      const visualize = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        setAudioLevel(
          Math.min(
            (data.reduce((a, b) => a + b, 0) / data.length / 128) * 100,
            100
          )
        );
        animationFrameRef.current = requestAnimationFrame(visualize);
      };
      visualize();

      // Connect to Gnani for live transcription. If this fails we still
      // capture the audio and transcribe it with diarization on stop.
      try {
        await connectToGnani();
      } catch (connectionError) {
        console.error("Realtime transcription unavailable:", connectionError);
        realtimeErrorRef.current = true;
        setError(
          "Live captions unavailable — audio will be transcribed when you stop"
        );
      }

      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((p) => {
          const next = p + 1;
          durationRef.current = next;
          return next;
        });
      }, 1000);

      setIsRecording(true);
    } catch (err) {
      console.error("Start recording error:", err);
      setError("Failed to start recording");
      setCurrentRecordingId(null);
    }
  };

  // Stop recording and process
  const stopRecording = async (): Promise<Recording | null> => {
    // Flush any partial live text before tearing down.
    flushRemainder();

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "commit" }));
        // Give Gnani a moment to transcribe the final utterance.
        await new Promise((resolve) => setTimeout(resolve, 2500));
      } catch {
        // Ignore shutdown errors
      }
    }
    socket?.close();
    socketRef.current = null;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();

    setIsRecording(false);
    setIsConnected(false);
    setAudioLevel(0);

    const recordingId = currentRecordingId;
    if (!recordingId) {
      return null;
    }

    setIsProcessing(true);

    try {
      const duration = durationRef.current;
      const liveSegments = liveTranscriptsRef.current;

      // Update recording with duration and mark as processing
      await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration,
          status: "processing",
        }),
      });

      // Save live transcript segments as a fallback
      if (liveSegments.length > 0) {
        await fetch(`/api/recordings/${recordingId}/segments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments: liveSegments }),
        });
      }

      // High-quality pass: re-transcribe the full audio with speaker
      // diarization. This replaces the live segments when it succeeds.
      let finalRecording: Recording | null = null;

      if (audioChunksRef.current.length > 0) {
        try {
          const formData = new FormData();
          formData.append("audio", createFullAudioBlob(), "recording.wav");

          const diarizeResponse = await fetch(
            `/api/recordings/${recordingId}/diarize`,
            { method: "POST", body: formData }
          );

          if (diarizeResponse.ok) {
            finalRecording = await diarizeResponse.json();
          }
        } catch (diarizeError) {
          console.error("Diarization error:", diarizeError);
        }
      }

      // Ensure the recording is marked completed if diarization didn't run.
      if (!finalRecording) {
        await fetch(`/api/recordings/${recordingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        const response = await fetch(`/api/recordings/${recordingId}`);
        finalRecording = await response.json();
      }

      // Generate AI insights from the final transcript
      const fullText = (finalRecording?.segments ?? liveSegments)
        .map((segment) => segment.text)
        .join(" ")
        .trim();

      if (fullText) {
        await generateInsights(recordingId, fullText);
      }

      // Fetch final recording
      const response = await fetch(`/api/recordings/${recordingId}`);
      const recording = await response.json();

      setIsProcessing(false);
      return recording;
    } catch (err) {
      console.error("Stop recording error:", err);
      setError("Failed to process recording");
      setIsProcessing(false);

      // Mark as failed
      await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed" }),
      });

      return null;
    }
  };

  // Clear live data
  const clearLiveData = () => {
    setLiveTranscripts([]);
    liveTranscriptsRef.current = [];
    setRecordingDuration(0);
    durationRef.current = 0;
    setDetectedLanguage("");
    detectedLanguageRef.current = "";
    pendingTextRef.current = "";
    lastSegmentEndRef.current = 0;
    realtimeErrorRef.current = false;
    setError("");
    setCurrentRecordingId(null);
    audioChunksRef.current = [];
  };

  return (
    <TranscriptionContext.Provider
      value={{
        isRecording,
        isConnected,
        isProcessing,
        isGeneratingSummary,
        currentRecordingId,
        liveTranscripts,
        detectedLanguage,
        audioLevel,
        recordingDuration,
        streamingText,
        error,
        startRecording,
        stopRecording,
        clearLiveData,
        formatDuration,
      }}
    >
      {children}
    </TranscriptionContext.Provider>
  );
}

export function useTranscription() {
  const context = useContext(TranscriptionContext);
  if (!context) {
    throw new Error("useTranscription must be used within TranscriptionProvider");
  }
  return context;
}
