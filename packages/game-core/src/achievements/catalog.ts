import { numbersOf, parseExpression } from "../expression";
import { GAME_IDS } from "../games";
import { DIFFICULTIES } from "../levels";
import type { AchievementDefinition, AchievementTier, GameFacts, RoundFacts, TitleDefinition } from "./types";

/** Niveau minimal d'un exploit : plus bas, les réglages les plus simples suffiraient. */
const EXPLOIT_MIN_DIFFICULTY = 3;
/** Manches minimales d'une partie « parfaite » (`MIN_ROUNDS` vaut 5). */
const EXPLOIT_MIN_ROUNDS = 10;
/** Réponse éclair, en ms. */
const FLASH_MS = 1000;
/** Réponse in extremis : temps restant, en ms. */
const BUZZER_MS = 200;
/** Fuseau des succès liés à l'heure : le navigateur ne donne pas d'heure fiable. */
const ACHIEVEMENT_TIME_ZONE = "Europe/Paris";

/** Heure, mois et jour d'une date à Paris. */
function parisTime(ms: number): { hour: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ACHIEVEMENT_TIME_ZONE,
    hourCycle: "h23",
    hour: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(ms);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { hour: read("hour"), month: read("month"), day: read("day") };
}

const isPalindrome = (n: number) => {
  const digits = String(n);
  return digits.length >= 3 && digits === [...digits].reverse().join("");
};

/** Réponses minimales d'une expédition « parfaite » (une seule série d'elfe ne suffit pas). */
const DUNGEON_PERFECT_MIN_ANSWERED = 10;

/** Toutes les plaques du tirage entrent dans l'expression. */
function usedAllTiles(round: RoundFacts): boolean {
  if (!round.tiles || !round.expr) return false;
  const tree = parseExpression(round.expr);
  return !!tree && numbersOf(tree).length === round.tiles.length;
}

const allButLastCorrect = (rounds: readonly RoundFacts[]) => {
  const last = rounds[rounds.length - 1];
  return !!last && !last.correct && rounds.slice(0, -1).every((r) => r.correct);
};

/** Les calculs comptent assez d'opérations différentes pour qu'une réponse éclair ne soit pas un réflexe. */
const variedOperations = (f: GameFacts) => f.operations.filter((op) => op === "add" || op === "sub" || op === "mul" || op === "div").length >= 2;

/** Série de succès cumulatifs sur un même compteur. */
function ladder(
  prefix: string,
  counter: string,
  category: AchievementDefinition["category"],
  steps: readonly (readonly [value: number, tier: AchievementTier, title?: string])[],
  online = false,
): AchievementDefinition[] {
  return steps.map(([value, tier, title]) => ({
    id: `${prefix}-${value}`,
    category,
    tier,
    online,
    target: { counter, value },
    title,
  }));
}

/** Calculs à série : le bon compte et la bombe n'en ont pas de comparable. */
const streak = (value: number, tier: AchievementTier, online = false, title?: string): AchievementDefinition => ({
  id: `streak-${value}`,
  category: "game",
  tier,
  online,
  title,
  check: (f) => (f.game === "standard" || f.game === "missing") && f.difficulty >= EXPLOIT_MIN_DIFFICULTY && f.bestStreak >= value,
});

