import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeEndWord } from "@/lib/endWords";

export const runtime = "nodejs";

// GET /api/settings/end-words - List configured end words
export async function GET() {
  try {
    const endWords = await prisma.endWord.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(endWords);
  } catch (error) {
    console.error("Error fetching end words:", error);
    return NextResponse.json(
      { error: "Failed to fetch end words" },
      { status: 500 }
    );
  }
}

// POST /api/settings/end-words - Add an end word
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = typeof body?.word === "string" ? body.word : "";
    const word = normalizeEndWord(raw);

    if (!word) {
      return NextResponse.json(
        { error: "A non-empty word or phrase is required" },
        { status: 400 }
      );
    }

    if (word.length > 60) {
      return NextResponse.json(
        { error: "End word must be 60 characters or fewer" },
        { status: 400 }
      );
    }

    const created = await prisma.endWord.upsert({
      where: { word },
      update: {},
      create: { word },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error adding end word:", error);
    return NextResponse.json(
      { error: "Failed to add end word" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/end-words?id=... - Remove an end word
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "An id query parameter is required" },
        { status: 400 }
      );
    }

    await prisma.endWord.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting end word:", error);
    return NextResponse.json(
      { error: "Failed to delete end word" },
      { status: 500 }
    );
  }
}
