-- CreateEnum
CREATE TYPE "GuildRole" AS ENUM ('leader', 'member');

-- AlterTable
ALTER TABLE "game_invite" ADD COLUMN     "guildId" TEXT;

-- CreateTable
CREATE TABLE "guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "crest" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_member" (
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "role" "GuildRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "guild_member_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "guild_invite" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "fromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_crest" (
    "guildId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_crest_pkey" PRIMARY KEY ("guildId")
);

-- CreateIndex
CREATE UNIQUE INDEX "guild_nameKey_key" ON "guild"("nameKey");

-- CreateIndex
CREATE INDEX "guild_member_guildId_idx" ON "guild_member"("guildId");

-- CreateIndex
CREATE INDEX "guild_invite_toId_idx" ON "guild_invite"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_invite_guildId_toId_key" ON "guild_invite"("guildId", "toId");

-- AddForeignKey
ALTER TABLE "game_invite" ADD CONSTRAINT "game_invite_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member" ADD CONSTRAINT "guild_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_member" ADD CONSTRAINT "guild_member_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_invite" ADD CONSTRAINT "guild_invite_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_invite" ADD CONSTRAINT "guild_invite_toId_fkey" FOREIGN KEY ("toId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_invite" ADD CONSTRAINT "guild_invite_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_crest" ADD CONSTRAINT "guild_crest_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