/** Tous les succès. Un id déployé ne change plus : il est en base. Textes : `achievements.<id>` dans les messages du site. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  /* ---------- Parcours ---------- */
  ...ladder("games", "games", "journey", [
    [1, "bronze"],
    [10, "bronze"],
    [50, "silver"],
    [250, "gold", "regular"],
    [1000, "platinum", "pillar"],
  ]),
  ...ladder(
    "wins",
    "wins",
    "journey",
    [
      [1, "bronze"],
      [10, "silver"],
      [50, "gold", "top-of-class"],
      [250, "gold"],
      [1000, "platinum", "terror"],
    ],
    true,
  ),
  ...ladder("correct", "correct", "journey", [
    [100, "bronze"],
    [1000, "silver"],
    [10000, "gold", "calculator"],
    [100000, "platinum"],
  ]),
  { id: "level-5-win", category: "journey", tier: "gold", online: true, target: { counter: "wins:level:5", value: 1 }, title: "living-legend" },
  { id: "all-games", category: "journey", tier: "silver", target: { every: GAME_IDS.map((g) => `games:${g}`) }, title: "all-rounder" },
  { id: "all-games-win", category: "journey", tier: "gold", online: true, target: { every: GAME_IDS.map((g) => `wins:${g}`) }, title: "polymath" },
  { id: "all-levels", category: "journey", tier: "gold", online: true, target: { every: DIFFICULTIES.map((d) => `wins:level:${d}`) } },
  // Chronométré par le serveur, comme une partie en ligne. Le compteur vient de `DailyRun.won`.
  { id: "daily-champion", category: "journey", tier: "gold", target: { counter: "daily-wins", value: 1 } },

  /* ---------- Modes ---------- */
  ...ladder(
    "br-wins",
    "wins:battle-royale",
    "mode",
    [
      [10, "silver"],
      [100, "gold", "last-standing"],
    ],
    true,
  ),
  {
    id: "br-full-lobby",
    category: "mode",
    tier: "gold",
    online: true,
    title: "against-all",
    // Comptes inscrits : des invités dans d'autres onglets ne remplissent pas le lobby.
    check: (f) => f.mode === "battle-royale" && f.won && f.accounts >= 5,
  },
  {
    id: "br-round-30",
    category: "mode",
    tier: "gold",
    check: (f) => f.mode === "battle-royale" && f.difficulty >= EXPLOIT_MIN_DIFFICULTY && f.rounds.filter((r) => r.correct).length >= 30,
  },
  { id: "br-spared", category: "mode", tier: "bronze", online: true, check: (f) => f.mode === "battle-royale" && f.players > 1 && f.rounds.some((r) => r.spared) },
  ...ladder(
    "sr-wins",
    "wins:speed-race",
    "mode",
    [
      [10, "silver"],
      [100, "gold", "lightning"],
    ],
    true,
  ),
  {
    id: "sr-shutout",
    category: "mode",
    tier: "gold",
    online: true,
    title: "no-sharing",
    check: (f) => f.mode === "speed-race" && f.won && f.rounds.length >= EXPLOIT_MIN_ROUNDS && f.bestOpponentScore === 0,
  },
  { id: "sr-comeback", category: "mode", tier: "gold", online: true, title: "turnaround", check: (f) => f.mode === "speed-race" && f.won && f.maxDeficit >= 3 },
  {
    id: "sr-flash",
    category: "mode",
    tier: "silver",
    online: true,
    check: (f) =>
      f.mode === "speed-race" &&
      (f.game === "standard" || f.game === "missing") &&
      variedOperations(f) &&
      f.rounds.some((r) => r.correct && r.timeMs < FLASH_MS && r.difficulty >= EXPLOIT_MIN_DIFFICULTY),
  },

  /* ---------- Jeux ---------- */
  streak(10, "bronze"),
  streak(25, "silver"),
  streak(50, "gold", true, "flawless"),
  {
    id: "perfect-solo",
    category: "game",
    tier: "silver",
    check: (f) =>
      f.solo && f.game === "standard" && f.mode === "speed-race" && f.difficulty >= EXPLOIT_MIN_DIFFICULTY && f.rounds.length >= EXPLOIT_MIN_ROUNDS && f.rounds.every((r) => r.correct),
  },
  ...ladder("power", "power", "game", [[50, "silver"]]),
  ...ladder("rc-exact", "rc-exact", "game", [
    [10, "silver"],
    [100, "gold", "right-count"],
  ]),
  { id: "rc-closest", category: "game", tier: "bronze", online: true, check: (f) => f.game === "right-count" && f.rounds.some((r) => r.closest) },
  { id: "rc-all-tiles", category: "game", tier: "silver", check: (f) => f.game === "right-count" && f.rounds.some((r) => r.correct && usedAllTiles(r)) },
  ...ladder("missing-op", "missing-op", "game", [[50, "silver", "gap-filler"]]),
  ...ladder(
    "bomb-boom",
    "bomb-boom",
    "game",
    [
      [1, "bronze"],
      [10, "silver"],
      [100, "gold", "pyrotechnic"],
    ],
    true,
  ),
  ...ladder(
    "bomb-defuse",
    "bomb-defuse",
    "game",
    [
      [10, "silver"],
      [100, "gold", "defusal-ace"],
    ],
    true,
  ),
  { id: "bomb-clean", category: "game", tier: "gold", online: true, check: (f) => f.game === "bomb" && f.bomb.built >= 3 && f.bomb.exploded >= f.bomb.built },
  { id: "bomb-unprepared", category: "game", tier: "silver", online: true, secret: true, check: (f) => f.game === "bomb" && f.won && f.bomb.usedFallback },

  /* ---------- Pour le plaisir ---------- */
  { id: "answer-42", category: "fun", tier: "bronze", secret: true, title: "answer-to-everything", check: (f) => f.rounds.some((r) => r.correct && r.expected === 42) },
  {
    id: "night-owl",
    category: "fun",
    tier: "bronze",
    secret: true,
    title: "night-owl",
    check: (f) => {
      const { hour } = parisTime(f.endedAt);
      return hour >= 2 && hour < 5;
    },
  },
  {
    id: "pi-day",
    category: "fun",
    tier: "bronze",
    secret: true,
    check: (f) => {
      const { month, day } = parisTime(f.endedAt);
      return month === 3 && day === 14;
    },
  },
  {
    id: "buzzer",
    category: "fun",
    tier: "silver",
    online: true,
    secret: true,
    title: "on-the-wire",
    check: (f) => f.rounds.some((r) => r.correct && r.timeLimitMs - r.timeMs < BUZZER_MS),
  },
  {
    id: "all-wrong",
    category: "fun",
    tier: "bronze",
    secret: true,
    title: "dunce-cap",
    check: (f) => f.rounds.length >= EXPLOIT_MIN_ROUNDS && f.rounds.every((r) => r.answered && !r.correct),
  },
  {
    id: "so-close",
    category: "fun",
    tier: "bronze",
    secret: true,
    // En battle royale, toute partie finit sur une erreur.
    check: (f) => f.mode === "speed-race" && f.rounds.length >= EXPLOIT_MIN_ROUNDS && allButLastCorrect(f.rounds),
  },
  ...ladder("first-out", "first-out", "fun", [[10, "bronze", "bad-luck"]], true),
  { id: "palindrome", category: "fun", tier: "bronze", secret: true, check: (f) => f.rounds.some((r) => r.correct && isPalindrome(r.expected)) },

  /* ---------- Donjons (toujours en ligne, entre comptes) ---------- */
  ...ladder(
    "dungeon-wins",
    "dungeon-wins",
    "dungeon",
    [
      [1, "bronze", "adventurer"],
      [10, "silver"],
      [100, "gold", "dungeon-scourge"],
    ],
    true,
  ),
  {
    id: "dungeon-perfect",
    category: "dungeon",
    tier: "gold",
    online: true,
    dungeonCheck: (f) => f.won && f.answered >= DUNGEON_PERFECT_MIN_ANSWERED && f.correct === f.answered,
  },
  { id: "dungeon-legend", category: "dungeon", tier: "gold", online: true, dungeonCheck: (f) => f.won && f.difficulty === 5 },
  { id: "dungeon-last-life", category: "dungeon", tier: "bronze", online: true, dungeonCheck: (f) => f.won && f.lives === 1 },
  { id: "dungeon-full-party", category: "dungeon", tier: "bronze", online: true, dungeonCheck: (f) => f.won && f.players === 4 },
  ...ladder("dungeon-guardian", "dungeon-hearts", "dungeon", [[10, "silver"]], true),
  // Perdue sans un seul ennemi vaincu : l'équipe n'a jamais passé les premières salles.
  { id: "dungeon-wiped", category: "dungeon", tier: "bronze", secret: true, online: true, dungeonCheck: (f) => !f.won && f.enemiesDefeated === 0 },

  /* ---------- Social ---------- */
  ...ladder("friend", "friends", "social", [
    [1, "bronze"],
    [5, "silver"],
  ]),
  { id: "guild-join", category: "social", tier: "bronze", target: { counter: "guild-member", value: 1 } },
  { id: "guild-lead", category: "social", tier: "bronze", target: { counter: "guild-leader", value: 1 } },
];

