"use client";
import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { leaveLobby } from "@/lib/colyseus";
import { abandonDungeon, readDungeonSeat, subscribeDungeonSeat } from "@/lib/dungeon";

/**
 * Bandeau « Revenir dans la partie », présenté comme une invitation, sur toutes les pages sauf celle du donjon :
 * après un rechargement, un onglet fermé ou une page quittée en pleine expédition, la place reste gardée.
 * « Quitter » la rend pour de bon.
 */
export function DungeonReturnNotice() {
  const t = useTranslations("dungeon.return");
  const router = useRouter();
  const pathname = usePathname();
  const seat = useSyncExternalStore(subscribeDungeonSeat, readDungeonSeat, () => null);
  const [busy, setBusy] = useState(false);

  if (!seat) return null;
  const href = `/dungeon/${seat.code}`;
  if (pathname.toUpperCase() === href.toUpperCase()) return null;

  return (
    <div className="invite-notices" role="status">
      <div className="invite-notice">
        <span>{t("text", { code: seat.code })}</span>
        <span className="actions">
          <button
            className="btn"
            type="button"
            onClick={() => {
              // On n'est jamais dans un lobby et un donjon à la fois.
              leaveLobby();
              router.push(href);
            }}
          >
            {t("rejoin")}
          </button>
          <button
            className="link-btn"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void abandonDungeon(seat.code).finally(() => setBusy(false));
            }}
          >
            {t("quit")}
          </button>
        </span>
      </div>
    </div>
  );
}
