"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { SarvamAIClient } from "sarvamai";

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

const API_KEY = "YOUR_SARVAM_API_KEY_HERE";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for data persistence
  const liveTranscriptsRef = useRef<TranscriptSegment[]>([]);
  const durationRef = useRef<number>(0);
  const recordingStartTimeRef = useRef<number>(0);

  // Audio recording for diarization
  const audioChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(16000);

  // Helper functions
  const convertFloat32ToInt16 = (float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  };

  const createWavBuffer = (
    audioData: Float32Array,
    sampleRate: number
  ): ArrayBuffer => {
    const int16Data = convertFloat32ToInt16(audioData);
    const buffer = new ArrayBuffer(44 + int16Data.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + int16Data.length * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, int16Data.length * 2, true);

    for (let i = 0; i < int16Data.length; i++) {
      view.setInt16(44 + i * 2, int16Data[i], true);
    }

    return buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

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

  // Connect to Sarvam streaming API
  const connectToSarvam = useCallback(async () => {
    try {
      const client = new SarvamAIClient({ apiSubscriptionKey: API_KEY });

      const socket = await client.speechToTextStreaming.connect({
        model: "saaras:v3",
        mode: "transcribe",
        "language-code": "unknown",
        high_vad_sensitivity: "true",
      } as unknown as Parameters<typeof client.speechToTextStreaming.connect>[0]);

      socketRef.current = socket;

      socket.on("open", () => setIsConnected(true));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on("message", (response: any) => {
        const data = response.data || response;
        if (data.language_code) setDetectedLanguage(data.language_code);
        if (data.transcript || data.text) {
          const now = Date.now();
          const startTime = (now - recordingStartTimeRef.current) / 1000;

          const segment: TranscriptSegment = {
            text: data.transcript || data.text || "",
            timestamp: new Date(now),
            startTime,
            endTime: startTime,
            languageCode: data.language_code || "en-IN",
          };

          setLiveTranscripts((prev) => {
            const next = [...prev, segment];
            liveTranscriptsRef.current = next;
            return next;
          });
        }
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on("error", (err: any) =>
        setError("Connection error: " + JSON.stringify(err))
      );
      socket.on("close", () => setIsConnected(false));

      await socket.waitForOpen();
    } catch (err) {
      console.error("Sarvam connection error:", err);
      setError("Failed to connect to transcription service");
    }
  }, []);

  // Send audio chunk for live transcription
  const sendAudioChunk = useCallback((audioData: Float32Array) => {
    if (!socketRef.current) return;

    // Store chunk for later diarization
    audioChunksRef.current.push(new Float32Array(audioData));

    try {
      const wavBuffer = createWavBuffer(audioData, 16000);
      const base64Audio = arrayBufferToBase64(wavBuffer);
      socketRef.current.transcribe({
        audio: base64Audio,
        sample_rate: 16000,
        encoding: "audio/wav",
      });
    } catch (err) {
      console.error("Audio send error:", err);
    }
  }, []);

  // Generate AI insights using Sarvam LLM
  const generateInsights = async (
    recordingId: string,
    fullText: string,
    duration: number
  ) => {
    setIsGeneratingSummary(true);
    setStreamingText("");

    try {
      const client = new SarvamAIClient({ apiSubscriptionKey: API_KEY });
      const stream = await client.chat.completions({
        model: "sarvam-105b" as Parameters<typeof client.chat.completions>[0]["model"],
        messages: [
          {
            role: "system",
            content: `You are an expert at analyzing lecture transcripts. Analyze the provided transcript (which may be in Hindi, English, or mixed languages) and provide insights in proper English.

Return a JSON object with exactly these fields:
- "summary": a concise 2-3 sentence overview of the lecture in English
- "keyPoints": an array of 3-6 key takeaway strings in English
- "topics": an array of 2-5 topic label strings in English

Respond ONLY with valid JSON, no markdown fencing, no explanation.`,
          },
          {
            role: "user",
            content: `Analyze this lecture transcript:\n\n${fullText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        stream: true,
      });

      let accumulated = "";
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content ?? "";
        if (content) {
          accumulated += content;
          setStreamingText(accumulated);
        }
      }

      // Parse the final accumulated JSON
      const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const wordCount = fullText.split(/\s+/).filter(Boolean).length;

        // Save insights to database
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

  // Process audio with speaker diarization
  const processDiarization = async (recordingId: string): Promise<boolean> => {
    void recordingId;
    return false;
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
      recordingStartTimeRef.current = Date.now();

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
        if (socketRef.current) {
          sendAudioChunk(e.inputBuffer.getChannelData(0));
        }
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

      // Connect to Sarvam for live transcription
      await connectToSarvam();

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
    // Stop audio processing
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close();
    socketRef.current?.close();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }

    setIsRecording(false);
    setIsConnected(false);
    setAudioLevel(0);

    if (!currentRecordingId) {
      return null;
    }

    setIsProcessing(true);

    try {
      const duration = durationRef.current;
      const segments = liveTranscriptsRef.current;
      const fullText = segments.map((t) => t.text).join(" ");

      // Update recording with duration and segments
      await fetch(`/api/recordings/${currentRecordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration,
          status: "processing",
        }),
      });

      // Save live transcript segments
      if (segments.length > 0) {
        await fetch(`/api/recordings/${currentRecordingId}/segments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segments }),
        });
      }

      // Process diarization (this will update segments with speaker info)
      const diarizationSuccess = await processDiarization(currentRecordingId);

      if (!diarizationSuccess) {
        // If diarization fails, still mark as completed with live segments
        await fetch(`/api/recordings/${currentRecordingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
      }

      // Generate AI insights
      if (fullText.trim()) {
        await generateInsights(currentRecordingId, fullText, duration);
      }

      // Fetch final recording
      const response = await fetch(`/api/recordings/${currentRecordingId}`);
      const recording = await response.json();

      setIsProcessing(false);
      return recording;
    } catch (err) {
      console.error("Stop recording error:", err);
      setError("Failed to process recording");
      setIsProcessing(false);

      // Mark as failed
      await fetch(`/api/recordings/${currentRecordingId}`, {
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
