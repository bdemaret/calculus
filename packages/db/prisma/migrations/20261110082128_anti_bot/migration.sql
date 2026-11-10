-- AlterTable
ALTER TABLE "user" ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "bannedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bot_report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "rules" TEXT[],
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "bot_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_report_reviewedAt_createdAt_idx" ON "bot_report"("reviewedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bot_report_userId_source_ref_key" ON "bot_report"("userId", "source", "ref");

-- AddForeignKey
ALTER TABLE "bot_report" ADD CONSTRAINT "bot_report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
