"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CODE_LENGTH, defaultSettings, normalizeCode, sanitizeSettings } from "@calculus/game-core";
import { useRouter } from "@/i18n/navigation";
import { Margin, MarginNote } from "@/components/Margin";
import { JoinError, createLobby } from "@/lib/colyseus";
import { cleanName } from "@/lib/names";
import { local } from "@/lib/storage";

export function OnlineEntry({ accountName }: { accountName: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => setName(local.get("name", "")), []);

  const guestNameOk = !!accountName || cleanName(name).length > 0;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!guestNameOk) {
      setError(t("errors.name-required"));
      return;
    }
    setBusy(true);
    try {
      const settings = sanitizeSettings(local.get("online", defaultSettings(2, "battle-royale")));
      const room = await createLobby(cleanName(name), settings);
      router.push(`/lobby/${room.roomId}`);
    } catch (err) {
      setError(t(`errors.${err instanceof JoinError ? err.code : "generic"}`));
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    if (code.length !== CODE_LENGTH) {
      setJoinError(t("online.codeLength"));
      return;
    }
    if (!guestNameOk) {
      setJoinError(t("errors.name-required"));
      return;
    }
    router.push(`/lobby/${code}`);
  }

  return (
    <section className="setup" style={{ maxWidth: 860 }}>
      <Margin>
        <MarginNote value={t("online.margin")} />
      </Margin>
      <div className="setup-head">
        <h2>{t("online.title")}</h2>
        <p className="muted">{t("online.intro")}</p>
      </div>
      {accountName ? (
        <p>{t("online.connectedAs", { name: accountName })}</p>
      ) : (
        <div className="field" style={{ maxWidth: 420 }}>
          <label className="field-label" htmlFor="pseudo">
            {t("online.pseudo")}
          </label>
          <input
            className="text-input"
            id="pseudo"
            maxLength={20}
            placeholder={t("online.pseudoPlaceholder")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              local.set("name", e.target.value);
            }}
          />
        </div>
      )}
      <div className="online">
        <form className="panel" onSubmit={create}>
          <h3>{t("online.createTitle")}</h3>
          <p className="muted">{t("online.createText")}</p>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t("online.creating") : t("online.create")}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
        <form className="panel" onSubmit={join}>
          <h3>{t("online.joinTitle")}</h3>
          <label className="field-label" htmlFor="code">
            {t("online.joinCode")}
          </label>
          <input
            className="text-input code-input"
            id="code"
            maxLength={CODE_LENGTH}
            placeholder="K7P2QX"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <button className="btn ghost" type="submit">
            {t("online.join")}
          </button>
          {joinError ? <p className="form-error">{joinError}</p> : null}
        </form>
      </div>
    </section>
  );
}
