"use client";
import { useEffect, useRef, useState } from "react";
import { parseSpokenNumber } from "./spokenNumber";

/** Délai avant de relancer un démarrage refusé (ms). */
const RETRY_MS = 200;

/* Types minimaux de la Web Speech API, absente de la bibliothèque DOM de TypeScript. */
interface SpeechResultList {
  readonly length: number;
  [index: number]: { readonly 0: { readonly transcript: string } };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { readonly results: SpeechResultList }) => void) | null;
  onerror: ((e: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Vrai si le navigateur sait faire de la reconnaissance vocale (Chrome, Edge, Safari ; pas Firefox). */
export function isVoiceSupported(): boolean {
  return recognitionCtor() !== null;
}

export type VoiceState = "off" | "listening" | "denied" | "unsupported";

interface Options {
  /** Écoute active seulement quand une réponse peut être saisie. */
  enabled: boolean;
  /** Langue de l'interface (« fr », « en »). */
  locale: string;
  /** Change à chaque nouveau calcul : on repart d'une écoute vierge. */
  resetKey: string;
  /** Reçoit les chiffres compris, au fil de la dictée. */
  onNumber: (digits: string) => void;
}

/**
 * Dictée des réponses : écoute le micro tant que `enabled` est vrai et remplit la case
 * avec le dernier nombre entendu. La validation reste à la charge du joueur (touche Entrée).
 */
export function useVoiceInput({ enabled, locale, resetKey, onNumber }: Options): VoiceState {
  const [state, setState] = useState<VoiceState>("off");
  const callback = useRef(onNumber);
  callback.current = onNumber;
  const denied = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setState(denied.current ? "denied" : "off");
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setState("unsupported");
      return;
    }
    if (denied.current) return;

    let active = true;
    let last: string | null = null;
    let rec: SpeechRecognitionLike | null = null;

    const listen = () => {
      if (!active) return;
      rec = new Ctor();
      rec.lang = locale === "fr" ? "fr-FR" : "en-US";
      // Un énoncé par écoute, relancée aussitôt (onend) : en écoute continue, Chrome met
      // « neuf… neuf » dans le même texte et le formate en « 99 », impossible à distinguer
      // d'un vrai 99. Ainsi, une réponse répétée remplace la précédente.
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        // Le dernier morceau entendu fait foi : le joueur peut se reprendre en redisant un nombre.
        const result = e.results[e.results.length - 1];
        const digits = result ? parseSpokenNumber(result[0].transcript) : null;
        if (digits !== null && digits !== last) {
          last = digits;
          callback.current(digits);
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          denied.current = true;
          active = false;
          setState("denied");
        }
      };
      // L'écoute s'arrête après chaque énoncé ou après un silence : on la relance tant que le calcul est affiché.
      rec.onend = () => {
        if (active) listen();
      };
      try {
        rec.start();
        setState("listening");
      } catch {
        // Démarrage refusé (écoute précédente pas encore terminée) : on réessaie juste après.
        setTimeout(listen, RETRY_MS);
      }
    };
    listen();

    return () => {
      active = false;
      if (rec) {
        rec.onend = null;
        rec.onresult = null;
        rec.abort();
      }
    };
  }, [enabled, locale, resetKey]);

  return state;
}
