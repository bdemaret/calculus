-- Une invitation par lobby et par paire, au lieu d'une seule par paire.
-- DropIndex
DROP INDEX "game_invite_fromId_toId_key";

-- CreateIndex
CREATE INDEX "game_invite_code_idx" ON "game_invite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "game_invite_fromId_toId_code_key" ON "game_invite"("fromId", "toId", "code");
