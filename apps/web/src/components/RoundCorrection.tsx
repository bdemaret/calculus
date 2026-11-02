"use client";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { TechniqueHint } from "@calculus/game-core";
import { MathText } from "@/components/MathText";
import { TechniqueSteps } from "@/components/TechniqueSteps";

interface Props {
  /** Réponse donnée, vide si le temps s'est écoulé. */
  given: string;
  text: string;
  separator: string;
  solution: string;
  hint: TechniqueHint | null;
  /** Texte du bouton qui passe à la suite. */
  nextLabel: string;
  onNext: () => void;
  touch: boolean;
}

/**
 * Correction après une erreur : reste affichée jusqu'à ce que le joueur passe à la suite.
 * Sur téléphone, le pavé est ancré en bas de l'écran (PadDock) : elle se pose par-dessus,
 * dans body comme lui, au lieu de passer dessous. Le pavé ne sert à rien pendant la correction.
 */
export function RoundCorrection({ given, text, separator, solution, hint, nextLabel, onNext, touch }: Props) {
  const t = useTranslations();
  // « Suivant » a-t-il été appuyé lui-même ? Sur téléphone, OK répond dès que le doigt se pose et la
  // correction s'ouvre sous ce doigt : le clic émis quand il se relève tomberait sur « Suivant ».
  const nextPressed = useRef(false);
  const review = (
    <div className={`solo-review${touch ? " docked" : ""}`}>
      {given ? (
        <p>
          {t("solo.yourAnswer")} <s className="ko">{given}</s>
        </p>
      ) : null}
      <p>
        {t("solo.correction")}{" "}
        <span className="solo-review-calc">
          <MathText text={text} /> <span className="eq">{separator}</span> <b>{solution}</b>
        </span>
      </p>
      {hint ? (
        <div className="practice-explain">
          <h3>{t(`techniques.${hint.technique}.name`)}</h3>
          <TechniqueSteps hint={hint} />
        </div>
      ) : null}
      <div className="actions">
        <button
          className="btn"
          type="button"
          autoFocus
          onPointerDown={() => (nextPressed.current = true)}
          onClick={(ev) => {
            const pressed = nextPressed.current;
            nextPressed.current = false;
            // detail vaut 0 pour un clic au clavier (Entrée, Espace) : il n'a pas d'appui à vérifier.
            if (ev.detail !== 0 && !pressed) return;
            onNext();
          }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
  return touch ? createPortal(review, document.body) : review;
}
