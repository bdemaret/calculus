"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { FriendSummary } from "@calculus/db";
import { Link } from "@/i18n/navigation";
import { fetchFriends, inviteFriend } from "@/lib/friends";
import { Avatar } from "./PlayerChips";

/** Encart du lobby : inviter ses amis à rejoindre ce code (joueurs connectés uniquement). */
export function InviteFriends({ code, presentIds }: { code: string; presentIds: string[] }) {
  const t = useTranslations("friends");
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [state, setState] = useState<Record<string, "sending" | "sent" | "error">>({});

  useEffect(() => {
    let alive = true;
    void fetchFriends().then((d) => alive && setFriends(d?.friends ?? []));
    return () => {
      alive = false;
    };
  }, []);

  if (!friends) return null;
  // Les amis déjà dans le lobby n'ont pas besoin d'invitation.
  const invitable = friends.filter((f) => !presentIds.includes(f.id));

  const send = async (id: string) => {
    setState((s) => ({ ...s, [id]: "sending" }));
    const ok = await inviteFriend(id, code);
    setState((s) => ({ ...s, [id]: ok ? "sent" : "error" }));
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      <h3>{t("lobbyTitle")}</h3>
      {invitable.length ? (
        <ul className="friend-list compact">
          {invitable.map((f) => (
            <li key={f.id}>
              <Avatar name={f.name} />
              <span className="nm">{f.name}</span>
              <span className="friend-actions">
                {state[f.id] === "sent" ? (
                  <span className="host">{t("lobbyInvited")}</span>
                ) : (
                  <button className="btn ghost" type="button" disabled={state[f.id] === "sending"} onClick={() => send(f.id)}>
                    {state[f.id] === "error" ? t("lobbyRetry") : t("lobbyInvite")}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{friends.length ? t("lobbyAllHere") : t("lobbyEmpty")}</p>
      )}
      <p>
        <Link href="/friends">{t("manage")}</Link>
      </p>
    </div>
  );
}
