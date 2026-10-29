import { describe, expect, it } from "vitest";
import {
  GameEngine,
  answerOfRecord,
  defaultSettings,
  operatorOfSymbol,
  replaySolo,
  type GameId,
  type GameModeId,
  type GameSettings,
  type PlayerAnswer,
  type Question,
  type SoloAnswer,
} from "../src";

const ME = { id: "me", name: "Moi" };

/** La bonne réponse d'un calcul, sous la forme attendue par son jeu. */
function rightAnswer(engine: GameEngine, q: Question): PlayerAnswer {
  const kind = engine.game.answerKind(q);
  if (kind === "expr") return { expr: q.solution };
  if (kind === "op") return { op: operatorOfSymbol(q.solution)! };
  return { value: q.answer };
}

/** Une réponse fausse de la même forme (un nombre décalé ; l'opérateur standard ne sert que pour le nombre manquant). */
function wrongAnswer(engine: GameEngine, q: Question): PlayerAnswer {
  const kind = engine.game.answerKind(q);
  if (kind === "op") return { op: operatorOfSymbol(q.solution) === "add" ? "sub" : "add" };
  return { value: q.answer + 1 };
}

type Move = "right" | "wrong" | "timeout";

/**
 * Joue une partie comme le navigateur : horloge réelle, et après chaque erreur une correction
 * qui dure `pauseMs` avant que le joueur ne lance la manche suivante. Renvoie le moteur et le journal envoyé.
 */
function playInBrowser(settings: GameSettings, seed: string, moves: Move[], pauseMs: number) {
  const engine = new GameEngine(settings, [ME], seed);
  const log: SoloAnswer[] = [];
  let now = 1_700_000_000_000;
  for (const [i, move] of moves.entries()) {
    const round = engine.startRound(now);
    if (!round) break;
    const thinkMs = 400 + i * 137;
    if (move !== "timeout") {
      const answer = move === "right" ? rightAnswer(engine, round.question) : wrongAnswer(engine, round.question);
      now += thinkMs;
      engine.submit(ME.id, answer, now);
    } else {
      now += round.timeLimitMs;
    }
    const rec = engine.closeRound()!;
    const mine = rec.answers.find((a) => a.playerId === ME.id);
    log.push({ answer: mine ? answerOfRecord(mine, engine.game.answerKind(rec.question)) : null, timeMs: mine?.timeMs ?? rec.timeLimitMs });
    // La correction après une erreur : le joueur prend son temps avant « Suivant ».
    now += mine?.correct ? 700 : pauseMs;
  }
  return { engine, log };
}

/** Ce qui est enregistré d'une partie : à comparer entre la partie jouée et son rejeu. */
const outcome = (engine: GameEngine) => ({
  players: engine.players.map(({ score, answered, correct, correctTimeMs, alive, eliminatedAt, bestStreak }) => ({
    score,
    answered,
    correct,
    correctTimeMs,
    alive,
    eliminatedAt,
    bestStreak,
  })),
  rounds: engine.history.map((r) => ({ text: r.question.text, scorers: r.scorers, eliminated: r.eliminated, answers: r.answers })),
});

const CASES: { game: GameId; mode: GameModeId }[] = [
  { game: "standard", mode: "speed-race" },
  { game: "standard", mode: "battle-royale" },
  { game: "missing", mode: "speed-race" },
  { game: "right-count", mode: "speed-race" },
];

describe("rejeu d'une partie solo", () => {
  for (const { game, mode } of CASES) {
    it(`${game} en ${mode} : une partie honnête est rejouée à l'identique, pauses comprises`, () => {
      const settings = { ...defaultSettings(3, mode, game), rounds: 6 };
      const moves: Move[] = mode === "battle-royale" ? ["right", "right", "right", "wrong"] : ["right", "wrong", "right", "timeout", "wrong", "right"];
      // Une pause courte et une pause d'une heure donnent la même partie : seul le temps de réponse compte.
      const short = playInBrowser(settings, "graine-solo", moves, 1_500);
      const long = playInBrowser(settings, "graine-solo", moves, 60 * 60 * 1000);
      expect(outcome(long.engine)).toEqual(outcome(short.engine));
      expect(long.log).toEqual(short.log);

      const replayed = replaySolo(settings, ME, "graine-solo", long.log);
      expect(outcome(replayed)).toEqual(outcome(long.engine));
      expect(replayed.history).toHaveLength(moves.length);
    });
  }

  it("une réponse fausse reste fausse, quoi que prétende le navigateur", () => {
    const settings = { ...defaultSettings(2, "speed-race"), rounds: 3 };
    const { engine, log } = playInBrowser(settings, "triche", ["wrong", "wrong", "wrong"], 10_000);
    expect(engine.player(ME.id)!.correct).toBe(0);
    // Le journal ne contient que les réponses : la justesse est recalculée, rien ne permet de la forcer.
    const forged = log.map((a) => ({ ...a, correct: true }) as SoloAnswer);
    expect(replaySolo(settings, ME, "triche", forged).player(ME.id)!.correct).toBe(0);
  });

  it("une réponse donnée après le temps de la manche est ramenée à la limite", () => {
    const settings = { ...defaultSettings(2, "speed-race"), rounds: 2 };
    const probe = new GameEngine(settings, [ME], "lent");
    const first = probe.startRound(0)!;
    const log: SoloAnswer[] = [{ answer: { value: first.question.answer }, timeMs: 999_999 }];
    const replayed = replaySolo(settings, ME, "lent", log);
    expect(replayed.history[0]!.answers[0]!.timeMs).toBe(first.timeLimitMs);
  });

  it("le rejeu s'arrête à la fin de la partie, même si le journal est plus long", () => {
    const settings = defaultSettings(1, "battle-royale");
    const { log } = playInBrowser(settings, "fin", ["right", "wrong"], 5_000);
    // Des réponses ajoutées après l'élimination ne comptent pas.
    const padded = [...log, ...log, ...log];
    const replayed = replaySolo(settings, ME, "fin", padded);
    expect(replayed.history).toHaveLength(2);
    expect(replayed.player(ME.id)!.correct).toBe(1);
  });
});
