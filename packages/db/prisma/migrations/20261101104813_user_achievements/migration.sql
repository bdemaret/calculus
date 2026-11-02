-- AlterTable
ALTER TABLE "user" ADD COLUMN     "titleId" TEXT;

-- CreateTable
CREATE TABLE "user_achievement" (
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gameId" TEXT,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "user_achievement_pkey" PRIMARY KEY ("userId","achievementId")
);

-- CreateTable
CREATE TABLE "user_title" (
    "userId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_title_pkey" PRIMARY KEY ("userId","titleId")
);

-- CreateTable
CREATE TABLE "user_counter" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_counter_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE INDEX "user_achievement_achievementId_idx" ON "user_achievement"("achievementId");

-- CreateIndex
CREATE INDEX "user_achievement_gameId_idx" ON "user_achievement"("gameId");

-- AddForeignKey
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_title" ADD CONSTRAINT "user_title_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_counter" ADD CONSTRAINT "user_counter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
