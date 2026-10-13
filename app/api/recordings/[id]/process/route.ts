import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { processRecordingAudio } from "@/lib/processing";
import { getAudioBytes } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/recordings/[id]/process
 *
 * Async entry point used by the SQS + Lambda pipeline: the audio is already in
 * S3 (uploaded when recording stopped), so this transcribes it by id. Guarded
 * by a shared secret so only the Lambda can trigger it.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const expected = process.env.PROCESS_SECRET;
  if (expected && request.headers.get("x-process-secret") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const recording = await prisma.recording.findUnique({ where: { id } });

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    if (!recording.audioPath) {
      return NextResponse.json(
        { error: "Recording has no stored audio" },
        { status: 400 }
      );
    }

    const audio = await getAudioBytes(recording.audioPath);
    if (!audio) {
      return NextResponse.json(
        { error: "Audio could not be read" },
        { status: 400 }
      );
    }

    const result = await processRecordingAudio(id, audio);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error processing recording:", error);
    return NextResponse.json(
      { error: "Failed to process recording" },
      { status: 500 }
    );
  }
}
