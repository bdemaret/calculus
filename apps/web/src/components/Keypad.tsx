"use client";
import { useTranslations } from "next-intl";
import { PadButton } from "./PadButton";

interface Props {
  onDigit: (d: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}

/** Pavé numérique intégré, affiché sur téléphone pour ne pas ouvrir le clavier système. */
export function Keypad({ onDigit, onDelete, onSubmit, disabled }: Props) {
  const t = useTranslations("game");
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="keypad">
      {digits.map((d) => (
        <PadButton key={d} disabled={disabled} onPress={() => onDigit(d)}>
          {d}
        </PadButton>
      ))}
      <PadButton disabled={disabled} onPress={onDelete} aria-label={t("delete")}>
        ⌫
      </PadButton>
      <PadButton disabled={disabled} onPress={() => onDigit("0")}>
        0
      </PadButton>
      <PadButton className="ok-key" disabled={disabled} onPress={onSubmit} aria-label={t("submit")}>
        OK
      </PadButton>
    </div>
  );
}
