import prisma from "@/lib/prisma";
import { getMistralClient, MISTRAL_TRANSCRIBE_MODEL } from "@/lib/mistral";
import { normalizeLanguage } from "@/lib/transcription";
import { groupSegmentsByEndWords } from "@/lib/endWords";
import { uploadAudio } from "@/lib/storage";

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

/**
 * Transcribe a recording's audio with speaker diarization, persist the audio,
 * and replace the transcript with end-word grouped lines. Shared by the
 * synchronous `/diarize` route and the async `/process` (SQS + Lambda) path.
 */
export async function processRecordingAudio(recordingId: string, audio: Buffer) {
  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
  });

  if (!recording) {
    throw new Error("Recording not found");
  }

  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "processing" },
  });

  // Persist the audio (S3 when configured, otherwise local disk).
  try {
    const audioPath = await uploadAudio(recordingId, audio);
    await prisma.recording.update({
      where: { id: recordingId },
      data: { audioPath },
    });
  } catch (uploadError) {
    console.error("Audio storage failed:", uploadError);
  }

  try {
    const client = await getMistralClient();
    const response = await client.audio.transcriptions.complete({
      model: MISTRAL_TRANSCRIBE_MODEL,
      file: new Blob([new Uint8Array(audio)], { type: "audio/wav" }),
      diarize: true,
      timestampGranularities: ["segment"],
    });

    const returnedSegments = response.segments ?? [];
    const hasTranscript = Boolean(response.text && response.text.trim().length);
    const hasSegments = returnedSegments.length > 0;

    if (!hasTranscript && !hasSegments) {
      await ensureFallbackSpeaker(recordingId);
      return await markCompleted(recordingId);
    }

    await prisma.transcriptSegment.deleteMany({
      where: { recordingId },
    });
    await prisma.speaker.deleteMany({ where: { recordingId } });

    const speakerLabels = Array.from(
      new Set(
        returnedSegments
          .map((segment) => segment.speakerId)
          .filter((label): label is string => Boolean(label))
      )
    ).sort();

    if (speakerLabels.length === 0) {
      speakerLabels.push("speaker_1");
    }

    const speakerMap = new Map<string, string>();
    for (let i = 0; i < speakerLabels.length; i++) {
      const label = speakerLabels[i];
      const speaker = await prisma.speaker.create({
        data: {
          recordingId,
          label,
          name: i === 0 ? "Professor" : `Student ${i}`,
          color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
        },
      });
      speakerMap.set(label, speaker.id);
    }

    const languageCode = normalizeLanguage(response.language);
    const endWordRows = await prisma.endWord.findMany();
    const endWords = endWordRows.map((row) => row.word);

    if (hasSegments) {
      const groupedLines = groupSegmentsByEndWords(returnedSegments, endWords);

      await prisma.transcriptSegment.createMany({
        data: groupedLines.map((line) => ({
          recordingId,
          text: line.text,
          timestamp: new Date(recording.date.getTime() + line.startTime * 1000),
          startTime: line.startTime,
          endTime: line.endTime,
          languageCode,
          speakerId:
            (line.speakerId && speakerMap.get(line.speakerId)) ||
            speakerMap.get(speakerLabels[0]),
        })),
      });
    } else {
      await prisma.transcriptSegment.create({
        data: {
          recordingId,
          text: response.text!,
          timestamp: recording.date,
          startTime: 0,
          endTime: recording.duration || 0,
          languageCode,
          speakerId: speakerMap.get(speakerLabels[0]),
        },
      });
    }

    return await markCompleted(recordingId);
  } catch (error) {
    console.error("Error processing recording audio:", error);

    // Best-effort: keep any existing segments and finish rather than fail.
    await ensureFallbackSpeaker(recordingId);
    return await markCompleted(recordingId);
  }
}

async function markCompleted(recordingId: string) {
  await prisma.recording.update({
    where: { id: recordingId },
    data: { status: "completed" },
  });
  return getFullRecording(recordingId);
}

// Attach a default speaker to any existing live segments.
async function ensureFallbackSpeaker(recordingId: string) {
  const existingSegments = await prisma.transcriptSegment.findMany({
    where: { recordingId },
  });

  if (existingSegments.length === 0) {
    return;
  }

  const defaultSpeaker = await prisma.speaker.upsert({
    where: { recordingId_label: { recordingId, label: "speaker_1" } },
    update: {},
    create: {
      recordingId,
      label: "speaker_1",
      name: "Speaker",
      color: SPEAKER_COLORS[0],
    },
  });

  await prisma.transcriptSegment.updateMany({
    where: { recordingId, speakerId: null },
    data: { speakerId: defaultSpeaker.id },
  });
}

// Helper to fetch full recording with relations
export async function getFullRecording(id: string) {
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
