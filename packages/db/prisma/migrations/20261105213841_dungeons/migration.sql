-- AlterTable
ALTER TABLE "game_invite" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'game';

-- CreateTable
CREATE TABLE "dungeon_run" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "lossReason" TEXT,
    "roundsPlayed" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "enemiesDefeated" INTEGER NOT NULL,
    "bossMaxHp" INTEGER,
    "bossHp" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dungeon_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeon_run_player" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT,
    "playerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "lives" INTEGER NOT NULL,
    "livesLost" INTEGER NOT NULL,
    "enemiesDefeated" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "bossDamage" INTEGER NOT NULL,
    "heartsGiven" INTEGER NOT NULL,
    "heartsReceived" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "answered" INTEGER NOT NULL,
    "avgTimeMs" INTEGER,

    CONSTRAINT "dungeon_run_player_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dungeon_run_endedAt_idx" ON "dungeon_run"("endedAt");

-- CreateIndex
CREATE INDEX "dungeon_run_player_userId_idx" ON "dungeon_run_player"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dungeon_run_player_runId_playerKey_key" ON "dungeon_run_player"("runId", "playerKey");

-- AddForeignKey
ALTER TABLE "dungeon_run_player" ADD CONSTRAINT "dungeon_run_player_runId_fkey" FOREIGN KEY ("runId") REFERENCES "dungeon_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dungeon_run_player" ADD CONSTRAINT "dungeon_run_player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
