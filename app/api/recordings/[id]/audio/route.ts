import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAudioUrl, readLocalAudio } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/recordings/[id]/audio - Redirect to S3 (presigned) or stream locally
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recording = await prisma.recording.findUnique({ where: { id } });

    if (!recording?.audioPath) {
      return NextResponse.json(
        { error: "Audio not available" },
        { status: 404 }
      );
    }

    const signedUrl = await getAudioUrl(recording.audioPath);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl);
    }

    const bytes = await readLocalAudio(recording.audioPath);
    if (!bytes) {
      return NextResponse.json(
        { error: "Audio not available" },
        { status: 404 }
      );
    }

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching audio:", error);
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: 500 }
    );
  }
}
