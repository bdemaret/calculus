"use client";
import { useTranslations } from "next-intl";
import { BASIC_OPERATIONS, OPERATION_SYMBOL, type BasicOperation } from "@calculus/game-core";

interface Props {
  onOperator: (op: BasicOperation) => void;
  onDelete: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/** Pavé des quatre opérateurs, pour un opérateur manquant sur téléphone. */
export function OperatorPad({ onOperator, onDelete, onSubmit, disabled }: Props) {
  const t = useTranslations("game");
  return (
    <div className="keypad ops-pad">
      {BASIC_OPERATIONS.map((op) => (
        <button key={op} type="button" disabled={disabled} onClick={() => onOperator(op)} aria-label={t(`operator.${op}`)}>
          {OPERATION_SYMBOL[op]}
        </button>
      ))}
      <button type="button" disabled={disabled} onClick={onDelete} aria-label={t("delete")}>
        ⌫
      </button>
      <button type="button" className="ok-key" disabled={disabled} onClick={onSubmit} aria-label={t("submit")}>
        OK
      </button>
    </div>
  );
}
