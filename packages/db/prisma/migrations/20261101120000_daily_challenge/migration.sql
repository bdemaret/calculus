-- CreateTable
CREATE TABLE "daily_challenge" (
    "date" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "daily_challenge_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "daily_run" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "index" INTEGER NOT NULL DEFAULT 0,
    "questionAt" TIMESTAMP(3),
    "correct" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "won" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "daily_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_challenge_settledAt_idx" ON "daily_challenge"("settledAt");

-- CreateIndex
CREATE UNIQUE INDEX "daily_run_token_key" ON "daily_run"("token");

-- CreateIndex
CREATE INDEX "daily_run_date_finishedAt_correct_totalTimeMs_idx" ON "daily_run"("date", "finishedAt", "correct", "totalTimeMs");

-- CreateIndex
CREATE INDEX "daily_run_userId_won_idx" ON "daily_run"("userId", "won");

-- CreateIndex
CREATE UNIQUE INDEX "daily_run_date_userId_key" ON "daily_run"("date", "userId");

-- AddForeignKey
ALTER TABLE "daily_run" ADD CONSTRAINT "daily_run_date_fkey" FOREIGN KEY ("date") REFERENCES "daily_challenge"("date") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_run" ADD CONSTRAINT "daily_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

