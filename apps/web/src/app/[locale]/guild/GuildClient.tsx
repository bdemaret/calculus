"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GUILD_MAX_MEMBERS, GUILD_NAME_MAX, GUILD_NAME_MIN, cleanGuildName } from "@calculus/db/guild";
import type { GuildMemberSummary, GuildView, ReceivedGuildInvite } from "@calculus/db";
import { Link, useRouter } from "@/i18n/navigation";
import { GuildCrest } from "@/components/GuildCrest";
import { Margin, MarginNote } from "@/components/Margin";
import { Avatar } from "@/components/PlayerChips";
import { squareAvatar } from "@/lib/avatar";
import { JoinError } from "@/lib/colyseus";
import { createInviteLobby } from "@/lib/friends";

type Status = { ok: boolean; text: string } | null;

/** Rafraîchissement de la page (membres en ligne, nouvelles invitations), en ms. */
const REFRESH_MS = 30_000;

const JSON_HEADERS = { "content-type": "application/json" };

/** Appel JSON aux routes de guilde ; renvoie le code d'erreur du serveur, null si tout s'est bien passé. */
async function send(url: string, method: string, body?: unknown): Promise<{ error: string | null; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { error: res.ok ? null : typeof data.error === "string" ? data.error : "generic", data };
  } catch {
    return { error: "generic", data: {} };
  }
}

/** Page de la guilde du joueur, ou, sans guilde, ses invitations reçues et la fondation d'une guilde. */
export function GuildClient({ guild, invites, meId }: { guild: GuildView | null; invites: ReceivedGuildInvite[]; meId: string }) {
  const t = useTranslations("guild");
  const router = useRouter();

  // Les statuts en ligne et les invitations bougent sans action de la page : on la relit régulièrement.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <section className="profile guild">
      <Margin>
        <MarginNote value={t("margin")} />
      </Margin>
      {guild ? <MyGuild guild={guild} meId={meId} /> : <NoGuild invites={invites} />}
    </section>
  );
}

/* ---------- Sans guilde ---------- */

