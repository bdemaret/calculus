"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { OPERATION_SYMBOL, evaluateStrict, fitsTiles, numbersOf, parseExpression, type Operation, type Puzzle } from "@calculus/game-core";
import { cleanInput } from "@/lib/answer";
import { useTouch } from "@/lib/useTouch";

type RightCount = Extract<Puzzle, { game: "right-count" }>;

interface Props {
  /** Énoncé complet (« 75 50 3 6 8 2 → 412 »), gardé dans data-calc pour les tests. */
  text: string;
  puzzle: RightCount;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  status?: "right" | "wrong" | null;
  shake?: boolean;
  autoFocus?: boolean;
}

/** Ajoute un jeton (plaque, opérateur, parenthèse) en gardant une écriture aérée : « (75 − 3) × 6 ». */
function append(value: string, token: string): string {
  const v = value.trimEnd();
  if (v === "" || v.endsWith("(") || token === ")") return v + token;
  return `${v} ${token}`;
}

/** Retire le dernier jeton saisi (un nombre entier, ou un symbole). */
const dropLast = (value: string) => value.trimEnd().replace(/(\d+|\S)$/, "").trimEnd();

/** Plaques déjà utilisées dans la saisie : chaque nombre écrit prend la première plaque libre de cette valeur. */
function usedTiles(tiles: readonly number[], value: string): boolean[] {
  const used = tiles.map(() => false);
  for (const m of value.match(/\d+/g) ?? []) {
    const i = tiles.findIndex((t, k) => !used[k] && t === Number(m));
    if (i >= 0) used[i] = true;
  }
  return used;
}

/** Total d'une saisie en cours (plaques au plus une fois), null si elle est incomplète ou invalide. */
function partialTotal(puzzle: RightCount, value: string): number | null {
  const tree = value.trim() ? parseExpression(value) : null;
  if (!tree || !fitsTiles(numbersOf(tree), puzzle.tiles)) return null;
  const v = evaluateStrict(tree, puzzle.operations);
  return Number.isNaN(v) ? null : v;
}

/**
 * Le bon compte : la cible, les plaques à toucher (ou à taper) et le total de la saisie en direct.
 * On ne peut valider que quand toutes les plaques sont utilisées et que le total tombe pile
 * sur la cible ; le serveur revérifie tout.
 */
export function ExpressionBuilder({ text, puzzle, value, onChange, onSubmit, disabled, status, shake, autoFocus = true }: Props) {
  const t = useTranslations("game");
  const touch = useTouch();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && autoFocus && !touch) input.current?.focus({ preventScroll: true });
  }, [text, disabled, autoFocus, touch]);

  const set = (v: string) => onChange(cleanInput(v, "expr", 0));
  const total = partialTotal(puzzle, value);
  const used = usedTiles(puzzle.tiles, value);
  const allUsed = used.every(Boolean);
  const ready = !disabled && allUsed && total === puzzle.target;
  const submit = () => {
    if (ready) onSubmit();
  };

  const last = value.trimEnd().slice(-1);
  const afterOperand = /[\d)]/.test(last);
  const open = (value.match(/\(/g) ?? []).length - (value.match(/\)/g) ?? []).length;
  const ops: Operation[] = puzzle.operations;

  return (
    <div className={`count-board${shake ? " shake" : ""}`}>
      <p className="count-target">
        <span className="count-label">{t("target")}</span>
        <span className="calc" data-testid="calc-text" data-calc={text} data-ops={puzzle.operations.join(" ")}>
          {puzzle.target}
        </span>
      </p>
      <div className="tiles" role="group" aria-label={t("tiles")}>
        {puzzle.tiles.map((tile, i) => (
          <button
            key={i}
            type="button"
            className="tile"
            disabled={disabled || used[i] || afterOperand}
            aria-pressed={used[i]}
            onClick={() => set(append(value, String(tile)))}
          >
            {tile}
          </button>
        ))}
      </div>
      <form
        className="game-row"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          className={`answer expr-input${status ? " " + status : ""}`}
          value={value}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
          readOnly={touch}
          inputMode={touch ? "none" : "text"}
          spellCheck={false}
          aria-label={t("yourAnswer")}
        />
        <span className="count-total" aria-live="polite">
          <span className="eq">=</span> {total ?? "…"}
        </span>
      </form>
      {total === puzzle.target && !allUsed && !disabled ? <p className="hint">{t("useAllTiles")}</p> : null}
      <div className="keypad expr-pad">
        {ops.map((op) => (
          <button key={op} type="button" disabled={disabled || !afterOperand} onClick={() => set(append(value, OPERATION_SYMBOL[op]))} aria-label={t(`operator.${op}`)}>
            {OPERATION_SYMBOL[op]}
          </button>
        ))}
        <button type="button" disabled={disabled || afterOperand} onClick={() => set(append(value, "("))} aria-label={t("openParen")}>
          (
        </button>
        <button type="button" disabled={disabled || !afterOperand || open <= 0} onClick={() => set(append(value, ")"))} aria-label={t("closeParen")}>
          )
        </button>
        <button type="button" disabled={disabled || value === ""} onClick={() => set(dropLast(value))} aria-label={t("delete")}>
          ⌫
        </button>
        <button type="button" className="ok-key" disabled={!ready} onClick={submit} aria-label={t("submit")}>
          OK
        </button>
      </div>
    </div>
  );
}
