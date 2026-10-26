"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { PlayerProfile } from "@calculus/db";
import { Link, useRouter } from "@/i18n/navigation";
import { Avatar } from "@/components/PlayerChips";
import { formatPercent } from "@/lib/format";

/** Profil public : places au classement et bouton pour ajouter le joueur en ami. */
export function PlayerView({ profile }: { profile: PlayerProfile }) {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <section className="report">
      <div className="setup-head player-head">
        <Avatar name={profile.name} />
        <h2>{profile.name}</h2>
      </div>

      <FriendAction profile={profile} />

      <div className="stack">
        <h3>{t("player.rankingsTitle")}</h3>
        {profile.rankings.length ? (
          <div className="scroll-x">
            <table className="games board" aria-label={t("player.rankingsTitle")}>
              <thead>
                <tr>
                  <th>{t("player.mode")}</th>
                  <th>{t("settings.difficulty")}</th>
                  <th>{t("leaderboard.rank")}</th>
                  <th>{t("dashboard.elo")}</th>
                  <th>{t("leaderboard.games")}</th>
                  <th>{t("leaderboard.winRate")}</th>
                </tr>
              </thead>
              <tbody>
                {profile.rankings.map((r) => (
                  <tr key={`${r.mode}-${r.difficulty}`}>
                    <td>
                      <Link href={{ pathname: `/leaderboard/${r.mode}`, query: { difficulty: r.difficulty } }}>{t(`modes.${r.mode}.name`)}</Link>
                    </td>
                    <td>{t(`levels.${r.difficulty}`)}</td>
                    <td className="rk">{t("player.rankOf", { rank: r.rank, total: r.total })}</td>
                    <td>
                      <strong>{r.rating}</strong>
                    </td>
                    <td>{r.games}</td>
                    <td>{formatPercent(r.games ? r.wins / r.games : 0, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t("player.unranked")}</p>
        )}
      </div>

      <p>
        <Link href="/leaderboard">{t("player.backToLeaderboard")}</Link>
      </p>
    </section>
  );
}

/** Ajouter, accepter, annuler : selon le lien entre le joueur connecté et celui du profil. */
function FriendAction({ profile }: { profile: PlayerProfile }) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le nouvel état (demande envoyée, amis…) est relu par la page serveur : seules les erreurs s'affichent ici.
  async function call(method: "POST" | "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/friends", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: profile.id }) });
      if (!res.ok) setError(t(`friends.error.${((await res.json()) as { error?: string }).error ?? "generic"}`));
      router.refresh();
    } catch {
      setError(t("friends.error.generic"));
    }
    setBusy(false);
  }

  const name = profile.name;
  let content: React.ReactNode;
  switch (profile.friendship) {
    case null:
      content = (
        <p className="muted">
          <Link href="/login">{t("player.loginToAdd")}</Link>
        </p>
      );
      break;
    case "self":
      content = (
        <p className="muted">
          {t("player.self")} <Link href="/profile">{t("player.myProfile")}</Link>
        </p>
      );
      break;
    case "none":
      content = (
        <button className="btn" type="button" disabled={busy} onClick={() => call("POST")}>
          {t("player.add")}
        </button>
      );
      break;
    case "outgoing":
      content = (
        <>
          <span className="muted">{t("player.outgoing", { name })}</span>
          <button className="link-btn" type="button" disabled={busy} onClick={() => call("DELETE")}>
            {t("friends.cancel")}
          </button>
        </>
      );
      break;
    case "incoming":
      content = (
        <>
          <span className="muted">{t("player.incoming", { name })}</span>
          <button className="btn" type="button" disabled={busy} onClick={() => call("PATCH")}>
            {t("friends.accept")}
          </button>
          <button className="link-btn" type="button" disabled={busy} onClick={() => call("DELETE")}>
            {t("friends.decline")}
          </button>
        </>
      );
      break;
    case "friends":
      content = (
        <>
          <span className="muted">{t("player.friends", { name })}</span>
          <Link href="/friends">{t("friends.manage")}</Link>
        </>
      );
      break;
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="actions">{content}</div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
