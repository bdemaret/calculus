"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { GameInviteSummary } from "@calculus/db";
import { usePathname, useRouter } from "@/i18n/navigation";
import { leaveLobby } from "@/lib/colyseus";
import { dismissInvite, fetchInvites } from "@/lib/friends";

/** Intervalle entre deux vérifications des invitations reçues, en ms. */
const POLL_MS = 15_000;

/** Bandeau des invitations à une partie, affiché sur toutes les pages au joueur connecté. */
export function InviteNotice() {
  const t = useTranslations("friends");
  const router = useRouter();
  const pathname = usePathname();
  const [invites, setInvites] = useState<GameInviteSummary[]>([]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    setInvites(await fetchInvites());
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh]);

  // Déjà dans le lobby de l'invitation : elle n'a plus lieu d'être.
  const isHere = useCallback((i: GameInviteSummary) => pathname === `/lobby/${i.code}`, [pathname]);
  useEffect(() => {
    const here = invites.filter(isHere);
    if (!here.length) return;
    here.forEach((i) => void dismissInvite(i.id));
    setInvites((list) => list.filter((i) => !isHere(i)));
  }, [invites, isHere]);

  const shown = invites.filter((i) => !isHere(i));
  if (!shown.length) return null;

  const drop = (id: string) => {
    setInvites((list) => list.filter((i) => i.id !== id));
    void dismissInvite(id);
  };

  return (
    <div className="invite-notices" role="status">
      {shown.map((i) => (
        <div className="invite-notice" key={i.id}>
          <span>{t("noticeText", { name: i.fromName })}</span>
          <span className="actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                drop(i.id);
                // Quitte proprement le lobby en cours avant d'entrer dans le nouveau.
                leaveLobby();
                router.push(`/lobby/${i.code}`);
              }}
            >
              {t("noticeJoin")}
            </button>
            <button className="link-btn" type="button" onClick={() => drop(i.id)}>
              {t("noticeIgnore")}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
