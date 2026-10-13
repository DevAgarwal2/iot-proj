import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { processRecordingAudio } from "@/lib/processing";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/recordings/[id]/diarize - Transcribe uploaded audio with diarization
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    const recording = await prisma.recording.findUnique({ where: { id } });
    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    const result = await processRecordingAudio(
      id,
      Buffer.from(await audioFile.arrayBuffer())
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error processing diarization:", error);
    return NextResponse.json(
      { error: "Failed to process diarization" },
      { status: 500 }
    );
  }
}