export const ACHIEVEMENT_IDS: readonly string[] = ACHIEVEMENTS.map((a) => a.id);

/** Titre de tout compte, sans succès à obtenir : il n'a pas de ligne `UserTitle`, et `User.titleId` null le désigne. */
export const DEFAULT_TITLE_ID = "newcomer";

/** Valeur de `User.titleId` d'un joueur qui a choisi de n'afficher aucun titre. Hors de `TITLES`. */
export const NO_TITLE = "none";

/** Titre affiché d'un compte à partir de son `User.titleId`, null s'il n'en veut aucun. */
export const wornTitle = (titleId: string | null): string | null => (titleId === NO_TITLE ? null : (titleId ?? DEFAULT_TITLE_ID));

/** Tous les titres. Formulations épicènes : le site ne connaît pas le genre des joueurs. Textes : `titles.<id>`. */
export const TITLES: readonly TitleDefinition[] = [
  { id: DEFAULT_TITLE_ID, rarity: "common" },
  { id: "regular", rarity: "common" },
  { id: "pillar", rarity: "rare" },
  { id: "top-of-class", rarity: "rare" },
  { id: "terror", rarity: "legendary" },
  { id: "calculator", rarity: "rare" },
  { id: "living-legend", rarity: "epic" },
  { id: "all-rounder", rarity: "common" },
  { id: "polymath", rarity: "epic" },
  { id: "last-standing", rarity: "epic" },
  { id: "against-all", rarity: "epic" },
  { id: "lightning", rarity: "epic" },
  { id: "no-sharing", rarity: "epic" },
  { id: "turnaround", rarity: "rare" },
  { id: "flawless", rarity: "epic" },
  { id: "right-count", rarity: "rare" },
  { id: "gap-filler", rarity: "common" },
  { id: "pyrotechnic", rarity: "epic" },
  { id: "defusal-ace", rarity: "epic" },
  { id: "answer-to-everything", rarity: "common" },
  { id: "night-owl", rarity: "common" },
  { id: "on-the-wire", rarity: "rare" },
  { id: "dunce-cap", rarity: "common" },
  { id: "bad-luck", rarity: "common" },
  { id: "adventurer", rarity: "common" },
  { id: "dungeon-scourge", rarity: "epic" },
];

export const TITLE_IDS: readonly string[] = TITLES.map((t) => t.id);
