import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/recordings/[id] - Get a single recording with all related data
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const recording = await prisma.recording.findUnique({
      where: { id },
      include: {
        segments: {
          include: {
            speaker: true,
          },
          orderBy: {
            timestamp: "asc",
          },
        },
        speakers: true,
        insights: true,
      },
    });

    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(recording);
  } catch (error) {
    console.error("Error fetching recording:", error);
    return NextResponse.json(
      { error: "Failed to fetch recording" },
      { status: 500 }
    );
  }
}

// PATCH /api/recordings/[id] - Update a recording
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, status, duration, audioPath } = body;

    const recording = await prisma.recording.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(status !== undefined && { status }),
        ...(duration !== undefined && { duration }),
        ...(audioPath !== undefined && { audioPath }),
      },
      include: {
        segments: {
          include: {
            speaker: true,
          },
        },
        speakers: true,
        insights: true,
      },
    });

    return NextResponse.json(recording);
  } catch (error) {
    console.error("Error updating recording:", error);
    return NextResponse.json(
      { error: "Failed to update recording" },
      { status: 500 }
    );
  }
}

// DELETE /api/recordings/[id] - Delete a recording
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    await prisma.recording.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting recording:", error);
    return NextResponse.json(
      { error: "Failed to delete recording" },
      { status: 500 }
    );
  }
}
