import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/recordings/by-date - Get recordings grouped by date
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");

    let whereClause = {};

    if (startDate && endDate) {
      whereClause = {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      };
    }

    const recordings = await prisma.recording.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            segments: true,
            speakers: true,
          },
        },
        insights: {
          select: {
            id: true,
            summary: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    // Group by date
    const groupedByDate: Record<
      string,
      Array<{
        id: string;
        title: string;
        date: Date;
        duration: number;
        status: string;
        segmentCount: number;
        speakerCount: number;
        hasInsights: boolean;
      }>
    > = {};

    recordings.forEach((recording) => {
      const dateKey = recording.date.toISOString().split("T")[0];
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      groupedByDate[dateKey].push({
        id: recording.id,
        title: recording.title,
        date: recording.date,
        duration: recording.duration,
        status: recording.status,
        segmentCount: recording._count.segments,
        speakerCount: recording._count.speakers,
        hasInsights: !!recording.insights,
      });
    });

    // Also get dates that have recordings for calendar highlighting
    const datesWithRecordings = Object.keys(groupedByDate);

    return NextResponse.json({
      grouped: groupedByDate,
      dates: datesWithRecordings,
    });
  } catch (error) {
    console.error("Error fetching recordings by date:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
