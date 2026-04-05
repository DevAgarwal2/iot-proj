import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

// POST /api/recordings/[id]/speakers - Add speakers to a recording
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { speakers } = body;

    if (!Array.isArray(speakers) || speakers.length === 0) {
      return NextResponse.json(
        { error: "Speakers array is required" },
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

    // Create speakers with assigned colors
    const createdSpeakers = [];
    for (let i = 0; i < speakers.length; i++) {
      const speaker = speakers[i];
      const created = await prisma.speaker.upsert({
        where: {
          recordingId_label: {
            recordingId: id,
            label: speaker.label,
          },
        },
        update: {
          name: speaker.name,
          color: speaker.color || SPEAKER_COLORS[i % SPEAKER_COLORS.length],
        },
        create: {
          recordingId: id,
          label: speaker.label,
          name: speaker.name,
          color: speaker.color || SPEAKER_COLORS[i % SPEAKER_COLORS.length],
        },
      });
      createdSpeakers.push(created);
    }

    return NextResponse.json(createdSpeakers, { status: 201 });
  } catch (error) {
    console.error("Error adding speakers:", error);
    return NextResponse.json(
      { error: "Failed to add speakers" },
      { status: 500 }
    );
  }
}

// PATCH /api/recordings/[id]/speakers - Update speaker names
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { speakerId, name } = body;

    const speaker = await prisma.speaker.update({
      where: {
        id: speakerId,
        recordingId: id,
      },
      data: { name },
    });

    return NextResponse.json(speaker);
  } catch (error) {
    console.error("Error updating speaker:", error);
    return NextResponse.json(
      { error: "Failed to update speaker" },
      { status: 500 }
    );
  }
}
