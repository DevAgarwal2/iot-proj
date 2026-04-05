import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/recordings/[id]/insights - Add or update insights for a recording
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { summary, keyPoints, topics, wordCount } = body;

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

    // Upsert insights (create or update)
    const insights = await prisma.insights.upsert({
      where: { recordingId: id },
      update: {
        summary: summary || "",
        keyPoints: JSON.stringify(keyPoints || []),
        topics: JSON.stringify(topics || []),
        wordCount: wordCount || 0,
      },
      create: {
        recordingId: id,
        summary: summary || "",
        keyPoints: JSON.stringify(keyPoints || []),
        topics: JSON.stringify(topics || []),
        wordCount: wordCount || 0,
      },
    });

    return NextResponse.json({
      ...insights,
      keyPoints: JSON.parse(insights.keyPoints),
      topics: JSON.parse(insights.topics),
    });
  } catch (error) {
    console.error("Error saving insights:", error);
    return NextResponse.json(
      { error: "Failed to save insights" },
      { status: 500 }
    );
  }
}

// GET /api/recordings/[id]/insights - Get insights for a recording
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const insights = await prisma.insights.findUnique({
      where: { recordingId: id },
    });

    if (!insights) {
      return NextResponse.json(
        { error: "Insights not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...insights,
      keyPoints: JSON.parse(insights.keyPoints),
      topics: JSON.parse(insights.topics),
    });
  } catch (error) {
    console.error("Error fetching insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}
