-- AlterTable
ALTER TABLE "dungeon_run" ADD COLUMN     "sealsBroken" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "dungeon_run_player" ADD COLUMN     "itemsFound" INTEGER NOT NULL DEFAULT 0;
