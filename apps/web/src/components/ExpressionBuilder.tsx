"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { OPERATION_SYMBOL, commitStep, encodeSteps, parseExpression, readSteps, undoStep, type Operation, type Puzzle } from "@calculus/game-core";
import { cleanInput } from "@/lib/answer";
import { useTouch } from "@/lib/useTouch";

type RightCount = Extract<Puzzle, { game: "right-count" }>;

/** Ajoute un jeton (plaque, opérateur, parenthèse) en gardant une écriture aérée : « (75 − 3) × 6 ». */
function append(value: string, token: string): string {
  const v = value.trimEnd();
  if (v === "" || v.endsWith("(") || token === ")") return v + token;
  return `${v} ${token}`;
}

/** Retire le dernier jeton saisi (un nombre entier, ou un symbole). */
const dropLast = (value: string) => value.trimEnd().replace(/(\d+|\S)$/, "").trimEnd();

/** Plaques déjà utilisées dans la saisie : chaque nombre écrit prend la première plaque libre de cette valeur. */
export function usedTiles(tiles: readonly number[], value: string): boolean[] {
  const used = tiles.map(() => false);
  for (const m of value.match(/\d+/g) ?? []) {
    const i = tiles.findIndex((t, k) => !used[k] && t === Number(m));
    if (i >= 0) used[i] = true;
  }
  return used;
}

interface TileExpressionProps {
  tiles: readonly number[];
  operations: readonly Operation[];
  /** Les parenthèses sont-elles proposées ? */
  parentheses: boolean;
  /** Au-dessus des plaques (la cible du bon compte). */
  header?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Total de la saisie, null si elle est incomplète ou invalide. */
  total: number | null;
  /** On peut valider. */
  ready: boolean;
  /** Message sous la saisie (règle pas encore tenue…). */
  hint?: ReactNode;
  disabled?: boolean;
  status?: "right" | "wrong" | null;
  shake?: boolean;
  autoFocus?: boolean;
  /** Change à chaque nouveau tirage : la case reprend le focus. */
  focusKey: string;
}

/**
 * Saisie d'une expression avec des plaques : plaques à toucher (barrées une fois utilisées), opérateurs
 * permis, parenthèses, total en direct. Sert à la construction des bombes.
 */
