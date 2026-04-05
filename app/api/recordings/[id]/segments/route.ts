import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/recordings/[id]/segments - Add transcript segments to a recording
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { segments } = body;

    if (!Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json(
        { error: "Segments array is required" },
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

    // Create all segments
    const createdSegments = await prisma.transcriptSegment.createMany({
      data: segments.map((segment: {
        text: string;
        timestamp: string | Date;
        startTime?: number;
        endTime?: number;
        languageCode?: string;
        confidence?: number;
        speakerId?: string;
      }) => ({
        recordingId: id,
        text: segment.text,
        timestamp: new Date(segment.timestamp),
        startTime: segment.startTime || 0,
        endTime: segment.endTime || 0,
        languageCode: segment.languageCode || "en-IN",
        confidence: segment.confidence,
        speakerId: segment.speakerId,
      })),
    });

    return NextResponse.json(
      { count: createdSegments.count },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error adding segments:", error);
    return NextResponse.json(
      { error: "Failed to add segments" },
      { status: 500 }
    );
  }
}
