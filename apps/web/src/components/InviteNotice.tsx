"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GameInviteSummary } from "@calculus/db";
import { usePathname, useRouter } from "@/i18n/navigation";
import { leaveLobby } from "@/lib/colyseus";
import { dismissInvite, fetchInvites } from "@/lib/friends";

/** Intervalle entre deux vérifications des invitations reçues, en ms. */
const POLL_MS = 15_000;
/** Onglet en arrière-plan : une vérification par minute suffit (elle garde le joueur « en ligne » dans sa guilde). */
const HIDDEN_POLL_MS = 60_000;
/** Bandeaux affichés à la fois (les plus récents) ; les autres prennent la place de ceux qu'on ignore ou rejoint. */
const MAX_SHOWN = 3;

/** Bandeau des invitations à une partie, affiché sur toutes les pages au joueur connecté. */
export function InviteNotice() {
  const t = useTranslations("friends");
  const router = useRouter();
  const pathname = usePathname();
  const [invites, setInvites] = useState<GameInviteSummary[]>([]);

  const lastPoll = useRef(0);
  const refresh = useCallback(async () => {
    const now = Date.now();
    if (document.visibilityState !== "visible" && now - lastPoll.current < HIDDEN_POLL_MS) return;
    lastPoll.current = now;
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

  const pending = invites.filter((i) => !isHere(i));
  if (!pending.length) return null;
  const shown = pending.slice(0, MAX_SHOWN);
  const hidden = pending.length - shown.length;

  const drop = (id: string) => {
    setInvites((list) => list.filter((i) => i.id !== id));
    void dismissInvite(id);
  };

  return (
    <div className="invite-notices" role="status">
      {shown.map((i) => (
        <div className="invite-notice" key={i.id}>
          <span>{i.guildName ? t("noticeGuild", { name: i.fromName, guild: i.guildName }) : t("noticeText", { name: i.fromName })}</span>
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
      {hidden > 0 ? <p className="invite-more muted">{t("noticeMore", { count: hidden })}</p> : null}
    </div>
  );
}
