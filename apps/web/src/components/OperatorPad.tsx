"use client";
import { useTranslations } from "next-intl";
import { BASIC_OPERATIONS, OPERATION_SYMBOL, type BasicOperation } from "@calculus/game-core";
import { PadButton } from "./PadButton";

interface Props {
  onOperator: (op: BasicOperation) => void;
  onDelete: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/**
 * Pavé des quatre opérateurs, pour un opérateur manquant sur téléphone. Même hauteur que le pavé numérique,
 * ⌫ et OK à la même place : passer d'un trou à l'autre ne déplace aucune touche.
 */
export function OperatorPad({ onOperator, onDelete, onSubmit, disabled }: Props) {
  const t = useTranslations("game");
  return (
    <div className="keypad ops-pad">
      {BASIC_OPERATIONS.map((op) => (
        <PadButton key={op} disabled={disabled} onPress={() => onOperator(op)} aria-label={t(`operator.${op}`)}>
          {OPERATION_SYMBOL[op]}
        </PadButton>
      ))}
      <PadButton className="del-key" disabled={disabled} onPress={onDelete} aria-label={t("delete")}>
        ⌫
      </PadButton>
      <PadButton className="ok-key" disabled={disabled} onPress={onSubmit} aria-label={t("submit")}>
        OK
      </PadButton>
    </div>
  );
}
