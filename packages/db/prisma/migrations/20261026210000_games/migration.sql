-- DropIndex
DROP INDEX "question_gameId_position_key";

-- DropIndex
DROP INDEX "rating_mode_difficulty_rating_idx";

-- AlterTable
ALTER TABLE "answer" ADD COLUMN     "text" TEXT;

-- AlterTable
ALTER TABLE "game" ADD COLUMN     "game" TEXT NOT NULL DEFAULT 'standard';

-- AlterTable
ALTER TABLE "question" ADD COLUMN     "authorPlayerKey" TEXT,
ADD COLUMN     "forPlayerKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "puzzle" JSONB,
ADD COLUMN     "solution" TEXT;

-- AlterTable
ALTER TABLE "rating" DROP CONSTRAINT "rating_pkey",
ADD COLUMN     "game" TEXT NOT NULL DEFAULT 'standard',
ADD CONSTRAINT "rating_pkey" PRIMARY KEY ("userId", "game", "mode", "difficulty");

-- CreateIndex
CREATE INDEX "game_game_mode_difficulty_idx" ON "game"("game", "mode", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "question_gameId_position_forPlayerKey_key" ON "question"("gameId", "position", "forPlayerKey");

-- CreateIndex
CREATE INDEX "rating_game_mode_difficulty_rating_idx" ON "rating"("game", "mode", "difficulty", "rating");

