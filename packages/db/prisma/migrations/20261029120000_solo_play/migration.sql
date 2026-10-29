-- CreateTable
CREATE TABLE "solo_play" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "game" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "gameId" TEXT,

    CONSTRAINT "solo_play_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solo_play_gameId_key" ON "solo_play"("gameId");

-- CreateIndex
CREATE INDEX "solo_play_startedAt_idx" ON "solo_play"("startedAt");

-- CreateIndex
CREATE INDEX "solo_play_endedAt_lastSeenAt_idx" ON "solo_play"("endedAt", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "solo_play" ADD CONSTRAINT "solo_play_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solo_play" ADD CONSTRAINT "solo_play_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

