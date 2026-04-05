import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/recordings - Get all recordings, optionally filtered by date
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get("date");

    let whereClause = {};

    if (dateParam) {
      const date = new Date(dateParam);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      whereClause = {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      };
    }

    const recordings = await prisma.recording.findMany({
      where: whereClause,
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
      orderBy: {
        date: "desc",
      },
    });

    return NextResponse.json(recordings);
  } catch (error) {
    console.error("Error fetching recordings:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}

// POST /api/recordings - Create a new recording
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title } = body;

    const recording = await prisma.recording.create({
      data: {
        title: title || `Lecture ${new Date().toLocaleString()}`,
        status: "recording",
      },
    });

    return NextResponse.json(recording, { status: 201 });
  } catch (error) {
    console.error("Error creating recording:", error);
    return NextResponse.json(
      { error: "Failed to create recording" },
      { status: 500 }
    );
  }
}
