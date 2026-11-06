"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CODE_LENGTH, ENEMIES, ENEMY_IDS, normalizeCode, sanitizeDungeonSettings } from "@calculus/game-core";
import { useRouter } from "@/i18n/navigation";
import { Margin, MarginNote } from "@/components/Margin";
import { JoinError, createDungeon } from "@/lib/dungeon";
import { local } from "@/lib/storage";
import { EnemyArt } from "./DungeonArt";

/** Entrée des donjons : ouvrir une expédition (on y invite ses amis) ou en rejoindre une avec son code. */
export function DungeonEntry() {
  const t = useTranslations();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // La difficulté de la dernière expédition est reprise ; l'hôte la change dans la salle d'attente.
      const room = await createDungeon(sanitizeDungeonSettings(local.get("dungeon", {})));
      router.push(`/dungeon/${room.roomId}`);
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
    router.push(`/dungeon/${code}`);
  }

  return (
    <section className="setup dungeon-entry" style={{ maxWidth: 860 }}>
      <Margin>
        <MarginNote value={t("dungeon.margin")} />
      </Margin>
      <div className="setup-head">
        <h1>{t("dungeon.title")}</h1>
      </div>
      <ul className="dungeon-rules">
        {(["rounds", "positioning", "perfect", "lives", "boss"] as const).map((k) => (
          <li key={k}>{t(`dungeon.rules.${k}`)}</li>
        ))}
      </ul>
      <div className="online">
        <form className="panel" onSubmit={create}>
          <h2 className="h3">{t("dungeon.createTitle")}</h2>
          <p className="muted">{t("dungeon.createText")}</p>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? t("online.creating") : t("dungeon.create")}
          </button>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
        <form className="panel" onSubmit={join}>
          <h2 className="h3">{t("dungeon.joinTitle")}</h2>
          <label className="field-label" htmlFor="dungeon-code">
            {t("online.joinCode")}
          </label>
          <input
            className="text-input code-input"
            id="dungeon-code"
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
      <MonsterBook />
    </section>
  );
}

/**
 * Le livre des monstres : un bouton en bas de l'entrée, qui ouvre (dans une `<dialog>` modale) chaque ennemi
 * avec sa force et ce qu'il pose, puis le boss.
 */
function MonsterBook() {
  const t = useTranslations("dungeon");
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button className="btn ghost dungeon-book-open" type="button" onClick={() => dialog.current?.showModal()}>
        {t("book.open")}
      </button>
      <dialog
        ref={dialog}
        className="dungeon-book"
        aria-labelledby="dungeon-book-title"
        data-testid="dungeon-book"
        // Un clic sur le fond (hors de la page du livre) le referme.
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="dungeon-book-page">
          <div className="dungeon-book-head">
            <h2 id="dungeon-book-title">{t("book.title")}</h2>
            <button className="btn ghost" type="button" onClick={() => dialog.current?.close()}>
              {t("book.close")}
            </button>
          </div>
          <p className="muted">{t("book.intro")}</p>
          <ul className="dungeon-bestiary">
            {ENEMY_IDS.map((id) => (
              <li key={id} data-enemy={id}>
                <EnemyArt enemy={id} />
                <div>
                  <p className="dungeon-bestiary-name">
                    {t(`enemies.${id}.name`)}{" "}
                    <span className="dg-stars" role="img" aria-label={t("book.tier", { count: ENEMIES[id].tier })}>
                      {"★".repeat(ENEMIES[id].tier)}
                    </span>
                  </p>
                  <p className="dungeon-bestiary-desc">{t(`enemies.${id}.desc`)}</p>
                </div>
              </li>
            ))}
            <li data-enemy="boss" className="boss">
              <EnemyArt enemy="boss" />
              <div>
                <p className="dungeon-bestiary-name">{t("boss.name")}</p>
                <p className="dungeon-bestiary-desc">{t("boss.desc")}</p>
              </div>
            </li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
