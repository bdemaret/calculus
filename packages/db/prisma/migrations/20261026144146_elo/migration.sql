-- AlterTable
ALTER TABLE "game_player" ADD COLUMN     "ratingBefore" INTEGER,
ADD COLUMN     "ratingDelta" INTEGER;

-- CreateTable
CREATE TABLE "rating" (
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "games" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_pkey" PRIMARY KEY ("userId","mode","difficulty")
);

-- CreateIndex
CREATE INDEX "rating_mode_difficulty_rating_idx" ON "rating"("mode", "difficulty", "rating");

-- AddForeignKey
ALTER TABLE "rating" ADD CONSTRAINT "rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
