import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SarvamAIClient } from "sarvamai";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const API_KEY = process.env.SARVAM_API_KEY || "";

// Speaker colors for UI
const SPEAKER_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

// Sarvam API response types based on docs
interface SarvamTimestamps {
  start_time_seconds: number;
  end_time_seconds: number;
  words: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}

interface SarvamDiarizedEntry {
  speaker: string;
  transcript: string;
  timestamp?: {
    start: number;
    end: number;
  };
}

interface SarvamResponse {
  request_id?: string;
  transcript?: string;
  timestamps?: SarvamTimestamps | null;
  diarized_transcript?: SarvamDiarizedEntry[] | null;
  language_code?: string | null;
  language_probability?: number | null;
}

// POST /api/recordings/[id]/diarize - Process audio with speaker diarization
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Verify recording exists
    const recording = await prisma.recording.findUnique({
      where: { id },
    });

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    // Update status to processing
    await prisma.recording.update({
      where: { id },
      data: { status: "processing" },
    });

    // Convert File to Buffer for Sarvam API
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const blob = new Blob([buffer], { type: audioFile.type || "audio/wav" });

    // Call Sarvam Batch API with diarization
    const client = new SarvamAIClient({ apiSubscriptionKey: API_KEY });

    console.log("Calling Sarvam API with audio size:", buffer.length, "bytes");

    let response;
    try {
      // Using the speech-to-text API with diarization and timestamps
      response = await client.speechToText.transcribe({
        file: blob,
        model: "saaras:v3",
        with_timestamps: true,
        with_diarization: true,
      } as unknown as Parameters<typeof client.speechToText.transcribe>[0]);
    } catch (sarvamError) {
      console.error("Sarvam API error:", sarvamError);
      
      // If Sarvam fails, keep existing segments and mark as completed
      const existingSegments = await prisma.transcriptSegment.findMany({
        where: { recordingId: id },
      });
      
      if (existingSegments.length > 0) {
        // Create default speaker for existing segments
        const defaultSpeaker = await prisma.speaker.create({
          data: {
            recordingId: id,
            label: "SPEAKER_00",
            name: "Speaker",
            color: SPEAKER_COLORS[0],
          },
        });
        
        await prisma.transcriptSegment.updateMany({
          where: { recordingId: id },
          data: { speakerId: defaultSpeaker.id },
        });
      }
      
      await prisma.recording.update({
        where: { id },
        data: { status: "completed" },
      });

      return NextResponse.json(await getFullRecording(id));
    }

    // Log response for debugging
    console.log("Sarvam API response:", JSON.stringify(response, null, 2));

    const sarvamResponse = response as unknown as SarvamResponse;

    // Check what data we got back
    const hasTranscript = sarvamResponse.transcript && sarvamResponse.transcript.trim().length > 0;
    const hasDiarization = sarvamResponse.diarized_transcript && sarvamResponse.diarized_transcript.length > 0;
    const hasTimestamps = sarvamResponse.timestamps && sarvamResponse.timestamps.words && sarvamResponse.timestamps.words.length > 0;

    console.log("Response analysis:", { hasTranscript, hasDiarization, hasTimestamps });

    // If no transcript at all, keep existing live segments
    if (!hasTranscript) {
      console.log("No transcript returned, keeping existing live transcripts");
      
      const existingSegments = await prisma.transcriptSegment.findMany({
        where: { recordingId: id },
      });
      
      if (existingSegments.length > 0) {
        // Create default speaker
        const defaultSpeaker = await prisma.speaker.create({
          data: {
            recordingId: id,
            label: "SPEAKER_00",
            name: "Speaker",
            color: SPEAKER_COLORS[0],
          },
        });
        
        await prisma.transcriptSegment.updateMany({
          where: { recordingId: id },
          data: { speakerId: defaultSpeaker.id },
        });
      }
      
      await prisma.recording.update({
        where: { id },
        data: { status: "completed" },
      });

      return NextResponse.json(await getFullRecording(id));
    }

    // Clear existing segments - we'll replace with API results
    await prisma.transcriptSegment.deleteMany({
      where: { recordingId: id },
    });

    // Delete existing speakers for this recording
    await prisma.speaker.deleteMany({
      where: { recordingId: id },
    });

    if (hasDiarization) {
      // Process diarized transcript with speaker labels
      console.log("Processing diarized transcript...");
      
      // Extract unique speakers
      const speakerLabels = new Set<string>();
      sarvamResponse.diarized_transcript!.forEach((entry) => {
        if (entry.speaker) {
          speakerLabels.add(entry.speaker);
        }
      });

      if (speakerLabels.size === 0) {
        speakerLabels.add("SPEAKER_00");
      }

      // Create speaker records
      const speakerMap = new Map<string, string>();
      const speakerArray = Array.from(speakerLabels).sort();

      for (let i = 0; i < speakerArray.length; i++) {
        const label = speakerArray[i];
        const speaker = await prisma.speaker.create({
          data: {
            recordingId: id,
            label,
            name: i === 0 ? "Professor" : `Student ${i}`,
            color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
          },
        });
        speakerMap.set(label, speaker.id);
      }

      // Create segments from diarized transcript
      let cumulativeTime = 0;
      const segmentDuration = 5; // Estimate 5 seconds per segment if no timestamp

      await prisma.transcriptSegment.createMany({
        data: sarvamResponse.diarized_transcript!.map((entry, index) => {
          const startTime = entry.timestamp?.start ?? cumulativeTime;
          const endTime = entry.timestamp?.end ?? startTime + segmentDuration;
          cumulativeTime = endTime;

          return {
            recordingId: id,
            text: entry.transcript,
            timestamp: new Date(recording.date.getTime() + startTime * 1000),
            startTime,
            endTime,
            languageCode: sarvamResponse.language_code || "en-IN",
            speakerId: speakerMap.get(entry.speaker) || speakerMap.get("SPEAKER_00"),
          };
        }),
      });

    } else if (hasTimestamps) {
      // No diarization but we have word timestamps - create segments from words
      console.log("Processing timestamps without diarization...");
      
      // Create default speaker
      const defaultSpeaker = await prisma.speaker.create({
        data: {
          recordingId: id,
          label: "SPEAKER_00",
          name: "Speaker",
          color: SPEAKER_COLORS[0],
        },
      });

      // Group words into sentences/segments (split on pauses > 1 second)
      const words = sarvamResponse.timestamps!.words;
      const segments: Array<{ text: string; start: number; end: number }> = [];
      let currentSegment: { text: string; start: number; end: number } | null = null;

      for (const word of words) {
        if (!currentSegment) {
          currentSegment = { text: word.word, start: word.start, end: word.end };
        } else if (word.start - currentSegment.end > 1.0) {
          // Gap > 1 second, start new segment
          segments.push(currentSegment);
          currentSegment = { text: word.word, start: word.start, end: word.end };
        } else {
          currentSegment.text += " " + word.word;
          currentSegment.end = word.end;
        }
      }
      if (currentSegment) {
        segments.push(currentSegment);
      }

      await prisma.transcriptSegment.createMany({
        data: segments.map((seg) => ({
          recordingId: id,
          text: seg.text,
          timestamp: new Date(recording.date.getTime() + seg.start * 1000),
          startTime: seg.start,
          endTime: seg.end,
          languageCode: sarvamResponse.language_code || "en-IN",
          speakerId: defaultSpeaker.id,
        })),
      });

    } else {
      // Just have transcript text - create single segment
      console.log("Processing plain transcript...");
      
      const defaultSpeaker = await prisma.speaker.create({
        data: {
          recordingId: id,
          label: "SPEAKER_00",
          name: "Speaker",
          color: SPEAKER_COLORS[0],
        },
      });

      await prisma.transcriptSegment.create({
        data: {
          recordingId: id,
          text: sarvamResponse.transcript!,
          timestamp: recording.date,
          startTime: 0,
          endTime: recording.duration || 0,
          languageCode: sarvamResponse.language_code || "en-IN",
          speakerId: defaultSpeaker.id,
        },
      });
    }

    // Update recording status
    await prisma.recording.update({
      where: { id },
      data: { status: "completed" },
    });

    return NextResponse.json(await getFullRecording(id));

  } catch (error) {
    console.error("Error processing diarization:", error);

    // Update status to failed
    try {
      const { id } = await params;
      await prisma.recording.update({
        where: { id },
        data: { status: "failed" },
      });
    } catch {
      // Ignore if we can't update status
    }

    return NextResponse.json(
      { error: "Failed to process diarization" },
      { status: 500 }
    );
  }
}

// Helper to fetch full recording with relations
async function getFullRecording(id: string) {
  return prisma.recording.findUnique({
    where: { id },
    include: {
      segments: {
        include: { speaker: true },
        orderBy: { timestamp: "asc" },
      },
      speakers: true,
      insights: true,
    },
  });
}