export function TileExpression(props: TileExpressionProps) {
  const { tiles, operations, parentheses, header, value, onChange, onSubmit, total, ready, hint, disabled, status, shake, autoFocus = true, focusKey } = props;
  const t = useTranslations("game");
  const touch = useTouch();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && autoFocus && !touch) input.current?.focus({ preventScroll: true });
  }, [focusKey, disabled, autoFocus, touch]);

  const set = (v: string) => onChange(cleanInput(v, "expr", 0));
  const submit = () => {
    if (ready && !disabled) onSubmit();
  };

  const last = value.trimEnd().slice(-1);
  const afterOperand = /[\d)]/.test(last);
  const open = (value.match(/\(/g) ?? []).length - (value.match(/\)/g) ?? []).length;
  const used = usedTiles(tiles, value);

  return (
    <div className={`count-board${shake ? " shake" : ""}`}>
      {header}
      <div className="tiles" role="group" aria-label={t("tiles")}>
        {tiles.map((tile, i) => (
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
      {hint && !disabled ? <p className="hint">{hint}</p> : null}
      <div className="keypad expr-pad">
        {operations.map((op) => (
          <button key={op} type="button" disabled={disabled || !afterOperand} onClick={() => set(append(value, OPERATION_SYMBOL[op]))} aria-label={t(`operator.${op}`)}>
            {OPERATION_SYMBOL[op]}
          </button>
        ))}
        {parentheses ? (
          <>
            <button type="button" disabled={disabled || afterOperand} onClick={() => set(append(value, "("))} aria-label={t("openParen")}>
              (
            </button>
            <button type="button" disabled={disabled || !afterOperand || open <= 0} onClick={() => set(append(value, ")"))} aria-label={t("closeParen")}>
              )
            </button>
          </>
        ) : null}
        <button type="button" disabled={disabled || value === ""} onClick={() => set(dropLast(value))} aria-label={t("delete")}>
          ⌫
        </button>
        <button type="button" className="ok-key" disabled={disabled || !ready} onClick={submit} aria-label={t("submit")}>
          OK
        </button>
      </div>
    </div>
  );
}

interface Props {
  /** Énoncé complet (« 75 50 3 6 8 2 → 412 »), gardé dans data-calc pour les tests. */
  text: string;
  puzzle: RightCount;
  /** La saisie en étapes (« 75 + 2;77 × 6;… », voir `readSteps`). */
  value: string;
  onChange: (v: string) => void;
  /** Envoie l'expression complète, qui enchaîne toutes les étapes. */
  onSubmit: (expr: string) => void;
  /** Un total qui ne tombe pas pile est une proposition : le plus proche marque si personne ne trouve. */
  allowClosest?: boolean;
  disabled?: boolean;
  status?: "right" | "wrong" | null;
  shake?: boolean;
  autoFocus?: boolean;
}

/**
 * Le bon compte, en étapes : on pose un calcul (« 75 + 2 = 77 »), son résultat devient une nouvelle plaque,
 * et ainsi de suite jusqu'à n'avoir plus qu'un nombre. On peut aussi tout écrire d'un coup, avec des parenthèses.
 * On valide dès que toutes les plaques sont utilisées : un total qui ne tombe pas pile compte comme une erreur
 * (ou, à plusieurs, comme une proposition pour le plus proche) ; le serveur revérifie tout.
 */
export function ExpressionBuilder({ text, puzzle, value, onChange, onSubmit, allowClosest = false, disabled, status, shake, autoFocus = true }: Props) {
  const t = useTranslations("game");
  const touch = useTouch();
  const input = useRef<HTMLInputElement>(null);
  const { target } = puzzle;
  const state = readSteps(puzzle.tiles, puzzle.operations, value);
  const { steps, tiles, line, lineValue, canCommit, complete } = state;

  useEffect(() => {
    if (!disabled && autoFocus && !touch) input.current?.focus({ preventScroll: true });
  }, [text, disabled, autoFocus, touch]);

  const texts = steps.map((s) => s.text);
  const setLine = (v: string) => onChange(encodeSteps(texts, cleanInput(v, "expr", 0)));
  const ready = !!complete;
  const submit = () => {
    if (ready && complete && !disabled) onSubmit(complete.expr);
  };
  const commit = () => {
    if (canCommit && !disabled) onChange(commitStep(state));
  };
  const undo = () => onChange(undoStep(state));

  const last = line.trimEnd().slice(-1);
  const afterOperand = /[\d)]/.test(last);
  const open = (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
  const shownTotal = lineValue ?? (line.trim() === "" ? complete?.value : null);
  const gap = complete ? Math.abs(complete.value - target) : null;

  // Une seule indication à la fois : la plus utile pour avancer.
  let hint: string | null = null;
  const tree = line.trim() ? parseExpression(line.trim()) : null;
  if (gap !== null && gap > 0) hint = allowClosest ? t("closestHint", { gap }) : t("gap", { gap });
  else if (!complete && (lineValue === target || (line.trim() === "" && steps.at(-1)?.value === target))) hint = t("useAllTiles");
  else if (tree?.kind === "op" && lineValue === null) hint = t("invalidStep");
  else if (steps.length === 0 && line.trim() === "") hint = t("stepHint");

  return (
    <div className={`count-board${shake ? " shake" : ""}`}>
      <p className="count-target">
        <span className="count-label">{t("target")}</span>
        <span className="calc" data-testid="calc-text" data-calc={text} data-ops={puzzle.operations.join(" ")}>
          {target}
        </span>
      </p>
      {steps.length > 0 ? (
        <ol className="count-steps" aria-label={t("steps")}>
          {steps.map((s, i) => (
            <li key={i}>
              {s.text} <span className="eq">=</span> <b>{s.value}</b>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="tiles" role="group" aria-label={t("tiles")}>
        {tiles.map((tile, i) => (
          <button
            key={`${i}:${tile.value}:${tile.step ?? "t"}`}
            type="button"
            className={`tile${tile.step !== null ? " made" : ""}`}
            disabled={disabled || tile.used || afterOperand}
            aria-pressed={tile.used}
            onClick={() => setLine(append(line, String(tile.value)))}
          >
            {tile.value}
          </button>
        ))}
      </div>
      <form
        className="game-row"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          // Entrée, comme OK : valide dès que toutes les plaques sont utilisées ; sinon pose le calcul en cours comme étape.
          if (complete || !canCommit) submit();
          else commit();
        }}
      >
        <input
          ref={input}
          className={`answer expr-input${status ? " " + status : ""}`}
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "=") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && line === "" && steps.length > 0) {
              e.preventDefault();
              undo();
            }
          }}
          disabled={disabled}
          readOnly={touch}
          inputMode={touch ? "none" : "text"}
          spellCheck={false}
          aria-label={t("yourAnswer")}
        />
        <span className="count-total" aria-live="polite">
          <span className="eq">=</span> {shownTotal ?? "…"}
        </span>
      </form>
      {hint && !disabled ? <p className="hint">{hint}</p> : null}
      <div className="keypad expr-pad">
        {puzzle.operations.map((op) => (
          <button key={op} type="button" disabled={disabled || !afterOperand} onClick={() => setLine(append(line, OPERATION_SYMBOL[op]))} aria-label={t(`operator.${op}`)}>
            {OPERATION_SYMBOL[op]}
          </button>
        ))}
        <button type="button" disabled={disabled || afterOperand} onClick={() => setLine(append(line, "("))} aria-label={t("openParen")}>
          (
        </button>
        <button type="button" disabled={disabled || !afterOperand || open <= 0} onClick={() => setLine(append(line, ")"))} aria-label={t("closeParen")}>
          )
        </button>
        <button type="button" disabled={disabled || value === ""} onClick={undo} aria-label={t("delete")}>
          ⌫
        </button>
        <button type="button" disabled={disabled || !canCommit} onClick={commit} aria-label={t("commitStep")}>
          =
        </button>
        <button type="button" className="ok-key" disabled={disabled || !ready} onClick={submit} aria-label={t("submit")}>
          OK
        </button>
      </div>
    </div>
  );
}
