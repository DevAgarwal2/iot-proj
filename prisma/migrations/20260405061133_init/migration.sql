-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "audioPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "startTime" REAL NOT NULL DEFAULT 0,
    "endTime" REAL NOT NULL DEFAULT 0,
    "languageCode" TEXT NOT NULL DEFAULT 'en-IN',
    "confidence" REAL,
    "recordingId" TEXT NOT NULL,
    "speakerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TranscriptSegment_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TranscriptSegment_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Speaker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "color" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    CONSTRAINT "Speaker_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Insights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summary" TEXT NOT NULL,
    "keyPoints" TEXT NOT NULL,
    "topics" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "recordingId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Insights_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Recording_date_idx" ON "Recording"("date");

-- CreateIndex
CREATE INDEX "TranscriptSegment_recordingId_idx" ON "TranscriptSegment"("recordingId");

-- CreateIndex
CREATE INDEX "TranscriptSegment_speakerId_idx" ON "TranscriptSegment"("speakerId");

-- CreateIndex
CREATE INDEX "Speaker_recordingId_idx" ON "Speaker"("recordingId");

-- CreateIndex
CREATE UNIQUE INDEX "Speaker_recordingId_label_key" ON "Speaker"("recordingId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Insights_recordingId_key" ON "Insights"("recordingId");
