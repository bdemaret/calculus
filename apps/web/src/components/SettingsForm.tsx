"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ALL_OPERATIONS,
  DIFFICULTIES,
  GAMES,
  GAME_IDS,
  MAX_ROUNDS,
  MAX_TIME,
  MIN_ROUNDS,
  MIN_TIME,
  MISSING_KINDS,
  defaultSettings,
  randomSeed,
  sanitizeSettings,
  type GameSettings,
  type Operation,
} from "@calculus/game-core";

export const OP_SYMBOL: Record<Operation, string> = { add: "+", sub: "−", mul: "×", div: "÷" };

interface Props {
  id: string;
  settings: GameSettings;
  onChange: (s: GameSettings) => void;
  /** Lobby en ligne : affiche le choix simultané / chacun son tour. */
  online: boolean;
  /** Lecture seule (les joueurs qui ne sont pas l'hôte voient les règles sans les modifier). */
  readOnly?: boolean;
}

export function SettingsForm({ id, settings: s, onChange, online, readOnly }: Props) {
  const t = useTranslations();
  const [shakeOp, setShakeOp] = useState<string | null>(null);
  const set = (patch: Partial<GameSettings>) => onChange(sanitizeSettings({ ...s, ...patch }));
  // Un exemple de calcul, renouvelé quand les règles changent.
  // (calculé après l'affichage, pour que le serveur et le navigateur affichent la même chose)
  const [example, setExample] = useState("");
  const opsKey = s.operations.join();
  useEffect(() => {
    setExample(GAMES[s.game].generate(randomSeed(), 0, s).text);
  }, [s.game, s.difficulty, opsKey, s.parentheses, s.missingKind]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOp = (op: Operation) => {
    const ops = s.operations.includes(op) ? s.operations.filter((o) => o !== op) : [...s.operations, op];
    if (ops.length === 0) {
      // Il faut au moins une opération.
      setShakeOp(op);
      setTimeout(() => setShakeOp(null), 320);
      return;
    }
    set({ operations: ALL_OPERATIONS.filter((o) => ops.includes(o)) });
  };

  return (
    <div className="panel" id={id}>
      <fieldset className="field" disabled={readOnly}>
        <legend>{t("settings.game")}</legend>
        <div className="mode-cards">
          {/* En solo, seuls les jeux jouables seul sont proposés. */}
          {GAME_IDS.filter((g) => online || GAMES[g].solo).map((g) => (
            <button key={g} type="button" className="mode-card" aria-pressed={s.game === g} onClick={() => set({ game: g })}>
              <strong>{t(`games.${g}.name`)}</strong>
              <span>{t(`games.${g}.short`)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field" disabled={readOnly}>
        <legend>{t("settings.mode")}</legend>
        <div className="mode-cards">
          {GAMES[s.game].modes.map((m) => (
            <button key={m} type="button" className="mode-card" aria-pressed={s.mode === m} onClick={() => set({ mode: m })}>
              <strong>{t(`modes.${m}.name`)}</strong>
              <span>{t(`modes.${m}.short`)}</span>
            </button>
          ))}
        </div>
        <p className="explain">{t(online ? `modes.${s.mode}.long` : `modes.${s.mode}.solo`)}</p>
      </fieldset>

      <fieldset className="field" disabled={readOnly}>
        <legend>{t("settings.difficulty")}</legend>
        <div className="seg" role="group">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={s.difficulty === d}
              onClick={() => {
                const base = defaultSettings(d);
                set({
                  difficulty: d,
                  operations: base.operations,
                  parentheses: base.parentheses,
                  timePerQuestion: base.timePerQuestion,
                  missingKind: base.missingKind,
                });
              }}
            >
              {d} · {t(`levels.${d}`)}
            </button>
          ))}
        </div>
        <p className="example" aria-live="polite">
          {t("settings.example", { calc: example })}
        </p>
      </fieldset>

      <fieldset className="field" disabled={readOnly}>
        <legend>{t("settings.operations")}</legend>
        <div className="seg ops" role="group">
          {ALL_OPERATIONS.map((op) => (
            <button
              key={op}
              type="button"
              className={shakeOp === op ? "shake" : undefined}
              aria-pressed={s.operations.includes(op)}
              aria-label={t(`ops.${op}`)}
              title={t(`ops.${op}`)}
              onClick={() => toggleOp(op)}
            >
              {OP_SYMBOL[op]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={s.parentheses}
            aria-label={t("ops.paren")}
            title={t("ops.paren")}
            onClick={() => set({ parentheses: !s.parentheses })}
          >
            ( )
          </button>
        </div>
      </fieldset>

      {s.game === "missing" ? (
        <fieldset className="field" disabled={readOnly}>
          <legend>{t("settings.missingKind.label")}</legend>
          <div className="seg" role="group">
            {MISSING_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={s.missingKind === k} onClick={() => set({ missingKind: k })}>
                {t(`settings.missingKind.${k}`)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {s.mode === "speed-race" ? (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-rounds`}>
            {t(online && s.turnStyle === "turns" ? "settings.roundsPerPlayer" : "settings.rounds")}
          </label>
          <div className="range-row">
            <input
              type="range"
              id={`${id}-rounds`}
              min={MIN_ROUNDS}
              max={MAX_ROUNDS}
              step={5}
              value={s.rounds}
              disabled={readOnly}
              onChange={(e) => set({ rounds: Number(e.target.value) })}
            />
            <span className="range-value">{s.rounds}</span>
          </div>
        </div>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor={`${id}-time`}>
          {t(s.mode === "battle-royale" ? "settings.timeStart" : "settings.time")}
        </label>
        <div className="range-row">
          <input
            type="range"
            id={`${id}-time`}
            min={MIN_TIME}
            max={MAX_TIME}
            value={s.timePerQuestion}
            disabled={readOnly}
            onChange={(e) => set({ timePerQuestion: Number(e.target.value) })}
          />
          <span className="range-value">{t("settings.seconds", { n: s.timePerQuestion })}</span>
        </div>
      </div>

      {online ? (
        <fieldset className="field" disabled={readOnly}>
          <legend>{t("settings.answers")}</legend>
          <div className="seg" role="group">
            <button type="button" aria-pressed={s.turnStyle === "simultaneous"} onClick={() => set({ turnStyle: "simultaneous" })}>
              {t("settings.simultaneous")}
            </button>
            <button type="button" aria-pressed={s.turnStyle === "turns"} onClick={() => set({ turnStyle: "turns" })}>
              {t("settings.turns")}
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
