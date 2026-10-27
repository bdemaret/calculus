import { useTranslations } from "next-intl";
import type { TechniqueHint } from "@calculus/game-core";
import { MathText } from "./MathText";

/**
 * Explication d'une technique sur un calcul précis : la phrase des messages (`techniques.<id>.how`),
 * remplie avec les nombres du calcul, puis les calculs intermédiaires.
 * `explain={false}` : les calculs seuls (fiches de /learn, où le principe est déjà écrit au-dessus).
 */
export function TechniqueSteps({ hint, explain = true }: { hint: TechniqueHint; explain?: boolean }) {
  const t = useTranslations();
  return (
    <div className="technique-steps">
      {explain ? <p>{t(`techniques.${hint.technique}.how`, hint.params)}</p> : null}
      <ol aria-label={t("learn.steps")}>
        {hint.steps.map((s, i) => (
          <li key={i}>
            <MathText text={s.text} /> = <b>{s.value}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}
