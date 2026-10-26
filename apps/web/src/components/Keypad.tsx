"use client";
import { useTranslations } from "next-intl";

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
        <button key={d} type="button" disabled={disabled} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button type="button" disabled={disabled} onClick={onDelete} aria-label={t("delete")}>
        ⌫
      </button>
      <button type="button" disabled={disabled} onClick={() => onDigit("0")}>
        0
      </button>
      <button type="button" className="ok-key" disabled={disabled} onClick={onSubmit} aria-label={t("submit")}>
        OK
      </button>
    </div>
  );
}