function NoGuild({ invites }: { invites: ReceivedGuildInvite[] }) {
  const t = useTranslations("guild");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  async function answer(id: string, method: "PATCH" | "DELETE") {
    setBusy(id);
    setStatus(null);
    const { error } = await send("/api/guild/invites", method, { id });
    if (error) setStatus({ ok: false, text: t(`error.${error}`) });
    setBusy(null);
    router.refresh();
  }

  return (
    <>
      <h2>{t("title")}</h2>
      <p className="muted">{t("intro", { max: GUILD_MAX_MEMBERS })}</p>

      {invites.length ? (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{t("invitesTitle")}</h3>
          <ul className="friend-list">
            {invites.map((i) => (
              <li key={i.id}>
                <GuildCrest name={i.guildName} crest={i.crest} />
                <span className="nm">
                  {i.guildName}
                  <span className="sub">
                    {t("membersCount", { count: i.members, max: GUILD_MAX_MEMBERS })}
                    {i.fromName ? ` · ${t("invitedBy", { name: i.fromName })}` : ""}
                  </span>
                </span>
                <span className="friend-actions">
                  <button className="btn" type="button" disabled={busy !== null} onClick={() => answer(i.id, "PATCH")}>
                    {t("accept")}
                  </button>
                  <button className="link-btn" type="button" disabled={busy !== null} onClick={() => answer(i.id, "DELETE")}>
                    {t("decline")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {status ? <p className={status.ok ? "form-ok" : "form-error"}>{status.text}</p> : null}
        </div>
      ) : null}

      <CreateGuild />
    </>
  );
}

function CreateGuild() {
  const t = useTranslations("guild");
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (cleanGuildName(name).length < GUILD_NAME_MIN) return setError(t("error.name-invalid", { min: GUILD_NAME_MIN, max: GUILD_NAME_MAX }));
    setBusy(true);
    setError(null);
    const res = await send("/api/guild", "POST", { name });
    setBusy(false);
    if (res.error) return setError(t(`error.${res.error}`, { min: GUILD_NAME_MIN, max: GUILD_NAME_MAX }));
    router.refresh();
  }

  return (
    <form className="friend-add" onSubmit={create}>
      <h3>{t("createTitle")}</h3>
      <label className="field-label" htmlFor="guild-name">
        {t("nameLabel")}
      </label>
      <div className="friend-add-row">
        <input
          className="text-input"
          id="guild-name"
          maxLength={GUILD_NAME_MAX}
          autoComplete="off"
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <button className="btn" type="submit" disabled={busy || !name.trim()}>
          {t("create")}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

/* ---------- Dans une guilde ---------- */

function MyGuild({ guild, meId }: { guild: GuildView; meId: string }) {
  const t = useTranslations("guild");
  const leader = guild.myRole === "leader";
  const online = guild.members.filter((m) => m.online);
  const offline = guild.members.filter((m) => !m.online);

  return (
    <>
      <GuildHead guild={guild} leader={leader} />
      <GuildLobby alone={guild.members.length < 2} />

      <div className="stack" style={{ gap: 8 }}>
        <h3>{t("onlineTitle", { count: online.length })}</h3>
        <MemberList members={online} meId={meId} leader={leader} />
      </div>
      {offline.length ? (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{t("offlineTitle", { count: offline.length })}</h3>
          <MemberList members={offline} meId={meId} leader={leader} />
        </div>
      ) : null}

      <InviteMembers guild={guild} />
      <LeaveGuild leader={leader} last={guild.members.length === 1} />
    </>
  );
}

/** En-tête : blason, nom et nombre de membres ; le chef peut renommer et changer le blason. */
function GuildHead({ guild, leader }: { guild: GuildView; leader: boolean }) {
  const t = useTranslations("guild");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(guild.name);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const params = { min: GUILD_NAME_MIN, max: GUILD_NAME_MAX };

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (cleanGuildName(name).length < GUILD_NAME_MIN) return setStatus({ ok: false, text: t("error.name-invalid", params) });
    setBusy(true);
    const { error } = await send("/api/guild", "PATCH", { name });
    setBusy(false);
    if (error) return setStatus({ ok: false, text: t(`error.${error}`, params) });
    setStatus(null);
    setRenaming(false);
    router.refresh();
  }

  async function upload(file: File) {
    setBusy(true);
    setStatus(null);
    try {
      const body = new FormData();
      body.set("file", await squareAvatar(file));
      const res = await fetch("/api/guild/crest", { method: "POST", body });
      if (!res.ok) setStatus({ ok: false, text: t("crestError") });
    } catch {
      setStatus({ ok: false, text: t("crestError") });
    }
    setBusy(false);
    router.refresh();
  }

  async function removeCrest() {
    setBusy(true);
    const { error } = await send("/api/guild/crest", "DELETE");
    if (error) setStatus({ ok: false, text: t("crestError") });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="profile-head">
        <GuildCrest className="lg" name={guild.name} crest={guild.crest} />
        <div>
          <h2>{guild.name}</h2>
          <p className="muted">{t("membersCount", { count: guild.members.length, max: GUILD_MAX_MEMBERS })}</p>
        </div>
      </div>
      {leader ? (
        <>
          {renaming ? (
            <form className="friend-add" onSubmit={rename}>
              <label className="field-label" htmlFor="guild-rename">
                {t("nameLabel")}
              </label>
              <div className="friend-add-row">
                <input
                  className="text-input"
                  id="guild-rename"
                  maxLength={GUILD_NAME_MAX}
                  autoComplete="off"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setStatus(null);
                  }}
                />
                <button className="btn" type="submit" disabled={busy || !name.trim()}>
                  {t("save")}
                </button>
                <button
                  className="link-btn"
                  type="button"
                  onClick={() => {
                    setRenaming(false);
                    setName(guild.name);
                    setStatus(null);
                  }}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          ) : null}
          <p className="actions">
            {!renaming ? (
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setRenaming(true)}>
                {t("rename")}
              </button>
            ) : null}
            <button className="btn ghost" type="button" disabled={busy} onClick={() => input.current?.click()}>
              {guild.crest ? t("crestChange") : t("crestAdd")}
            </button>
            {guild.crest ? (
              <button className="link-btn" type="button" disabled={busy} onClick={removeCrest}>
                {t("crestRemove")}
              </button>
            ) : null}
          </p>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={guild.crest ? t("crestChange") : t("crestAdd")}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          {status ? <p className={status.ok ? "form-ok" : "form-error"}>{status.text}</p> : null}
        </>
      ) : null}
    </div>
  );
}

/** Lobby de guilde : crée un lobby privé et invite tous les autres membres. */
function GuildLobby({ alone }: { alone: boolean }) {
  const t = useTranslations("guild");
  const tRoot = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const code = await createInviteLobby();
      const { error: err } = await send("/api/guild/lobby", "POST", { code });
      if (err) throw new Error(err);
      router.push(`/lobby/${code}`);
    } catch (err) {
      setError(err instanceof JoinError ? tRoot(`errors.${err.code}`) : t("lobbyError"));
      setBusy(false);
    }
  }

  return (
    <div className="profile-card">
      <h3>{t("lobbyTitle")}</h3>
      <p className="muted">{alone ? t("lobbyAlone") : t("lobbyText")}</p>
      <p>
        <button className="btn" type="button" disabled={busy || alone} onClick={start}>
          {busy ? t("lobbyCreating") : t("lobbyCreate")}
        </button>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

function MemberList({ members, meId, leader }: { members: GuildMemberSummary[]; meId: string; leader: boolean }) {
  const t = useTranslations("guild");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(m: GuildMemberSummary, method: "PATCH" | "DELETE") {
    const question = method === "PATCH" ? t("makeLeaderConfirm", { name: m.name }) : t("kickConfirm", { name: m.name });
    if (!window.confirm(question)) return;
    setBusy(m.id);
    setError(null);
    const res = await send("/api/guild/members", method, { userId: m.id });
    if (res.error) setError(t(`error.${res.error}`));
    setBusy(null);
    router.refresh();
  }

  if (!members.length) return <p className="muted">{t("noneOnline")}</p>;
  return (
    <>
      <ul className="friend-list guild-members">
        {members.map((m) => (
          <li key={m.id} data-online={m.online || undefined}>
            <span className="presence-avatar">
              <Avatar name={m.name} image={m.image} />
              <span className={m.online ? "presence on" : "presence"} aria-hidden="true" />
            </span>
            <span className="nm">
              {m.id === meId ? (
                m.name
              ) : (
                <Link className="plain-link" href={`/player/${m.id}`}>
                  {m.name}
                </Link>
              )}
              {m.role === "leader" ? <span className="guild-role">{t("leader")}</span> : null}
              {m.id === meId ? <span className="sub">{t("you")}</span> : null}
            </span>
            {leader && m.id !== meId ? (
              <span className="friend-actions">
                <button className="link-btn" type="button" disabled={busy !== null} onClick={() => act(m, "PATCH")}>
                  {t("makeLeader")}
                </button>
                <button className="link-btn" type="button" disabled={busy !== null} onClick={() => act(m, "DELETE")}>
                  {t("kick")}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="form-error">{error}</p> : null}
    </>
  );
}

/** Invitations : par pseudo ou e-mail, ou parmi ses amis sans guilde ; invitations en attente (annulables par tous). */
function InviteMembers({ guild }: { guild: GuildView }) {
  const t = useTranslations("guild");
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const full = guild.members.length >= GUILD_MAX_MEMBERS;

  async function invite(body: { handle: string } | { userId: string }) {
    setBusy("handle" in body ? "add" : body.userId);
    setStatus(null);
    const res = await send("/api/guild/invites", "POST", body);
    if (res.error) setStatus({ ok: false, text: t(`error.${res.error}`) });
    else {
      setStatus({ ok: true, text: t(`inviteResult.${String(res.data.status)}`, { name: String(res.data.name) }) });
      if ("handle" in body) setHandle("");
    }
    setBusy(null);
    router.refresh();
  }

  async function cancel(id: string) {
    setBusy(id);
    await send("/api/guild/invites", "DELETE", { id });
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form
        className="friend-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (handle.trim()) void invite({ handle: handle.trim() });
        }}
      >
        <h3>{t("inviteTitle")}</h3>
        <label className="field-label" htmlFor="guild-invite">
          {t("inviteLabel")}
        </label>
        <div className="friend-add-row">
          <input
            className="text-input"
            id="guild-invite"
            maxLength={254}
            autoComplete="off"
            placeholder={t("invitePlaceholder")}
            value={handle}
            disabled={full}
            onChange={(e) => {
              setHandle(e.target.value);
              setStatus(null);
            }}
          />
          <button className="btn" type="submit" disabled={full || busy === "add" || !handle.trim()}>
            {t("invite")}
          </button>
        </div>
        {full ? <p className="muted small">{t("error.full", { max: GUILD_MAX_MEMBERS })}</p> : null}
        {status ? <p className={status.ok ? "form-ok" : "form-error"}>{status.text}</p> : null}
      </form>

      {guild.invitableFriends.length && !full ? (
        <div className="stack" style={{ gap: 8 }}>
          <h4>{t("friendsTitle")}</h4>
          <ul className="friend-list compact">
            {guild.invitableFriends.map((f) => (
              <li key={f.id}>
                <Avatar name={f.name} image={f.image} />
                <span className="nm">{f.name}</span>
                <span className="friend-actions">
                  <button className="btn ghost" type="button" disabled={busy !== null} onClick={() => invite({ userId: f.id })}>
                    {t("invite")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {guild.invites.length ? (
        <div className="stack" style={{ gap: 8 }}>
          <h4>{t("pendingTitle")}</h4>
          <ul className="friend-list compact">
            {guild.invites.map((i) => (
              <li key={i.id}>
                <Avatar name={i.name} />
                <span className="nm">
                  {i.name}
                  {i.fromName ? <span className="sub">{t("invitedBy", { name: i.fromName })}</span> : null}
                </span>
                <span className="friend-actions">
                  <button className="link-btn" type="button" disabled={busy !== null} onClick={() => cancel(i.id)}>
                    {t("cancelInvite")}
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

function LeaveGuild({ leader, last }: { leader: boolean; last: boolean }) {
  const t = useTranslations("guild");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (!window.confirm(last ? t("leaveConfirmLast") : leader ? t("leaveConfirmLeader") : t("leaveConfirm"))) return;
    setBusy(true);
    await send("/api/guild", "DELETE");
    setBusy(false);
    router.refresh();
  }

  return (
    <p>
      <button className="link-btn danger" type="button" disabled={busy} onClick={leave}>
        {t("leave")}
      </button>
    </p>
  );
}
