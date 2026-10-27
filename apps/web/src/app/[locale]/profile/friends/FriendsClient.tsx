"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { FriendsData } from "@calculus/db";
import { useRouter } from "@/i18n/navigation";
import { Margin, MarginNote } from "@/components/Margin";
import { Avatar } from "@/components/PlayerChips";
import { JoinError } from "@/lib/colyseus";
import { createInviteLobby, inviteFriend } from "@/lib/friends";

type Feedback = { ok: boolean; text: string } | null;

/** Onglet « Mes amis » du profil : ajout par pseudo ou e-mail, demandes en attente, liste des amis à inviter. */
export function FriendsClient({ data }: { data: FriendsData }) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", userId: string) {
    setBusy(userId);
    await fetch("/api/friends", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) }).catch(() => null);
    setBusy(null);
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const h = handle.trim();
    if (!h) return;
    setBusy("add");
    setFeedback(null);
    try {
      const res = await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: h }) });
      const body = (await res.json()) as { status?: string; name?: string; error?: string };
      if (res.ok && body.status && body.name) {
        setFeedback({ ok: true, text: t(`friends.result.${body.status}`, { name: body.name }) });
        setHandle("");
        router.refresh();
      } else {
        setFeedback({ ok: false, text: t(`friends.error.${body.error ?? "generic"}`) });
      }
    } catch {
      setFeedback({ ok: false, text: t("friends.error.generic") });
    }
    setBusy(null);
  }

  // Crée un lobby avec ses réglages habituels, invite l'ami, puis entre dans le lobby.
  async function invite(userId: string) {
    setBusy(userId);
    setInviteError(null);
    try {
      const code = await createInviteLobby();
      if (!(await inviteFriend(userId, code))) throw new Error("invite");
      router.push(`/lobby/${code}`);
    } catch (err) {
      setInviteError(err instanceof JoinError ? t(`errors.${err.code}`) : t("friends.inviteError"));
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <Margin>
        <MarginNote value={t("friends.margin")} />
      </Margin>
      <p className="muted">{t("friends.intro")}</p>

      <form className="friend-add" onSubmit={add}>
        <label className="field-label" htmlFor="friend-handle">
          {t("friends.addLabel")}
        </label>
        <div className="friend-add-row">
          <input
            className="text-input"
            id="friend-handle"
            maxLength={254}
            autoComplete="off"
            placeholder={t("friends.addPlaceholder")}
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              setFeedback(null);
            }}
          />
          <button className="btn" type="submit" disabled={busy === "add" || !handle.trim()}>
            {t("friends.add")}
          </button>
        </div>
        {feedback ? <p className={feedback.ok ? "form-ok" : "form-error"}>{feedback.text}</p> : null}
      </form>

      {data.incoming.length ? (
        <div className="stack" style={{ gap: 10 }}>
          <h3>{t("friends.incomingTitle")}</h3>
          <ul className="friend-list">
            {data.incoming.map((u) => (
              <li key={u.id}>
                <Avatar name={u.name} image={u.image} />
                <span className="nm">{u.name}</span>
                <span className="friend-actions">
                  <button className="btn" type="button" disabled={busy === u.id} onClick={() => call("PATCH", u.id)}>
                    {t("friends.accept")}
                  </button>
                  <button className="link-btn" type="button" disabled={busy === u.id} onClick={() => call("DELETE", u.id)}>
                    {t("friends.decline")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="stack" style={{ gap: 10 }}>
        <h3>{t("friends.listTitle", { count: data.friends.length })}</h3>
        {data.friends.length ? (
          <ul className="friend-list">
            {data.friends.map((f) => (
              <li key={f.id}>
                <Avatar name={f.name} image={f.image} />
                <span className="nm">
                  {f.name}
                  <span className="sub">
                    {t("friends.stats", { games: f.gamesPlayed, wins: f.wins })}
                    {f.accuracy !== null ? ` · ${t("friends.accuracy", { pct: format.number(f.accuracy, { style: "percent" }) })}` : ""}
                  </span>
                </span>
                <span className="friend-actions">
                  <button className="btn" type="button" disabled={busy !== null} onClick={() => invite(f.id)}>
                    {busy === f.id ? t("friends.inviting") : t("friends.invite")}
                  </button>
                  <button
                    className="link-btn"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (window.confirm(t("friends.removeConfirm", { name: f.name }))) void call("DELETE", f.id);
                    }}
                  >
                    {t("friends.remove")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("friends.empty")}</p>
        )}
        {inviteError ? <p className="form-error">{inviteError}</p> : null}
      </div>

      {data.outgoing.length ? (
        <div className="stack" style={{ gap: 10 }}>
          <h3>{t("friends.outgoingTitle")}</h3>
          <ul className="friend-list">
            {data.outgoing.map((u) => (
              <li key={u.id}>
                <Avatar name={u.name} image={u.image} />
                <span className="nm">
                  {u.name}
                  <span className="sub">{t("friends.pending")}</span>
                </span>
                <span className="friend-actions">
                  <button className="link-btn" type="button" disabled={busy === u.id} onClick={() => call("DELETE", u.id)}>
                    {t("friends.cancel")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
