import { LEVELS } from "../levels";
import { OPERATION_SYMBOL } from "../generator";
import { missingGame } from "../games/missing";
import type { BasicOperation, Difficulty, PlayerInfo, Puzzle, Question } from "../types";
import { ENEMIES, enemyTimeMs, type EnemyId, type EnemyProfile, type EnemyQuestionKind, type FightForm } from "./enemies";
import { BAG_SIZE, BOMB_DAMAGE, HOURGLASS_FACTOR, ITEM_USE, PURSE_POINTS, rollLoot, type ItemId } from "./items";
import {
  BOSS_HP_PER_PLAYER,
  BOSS_POINTS,
  BOSS_TIME_FACTOR,
  CHEST_POINTS,
  DUNGEON_FLOORS,
  DUNGEON_IDLE_MS,
  DUNGEON_MAX_LIVES,
  DUNGEON_POSITIONING_MS,
  DUNGEON_START_LIVES,
  LIFE_POINTS,
  SEAL_FLOOR_RATIO,
  SEAL_WEAKEN,
  buildDungeon,
  stepsToBoss,
  type DungeonMap,
  type DungeonSettings,
  type MapRoom,
  type RoomKind,
} from "./map";
import { bossQuestion, enemyQuestion } from "./questions";

/*
 * Moteur d'une expédition, pur et déterministe : le temps est toujours passé en paramètre,
 * la carte, les calculs et le butin ne dépendent que de la graine. C'est le serveur qui tient l'horloge
 * (`phaseEndsAt`, `nextDeadline`) et qui appelle `expire` quand une échéance tombe.
 *
 * Une manche d'exploration : chacun choisit une salle accessible (positionnement), puis l'affronte (combat) ;
 * vient ensuite le bilan des combats (`round-result` : chacun y relit ses calculs et ceux des autres, puis clique
 * sur « Suivant »), puis la phase des objets (`loot`, seulement si la manche a rapporté du butin, close dès que tout
 * est distribué). Ces deux phases durent au plus `DUNGEON_IDLE_MS`, pour qu'un joueur inactif ne bloque personne. Les salles réussies ouvrent les suivantes. Il faut avoir ouvert
 * la salle du boss à la fin des 4 manches d'exploration ; la 5e manche est le boss.
 */

export type DungeonPhase = "positioning" | "combat" | "loot" | "round-result" | "boss" | "finished";
export type DungeonOutcome = "won" | "lost";
/** Pourquoi l'équipe a perdu (`no-enemy-defeated` : expéditions de la première version, gardées en base). */
export type DungeonLossReason = "boss-not-reached" | "team-down" | "boss-timeout" | "no-enemy-defeated";

/** Réponse d'un joueur : un nombre, ou un opérateur (spectre). */
export type DungeonAnswer = { value: number } | { op: BasicOperation };

export type FightStatus = "fighting" | "won" | "failed";

/** Un calcul joué pendant une série, relu au bilan des combats. `given` null : temps écoulé (ou départ). */
export interface CalcRecord {
  /** Forme du calcul : ordinaire, ou nombre manquant (sorcière, spectre), pour l'afficher comme au jeu. */
  game: Question["puzzle"]["game"];
  text: string;
  solution: string;
  given: string | null;
  correct: boolean;
  /** Temps mis à répondre (ms). */
  timeMs: number;
}

/**
 * Part d'un joueur dans le score, par source. Chaque point de l'expédition revient à quelqu'un :
 * salles vaincues (partagées entre leurs vainqueurs), boss (selon les PV retirés), vies restantes et bourses gardées.
 */
export interface DungeonPoints {
  rooms: number;
  boss: number;
  lives: number;
  purses: number;
}

export const dungeonPointsTotal = (p: DungeonPoints): number => p.rooms + p.boss + p.lives + p.purses;

/**
 * Partage `total` points entiers au prorata de `weights` (plus forts restes) ; à reste égal, le premier de la liste
 * l'emporte. Tout à zéro si aucun poids n'est positif. La somme vaut toujours `total` sinon.
 */
export function splitPoints(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * Math.max(0, w)) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, rest: e - Math.floor(e) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    shares[i]! += 1;
    left -= 1;
  }
  return shares;
}

interface PlayerRecord extends PlayerInfo {
  lives: number;
  /** Parti pour de bon (après le délai de reconnexion). */
  gone: boolean;
  livesLost: number;
  enemiesDefeated: number;
  /** Sa part du score, par source : le score de l'équipe est la somme de ces parts. */
  points: DungeonPoints;
  bossDamage: number;
  heartsGiven: number;
  heartsReceived: number;
  itemsFound: number;
  correct: number;
  answered: number;
  /** Temps cumulé des bonnes réponses (ms). */
  correctTimeMs: number;
  bag: ItemId[];
  /** Objets activés pour la prochaine série. */
  buffs: { hourglass: boolean; secondChance: boolean };
}

/** Ce qu'un joueur fait dans une salle pendant une manche. Un coffre est réussi d'office. */
interface Fight {
  playerId: string;
  room: MapRoom;
  form: FightForm | "chest";
  profile: EnemyProfile | null;
  /** Calculs de la série (`regrow` : grandit à chaque erreur ; `shared` : bonnes réponses de ce joueur). */
  count: number;
  index: number;
  /** Nouveau tirage au même rang (seconde chance, tête repoussée). */
  attempt: number;
  question: Question | null;
  startedAt: number;
  seriesStartedAt: number;
  status: FightStatus;
  finishedAt: number | null;
  /** Le calcul raté, sa solution et la réponse donnée (null : temps écoulé ou départ). */
  failure: { question: Question; given: string | null } | null;
  /** Chaque calcul joué, dans l'ordre (montré seulement une fois la manche finie). */
  log: CalcRecord[];
  /** Sablier : temps multiplié. */
  timeFactor: number;
  secondChance: boolean;
}

/** La série commune d'une horde. */
interface SharedPool {
  roomKey: string;
  total: number;
  remaining: number;
  startedAt: number;
  endsAt: number;
  status: FightStatus;
}

interface BossFight {
  playerId: string;
  index: number;
  question: Question;
  startedAt: number;
  down: boolean;
}

export interface LootEntry {
  roomKey: string;
  item: ItemId;
  /** Le vainqueur (le plus rapide) qui distribue l'objet. */
  holderId: string;
  /** À qui il l'a donné, null tant qu'il n'a pas choisi (ou s'il a été perdu, `lost`). */
  givenTo: string | null;
  lost: boolean;
}

/** Bilan d'une manche d'exploration, montré en `round-result` : les solutions n'y figurent qu'une fois la manche finie. */
export interface DungeonRoundOutcome {
  round: number;
  /** Salles réussies pendant la manche. */
  cleared: string[];
  points: number;
  sealsBroken: number;
  fights: {
    playerId: string;
    roomKey: string;
    status: Exclude<FightStatus, "fighting">;
    reached: number;
    count: number;
    failure: { text: string; solution: string; given: string | null } | null;
    /** Tous les calculs joués par ce joueur pendant la manche (vide pour un coffre). */
    calcs: CalcRecord[];
  }[];
}

/**
 * Une étape du parcours d'un joueur, pour le récap de fin d'expédition : une manche d'exploration (la salle affrontée)
 * ou le boss, avec chaque calcul joué, les objets reçus ou distribués et les objets utilisés.
 */
export interface DungeonJourneyStep {
  /** Manche d'exploration (0 à 3), ou `DUNGEON_FLOORS` pour le boss. */
  round: number;
  boss: boolean;
  /** Salle affrontée (null : boss, ou manche sans combat, à terre). */
  roomKey: string | null;
  roomKind: RoomKind | null;
  enemy: EnemyId | null;
  /** Issue : salle réussie ou ratée, boss vaincu ou non ; null sans combat. */
  status: Exclude<FightStatus, "fighting"> | null;
  calcs: CalcRecord[];
  /** Butin de la manche qui passe par ce joueur : trouvé (`fromId`) ou reçu (`toId`) ; `toId` null : laissé ou perdu. */
  loot: { item: ItemId; fromId: string; toId: string | null }[];
  /** Objets utilisés pendant l'étape. */
  used: ItemId[];
  /** Vies à la fin de l'étape. */
  lives: number;
}

export type DungeonActionResult = { ok: true } | { ok: false; reason: DungeonRefusal };
export type DungeonRefusal =
  | "phase"
  | "unknown-player"
  | "down"
  | "no-room"
  | "no-pick"
  | "no-loot"
  | "full-lives"
  | "bag-full"
  | "no-item"
  | "passive"
  | "already";

export interface DungeonSubmitResult {
  accepted: boolean;
  correct: boolean;
  /** La série de ce joueur est finie (gagnée ou ratée), ou il est tombé face au boss. */
  done: boolean;
  /** Le combat (ou la partie) est fini : le serveur peut clore. */
  over: boolean;
}

/** Ce que voit un joueur d'une salle : le brouillard cache le contenu de ce qui est loin. */
export interface RoomView {
  key: string;
  floor: number;
  index: number;
  x: number;
  links: string[];
  bossLink: boolean;
  /** `known` : tout ; `type` : seulement le type (ennemi, sceau, coffre) ; `hidden` : rien. */
  visibility: "known" | "type" | "hidden";
  /** Une mimique se montre comme un coffre tant que personne n'y est entré. */
  kind: RoomKind | null;
  enemy: EnemyId | null;
  tier: number | null;
  points: number | null;
  loot: boolean | null;
  cleared: boolean;
  accessible: boolean;
  /** Profil de l'ennemi (salle connue) : calculs, temps, forme. */
  count: number | null;
  timeMs: number | null;
  visibleMs: number | null;
  totalMs: number | null;
  form: FightForm | null;
  questionKind: EnemyQuestionKind | null;
}

/** Ce qu'un joueur voit : jamais la réponse d'un calcul en cours, jamais une salle cachée par le brouillard. */
export interface DungeonView {
  difficulty: Difficulty;
  /** Manche en cours, 0 à 4 (4 : le boss). */
  round: number;
  phase: DungeonPhase;
  phaseEndsAt: number | null;
  rooms: RoomView[];
  /** La salle du boss est ouverte. */
  bossReached: boolean;
  sealsBroken: number;
  sealsTotal: number;
  /** Carte utilisée : plus de brouillard (sauf les mimiques). */
  revealed: boolean;
  players: {
    id: string;
    name: string;
    lives: number;
    gone: boolean;
    standing: boolean;
    pick: string | null;
    locked: boolean;
    /** Bilan des combats : a cliqué sur « Suivant ». */
    ready: boolean;
    fight: { roomKey: string; index: number; count: number; status: FightStatus } | null;
    bossDamage: number;
    bag: ItemId[];
    buffs: { hourglass: boolean; secondChance: boolean };
  }[];
  /** Hordes en cours : la série commune de chaque salle. */
  pools: { roomKey: string; total: number; remaining: number; startedAt: number; endsAt: number; status: FightStatus }[];
  /** Fin du décompte avant le combat ou le boss (heure du serveur), null hors décompte : aucun calcul n'est montré avant. */
  introEndsAt: number | null;
  /**
   * Le calcul en cours de ce joueur. `text` vide une fois l'énoncé d'une momie caché. `deadline` : fin du temps
   * (du calcul, de la série ou de la horde), null face au boss ; `timerMs` : durée de cette fenêtre.
   */
  question: {
    text: string;
    hidden: boolean;
    puzzle: Puzzle;
    answerKind: "number" | "op";
    index: number;
    count: number | null;
    startedAt: number;
    deadline: number | null;
    timerMs: number | null;
  } | null;
  boss: { hp: number; maxHp: number; startedAt: number; endsAt: number } | null;
  loot: LootEntry[];
  lastRound: DungeonRoundOutcome | null;
  score: number;
  outcome: DungeonOutcome | null;
  lossReason: DungeonLossReason | null;
}

/** Bilan d'une expédition (page de fin, enregistrement). */
export interface DungeonSummary {
  difficulty: Difficulty;
  outcome: DungeonOutcome | null;
  lossReason: DungeonLossReason | null;
  /** Manches jouées (1 à 5). */
  roundsPlayed: number;
  score: number;
  bossMaxHp: number | null;
  bossHp: number | null;
  enemiesDefeated: number;
  sealsBroken: number;
  players: {
    id: string;
    name: string;
    lives: number;
    livesLost: number;
    enemiesDefeated: number;
    /** Sa part du score : la somme des parts vaut le score de l'équipe (sauf expéditions d'avant ce calcul). */
    points: number;
    /** Détail de sa part, null pour une expédition enregistrée avant le partage du score. */
    pointsDetail: DungeonPoints | null;
    bossDamage: number;
    heartsGiven: number;
    heartsReceived: number;
    itemsFound: number;
    correct: number;
    answered: number;
    avgTimeMs: number | null;
    /** Parti avant la fin (absent d'un bilan relu en base). */
    gone?: boolean;
  }[];
  /** Parcours de chaque joueur, par id, étape par étape (absent d'un bilan relu en base). */
  journeys?: Record<string, DungeonJourneyStep[]>;
}

export interface DungeonEngineOptions {
  /** Tolérance ajoutée à chaque échéance (latence réseau), en ms. */
  graceMs?: number;
  /** Décompte avant chaque combat et avant le boss, en ms (0 par défaut ; le serveur passe `DUNGEON_INTRO_MS`). */
  introMs?: number;
}

const answerText = (a: DungeonAnswer): string => ("value" in a ? String(a.value) : OPERATION_SYMBOL[a.op]);

/** Une réponse juste : un nombre égal au résultat, ou ce qui manque au nombre manquant (même vérification que le jeu). */
function isRight(q: Question, a: DungeonAnswer): boolean {
  if (q.puzzle.game === "missing") return missingGame.check(q, a);
  return "value" in a && a.value === q.answer;
}

export class DungeonEngine {
  readonly difficulty: Difficulty;
  readonly map: DungeonMap;
  readonly graceMs: number;
  readonly introMs: number;
  /** Fin du décompte en cours (combat ou boss), null une fois les calculs lancés. */
  introEndsAt: number | null = null;
  phase: DungeonPhase = "positioning";
  round = 0;
  phaseEndsAt: number | null = null;
  outcome: DungeonOutcome | null = null;
  lossReason: DungeonLossReason | null = null;
  lastRound: DungeonRoundOutcome | null = null;
  loot: LootEntry[] = [];
  sealsBroken = 0;
  revealed = false;

  private readonly players: PlayerRecord[];
  private readonly rooms: Map<string, MapRoom>;
  private readonly cleared = new Set<string>();
  /** Salles franchies avec une clé (sans combat). */
  private readonly keyed = new Set<string>();
  /** Salles où quelqu'un est entré (une mimique y est démasquée). */
  private readonly entered = new Set<string>();
  private picks = new Map<string, string>();
  private locked = new Set<string>();
  /** Bilan des combats : joueurs qui ont cliqué sur « Suivant ». */
  private ready = new Set<string>();
  /** Joueurs partis puis revenus : ils reprennent leur place au prochain positionnement (`rejoin`). */
  private returning = new Set<string>();
  private fights = new Map<string, Fight>();
  private pools = new Map<string, SharedPool>();
  private bossFights = new Map<string, BossFight>();
  private boss: { hp: number; maxHp: number; startedAt: number; endsAt: number } | null = null;
  /** Parcours de chaque joueur (récap de fin), étape par étape. */
  private journeys = new Map<string, DungeonJourneyStep[]>();
  /** Le butin de la manche est déjà noté dans les parcours. */
  private lootRecorded = true;

  constructor(
    settings: DungeonSettings,
    players: PlayerInfo[],
    readonly seed: string,
    options: DungeonEngineOptions = {},
  ) {
    this.difficulty = settings.difficulty;
    this.graceMs = options.graceMs ?? 0;
    this.introMs = Math.max(0, options.introMs ?? 0);
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      lives: DUNGEON_START_LIVES,
      gone: false,
      livesLost: 0,
      enemiesDefeated: 0,
      points: { rooms: 0, boss: 0, lives: 0, purses: 0 },
      bossDamage: 0,
      heartsGiven: 0,
      heartsReceived: 0,
      itemsFound: 0,
      correct: 0,
      answered: 0,
      correctTimeMs: 0,
      bag: [],
      buffs: { hourglass: false, secondChance: false },
    }));
    this.map = buildDungeon(seed, players.length);
    this.rooms = new Map(this.map.rooms.map((r) => [r.key, r]));
  }

  get isOver(): boolean {
    return this.phase === "finished";
  }

  /** Lance la première manche (positionnement). */
  start(now: number): void {
    this.round = 0;
    this.startPositioning(now);
  }

  /** Joueurs encore debout et présents. */
  standing(): PlayerRecord[] {
    return this.players.filter((p) => p.lives > 0 && !p.gone);
  }

  /** Salles accessibles : non réussies, à l'étage 1 ou au bout d'un passage d'une salle réussie. */
  accessible(): MapRoom[] {
    return this.map.rooms.filter((r) => !this.cleared.has(r.key) && (r.floor === 1 || this.map.rooms.some((s) => this.cleared.has(s.key) && s.links.includes(r.key))));
  }

  /** La salle du boss est ouverte (une salle qui y mène est réussie). */
  get bossReached(): boolean {
    return this.map.rooms.some((r) => r.bossLink && this.cleared.has(r.key));
  }

  /* -------------------------------------------------------------- */
  /* Positionnement                                                   */
  /* -------------------------------------------------------------- */

  private startPositioning(now: number): void {
    // Les joueurs revenus pendant la manche précédente reprennent leur place, avec les vies qu'ils avaient.
    for (const id of this.returning) {
      const p = this.player(id);
      if (p) p.gone = false;
    }
    this.returning.clear();
    this.phase = "positioning";
    this.phaseEndsAt = now + DUNGEON_POSITIONING_MS;
    this.picks = new Map();
    this.locked = new Set();
    this.fights = new Map();
    this.pools = new Map();
    this.loot = [];
  }

  /** Choisir une salle accessible (on peut changer d'avis tant qu'on n'a pas verrouillé). */
  pick(playerId: string, roomKey: string): DungeonActionResult {
    if (this.phase !== "positioning") return { ok: false, reason: "phase" };
    const p = this.player(playerId);
    if (!p) return { ok: false, reason: "unknown-player" };
    if (p.lives <= 0 || p.gone) return { ok: false, reason: "down" };
    if (this.locked.has(playerId)) return { ok: false, reason: "phase" };
    if (!this.accessible().some((r) => r.key === roomKey)) return { ok: false, reason: "no-room" };
    this.picks.set(playerId, roomKey);
    return { ok: true };
  }

  /** Verrouiller son choix. */
  lock(playerId: string): DungeonActionResult {
    if (this.phase !== "positioning") return { ok: false, reason: "phase" };
    if (!this.player(playerId)) return { ok: false, reason: "unknown-player" };
    if (!this.picks.has(playerId)) return { ok: false, reason: "no-pick" };
    this.locked.add(playerId);
    return { ok: true };
  }

  /** Tous les joueurs debout ont verrouillé : le serveur peut clore le positionnement en avance. */
  get allLocked(): boolean {
    return this.standing().every((p) => this.locked.has(p.id));
  }

  /**
   * Fin du positionnement : les indécis vont dans la salle accessible la moins couverte, puis chacun commence.
   * Si personne n'a de série à jouer (tous au coffre), le combat se clôt aussitôt.
   */
  closePositioning(now: number): void {
    if (this.phase !== "positioning") return;
    // Les séries commencent après le décompte : leurs chronos partent de `start`.
    const start = now + this.introMs;
    const open = this.accessible();
    for (const p of this.standing()) {
      if (this.picks.has(p.id)) continue;
      let best: MapRoom | null = null;
      let bestCount = Infinity;
      for (const room of open) {
        const count = [...this.picks.values()].filter((k) => k === room.key).length;
        if (count < bestCount) [best, bestCount] = [room, count];
      }
      if (best) this.picks.set(p.id, best.key);
    }
    for (const p of this.standing()) {
      const room = this.rooms.get(this.picks.get(p.id) ?? "");
      if (!room) continue;
      this.entered.add(room.key);
      const factor = p.buffs.hourglass ? HOURGLASS_FACTOR : 1;
      const secondChance = p.buffs.secondChance;
      p.buffs = { hourglass: false, secondChance: false };
      if (room.kind === "chest" || !room.enemy) {
        this.fights.set(p.id, {
          playerId: p.id,
          room,
          form: "chest",
          profile: null,
          count: 0,
          index: 0,
          attempt: 0,
          question: null,
          startedAt: now,
          seriesStartedAt: now,
          status: "won",
          finishedAt: now,
          failure: null,
          log: [],
          timeFactor: 1,
          secondChance: false,
        });
        continue;
      }
      const profile = ENEMIES[room.enemy].profile(this.difficulty, room.floor - 1);
      const form = profile.form ?? "solo";
      if (form === "shared" && !this.pools.has(room.key)) {
        this.pools.set(room.key, { roomKey: room.key, total: profile.count, remaining: profile.count, startedAt: start, endsAt: start + (profile.totalMs ?? 30_000), status: "fighting" });
      }
      this.fights.set(p.id, {
        playerId: p.id,
        room,
        form,
        profile,
        count: profile.count,
        index: 0,
        attempt: 0,
        question: this.enemyQuestion(room, p.id, 0, 0),
        startedAt: start,
        seriesStartedAt: start,
        status: "fighting",
        finishedAt: null,
        failure: null,
        log: [],
        timeFactor: factor,
        secondChance,
      });
    }
    this.phase = "combat";
    this.phaseEndsAt = null;
    this.introEndsAt = this.introMs > 0 ? start : null;
    if (this.combatOver) this.closeCombat(now);
  }

  private enemyQuestion(room: MapRoom, playerId: string, index: number, attempt: number): Question {
    return enemyQuestion(this.seed, this.round, room.key, room.enemy!, room.floor - 1, this.difficulty, playerId, index, attempt);
  }

  /* -------------------------------------------------------------- */
  /* Combat et boss                                                   */
  /* -------------------------------------------------------------- */

  /** Fin du temps d'une série en cours : du calcul (`solo`), de la série (`regrow`) ou de la horde (`shared`). */
  private deadlineOf(f: Fight): number {
    if (f.form === "shared") return this.pools.get(f.room.key)?.endsAt ?? f.startedAt;
    const p = f.profile!;
    if (f.form === "regrow") return f.seriesStartedAt + Math.round((p.totalMs ?? p.timeMs * f.count) * f.timeFactor);
    return f.startedAt + Math.round(enemyTimeMs(p, f.index) * f.timeFactor);
  }

  /** Réponse d'un joueur au calcul en cours de sa série (ou du boss). Un nombre seul vaut `{ value }`. */
  submit(playerId: string, input: DungeonAnswer | number, now: number): DungeonSubmitResult {
    const refused = { accepted: false, correct: false, done: false, over: false };
    const answer: DungeonAnswer = typeof input === "number" ? { value: input } : input;
    if ("value" in answer && !Number.isFinite(answer.value)) return refused;
    const p = this.player(playerId);
    if (!p) return refused;
    // Pendant le décompte, aucun calcul n'a été montré : rien n'est accepté.
    if (this.introEndsAt !== null) return refused;
    if (this.phase === "combat") return this.submitFight(p, answer, now) ?? refused;
    if (this.phase === "boss" && "value" in answer) return this.submitBoss(p, answer.value, now) ?? refused;
    return refused;
  }

  private submitFight(p: PlayerRecord, answer: DungeonAnswer, now: number): DungeonSubmitResult | null {
    const fight = this.fights.get(p.id);
    if (!fight || fight.status !== "fighting" || !fight.question) return null;
    p.answered += 1;
    // Hors délai : compte comme temps écoulé, même si la réponse est juste.
    const inTime = now <= this.deadlineOf(fight) + this.graceMs;
    if (!inTime) {
      this.expireFight(fight, now);
      return { accepted: true, correct: false, done: true, over: this.combatOver };
    }
    const elapsed = now - fight.startedAt;
    if (!isRight(fight.question, answer)) {
      if (fight.secondChance || fight.form === "regrow") {
        // Seconde chance : l'erreur est pardonnée une fois. Hydre : deux têtes repoussent.
        this.record(fight, answerText(answer), false, now);
        if (fight.secondChance) fight.secondChance = false;
        else fight.count += fight.profile?.regrow ?? 2;
        fight.attempt += 1;
        fight.question = this.enemyQuestion(fight.room, p.id, fight.index, fight.attempt);
        fight.startedAt = now;
        return { accepted: true, correct: false, done: false, over: false };
      }
      this.failFight(fight, answerText(answer), now);
      return { accepted: true, correct: false, done: true, over: this.combatOver };
    }
    p.correct += 1;
    p.correctTimeMs += Math.max(0, elapsed);
    this.record(fight, answerText(answer), true, now);
    fight.index += 1;
    if (fight.form === "shared") {
      const pool = this.pools.get(fight.room.key)!;
      pool.remaining -= 1;
      if (pool.remaining <= 0) {
        pool.status = "won";
        for (const f of this.fights.values()) {
          if (f.room.key === pool.roomKey && f.status === "fighting") {
            f.status = "won";
            f.finishedAt = now;
          }
        }
        // Celui qui porte le dernier coup passe en tête pour le butin.
        fight.finishedAt = now - 1;
        return { accepted: true, correct: true, done: true, over: this.combatOver };
      }
    } else if (fight.index >= fight.count) {
      fight.status = "won";
      fight.finishedAt = now;
      return { accepted: true, correct: true, done: true, over: this.combatOver };
    }
    fight.attempt = 0;
    fight.question = this.enemyQuestion(fight.room, p.id, fight.index, 0);
    fight.startedAt = now;
    return { accepted: true, correct: true, done: false, over: false };
  }

  private failFight(fight: Fight, given: string | null, now: number): void {
    fight.status = "failed";
    fight.finishedAt = now;
    fight.failure = fight.question ? { question: fight.question, given } : null;
    this.record(fight, given, false, now);
  }

  /** Note le calcul en cours de la série dans son journal (relu au bilan des combats). */
  private record(fight: Fight, given: string | null, correct: boolean, now: number): void {
    const q = fight.question;
    if (!q) return;
    fight.log.push({ game: q.puzzle.game, text: q.text, solution: q.solution, given, correct, timeMs: Math.max(0, now - fight.startedAt) });
  }

  /** Temps écoulé : la série du joueur échoue ; pour une horde, toute la salle. */
  private expireFight(fight: Fight, now: number): void {
    if (fight.form === "shared") {
      const pool = this.pools.get(fight.room.key);
      if (pool && pool.status === "fighting") pool.status = "failed";
      for (const f of this.fights.values()) if (f.room.key === fight.room.key && f.status === "fighting") this.failFight(f, null, now);
      return;
    }
    this.failFight(fight, null, now);
  }

  private submitBoss(p: PlayerRecord, value: number, now: number): DungeonSubmitResult | null {
    const fight = this.bossFights.get(p.id);
    const boss = this.boss;
    if (!fight || fight.down || !boss) return null;
    if (now > boss.endsAt + this.graceMs) {
      this.expire(now);
      return { accepted: false, correct: false, done: true, over: true };
    }
    p.answered += 1;
    const correct = value === fight.question.answer;
    this.recordBoss(fight, String(value), correct, now);
    if (correct) {
      p.correct += 1;
      p.correctTimeMs += Math.max(0, now - fight.startedAt);
      p.bossDamage += 1;
      boss.hp -= 1;
      if (boss.hp <= 0) {
        this.finish("won", null);
        return { accepted: true, correct: true, done: true, over: true };
      }
    } else {
      this.loseLife(p);
      if (p.lives <= 0) {
        fight.down = true;
        if (this.standing().length === 0) this.finish("lost", "team-down");
        return { accepted: true, correct: false, done: true, over: this.isOver };
      }
    }
    fight.index += 1;
    fight.question = bossQuestion(this.seed, this.difficulty, p.id, fight.index);
    fight.startedAt = now;
    return { accepted: true, correct, done: false, over: false };
  }

  /** Numéro du calcul en cours de ce joueur (série ou boss), null s'il n'en a pas. */
  questionIndex(playerId: string): number | null {
    if (this.phase === "combat") {
      const f = this.fights.get(playerId);
      return f?.status === "fighting" ? f.index : null;
    }
    if (this.phase === "boss") {
      const f = this.bossFights.get(playerId);
      return f && !f.down ? f.index : null;
    }
    return null;
  }

  /**
   * Fin du temps du calcul en cours de ce joueur (série ou boss, sans la marge de latence), null s'il n'en a pas.
   * Sert au serveur à valider, à l'échéance, une saisie envoyée mais pas encore validée.
   */
  deadlineFor(playerId: string): number | null {
    if (this.introEndsAt !== null) return null;
    if (this.phase === "combat") {
      const f = this.fights.get(playerId);
      return f?.status === "fighting" ? this.deadlineOf(f) : null;
    }
    if (this.phase === "boss") {
      const f = this.bossFights.get(playerId);
      return f && !f.down && this.boss ? this.boss.endsAt : null;
    }
    return null;
  }

  /** Toutes les séries de la manche sont finies. */
  get combatOver(): boolean {
    return this.phase === "combat" && [...this.fights.values()].every((f) => f.status !== "fighting");
  }

  /**
   * Prochaine échéance que le serveur doit surveiller (ms), null s'il n'y en a pas :
   * fin de phase, temps de la série la plus pressée, ou chrono du boss.
   */
  nextDeadline(): number | null {
    if (this.introEndsAt !== null) return this.introEndsAt;
    if (this.phase === "combat") {
      const deadlines = [...this.fights.values()].filter((f) => f.status === "fighting").map((f) => this.deadlineOf(f) + this.graceMs);
      return deadlines.length > 0 ? Math.min(...deadlines) : null;
    }
    if (this.phase === "boss") return this.boss ? this.boss.endsAt + this.graceMs : null;
    return this.phaseEndsAt;
  }

  /** Applique les échéances passées : séries hors délai ratées, boss hors délai. Renvoie vrai si quelque chose a changé. */
  expire(now: number): boolean {
    // Fin du décompte : les calculs partent (le serveur rediffuse la vue avec l'énoncé).
    if (this.introEndsAt !== null) {
      if (now < this.introEndsAt) return false;
      this.introEndsAt = null;
      return true;
    }
    if (this.phase === "combat") {
      let changed = false;
      for (const f of this.fights.values()) {
        if (f.status === "fighting" && now > this.deadlineOf(f) + this.graceMs) {
          const p = this.player(f.playerId);
          if (p) p.answered += 1;
          this.expireFight(f, now);
          changed = true;
        }
      }
      return changed;
    }
    if (this.phase === "boss" && this.boss && now > this.boss.endsAt + this.graceMs) {
      this.finish("lost", "boss-timeout", now);
      return true;
    }
    return false;
  }

  /**
   * Fin d'une manche d'exploration : salles réussies, vies perdues, butin, chemin du boss, puis le bilan des combats.
   * Null si des séries sont encore en cours.
   */
  closeCombat(now: number): DungeonRoundOutcome | null {
    if (!this.combatOver) return null;
    this.introEndsAt = null;
    const fights = [...this.fights.values()];
    const cleared: string[] = [];
    let points = 0;
    let seals = 0;
    this.loot = [];
    const rooms = [...new Set(fights.map((f) => f.room))].sort((a, b) => a.floor - b.floor || a.index - b.index);
    for (const room of rooms) {
      const winners = fights
        .filter((f) => f.room.key === room.key && f.status === "won")
        .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0) || this.order(a.playerId) - this.order(b.playerId));
      if (winners.length === 0 || this.cleared.has(room.key)) continue;
      cleared.push(room.key);
      this.cleared.add(room.key);
      points += room.points;
      if (room.kind === "seal") seals += 1;
      // Les points de la salle sont partagés entre ses vainqueurs ; le reste de la division va aux premiers arrivés.
      const shares = splitPoints(room.points, winners.map(() => 1));
      winners.forEach((w, i) => {
        const p = this.player(w.playerId);
        if (!p) return;
        if (room.enemy) p.enemiesDefeated += 1;
        p.points.rooms += shares[i]!;
      });
      const holder = winners[0];
      if (room.loot && holder) {
        // À la dernière manche d'exploration, plus de positionnement : le butin ne contient que ce qui sert encore.
        const late = this.round >= DUNGEON_FLOORS - 1;
        const items = rollLoot(this.seed, room.key, room.kind === "chest" ? "chest" : "rare", late);
        for (const item of items) this.loot.push({ roomKey: room.key, item, holderId: holder.playerId, givenTo: null, lost: false });
        const p = this.player(holder.playerId);
        if (p) p.itemsFound += items.length;
      }
    }
    for (const f of fights) {
      if (f.status !== "failed") continue;
      const p = this.player(f.playerId);
      if (p && !p.gone) this.loseLife(p);
    }
    for (const f of fights) {
      const step = this.stepOf(f.playerId);
      if (!step) continue;
      step.roomKey = f.room.key;
      step.roomKind = f.room.kind;
      step.enemy = f.room.enemy;
      step.status = f.status === "won" ? "won" : "failed";
      step.calcs = f.log.map((c) => ({ ...c }));
    }
    this.lootRecorded = this.loot.length === 0;
    this.refreshLives();
    this.sealsBroken += seals;
    this.lastRound = {
      round: this.round,
      cleared,
      points,
      sealsBroken: seals,
      fights: fights.map((f) => ({
        playerId: f.playerId,
        roomKey: f.room.key,
        status: f.status === "won" ? "won" : "failed",
        reached: f.index,
        count: f.form === "shared" ? (this.pools.get(f.room.key)?.total ?? f.count) : f.count,
        failure: f.failure ? { text: f.failure.question.text, solution: f.failure.question.solution, given: f.failure.given } : null,
        calcs: f.log.map((c) => ({ ...c })),
      })),
    };
    if (this.standing().length === 0) this.finish("lost", "team-down");
    else if (!this.bossStillReachable()) this.finish("lost", "boss-not-reached");
    else {
      // Bilan des combats : on attend que chacun clique sur « Suivant », au plus une minute.
      this.phase = "round-result";
      this.phaseEndsAt = now + DUNGEON_IDLE_MS;
      this.ready = new Set();
    }
    return this.lastRound;
  }

  /** Le boss peut-il encore être atteint dans les manches qui restent (une salle de plus au mieux par manche) ? */
  private bossStillReachable(): boolean {
    if (this.bossReached) return true;
    const roundsLeft = DUNGEON_FLOORS - (this.round + 1);
    const memo = new Map<string, number>();
    const best = Math.min(Infinity, ...this.accessible().map((r) => stepsToBoss(this.map, r, memo)));
    return best <= roundsLeft;
  }

  /* -------------------------------------------------------------- */
  /* Butin et sac                                                     */
  /* -------------------------------------------------------------- */

  /**
   * Donner un objet trouvé à un joueur (soi-même ou un allié ; un cœur relève un allié à terre).
   * `item` choisit lequel quand on en a plusieurs à distribuer (un coffre en donne deux) ; sans lui, le premier.
   */
  giveLoot(fromId: string, toId: string, item?: ItemId): DungeonActionResult {
    if (this.phase !== "loot") return { ok: false, reason: "phase" };
    const entry = this.loot.find((l) => l.holderId === fromId && l.givenTo === null && !l.lost && (item === undefined || l.item === item));
    if (!entry) return { ok: false, reason: "no-loot" };
    const to = this.player(toId);
    if (!to || to.gone) return { ok: false, reason: "unknown-player" };
    if (entry.item === "heart" && to.lives >= DUNGEON_MAX_LIVES) return { ok: false, reason: "full-lives" };
    if (entry.item !== "heart" && to.bag.length >= BAG_SIZE) return { ok: false, reason: "bag-full" };
    this.applyLoot(entry, to);
    return { ok: true };
  }

  /** Ancien nom (V1) : donner son cœur. */
  giveHeart(fromId: string, toId: string): DungeonActionResult {
    return this.giveLoot(fromId, toId);
  }

  /** Laisser un objet trouvé (personne n'en veut, ou plus de place nulle part) : il est perdu. */
  discardLoot(fromId: string, item?: ItemId): DungeonActionResult {
    if (this.phase !== "loot") return { ok: false, reason: "phase" };
    const entry = this.loot.find((l) => l.holderId === fromId && l.givenTo === null && !l.lost && (item === undefined || l.item === item));
    if (!entry) return { ok: false, reason: "no-loot" };
    entry.lost = true;
    return { ok: true };
  }

  /** Tout le butin a été distribué (ou laissé) : la phase des objets est finie, le serveur peut passer à la suite. */
  get lootDone(): boolean {
    return this.loot.every((l) => l.givenTo !== null || l.lost);
  }

  /**
   * Fin de la phase des objets (tout réglé, ou délai écoulé), puis manche suivante. Un objet encore à distribuer reste à son vainqueur
   * s'il a la place, sinon va à l'allié qui en a le plus besoin.
   */
  closeLoot(now: number): void {
    if (this.phase !== "loot") return;
    for (const entry of this.loot) this.settleLoot(entry);
    this.nextRound(now);
  }

  /** Distribue d'office un objet en attente : à son vainqueur s'il a la place, sinon à l'allié qui en a le plus besoin, sinon perdu. */
  private settleLoot(entry: LootEntry): void {
    if (entry.givenTo !== null || entry.lost) return;
    const holder = this.player(entry.holderId);
    const fits = (p: PlayerRecord) => !p.gone && (entry.item === "heart" ? p.lives < DUNGEON_MAX_LIVES : p.bag.length < BAG_SIZE);
    const need = (p: PlayerRecord) => (entry.item === "heart" ? p.lives : p.bag.length);
    const target = holder && fits(holder) ? holder : this.players.filter(fits).sort((a, b) => need(a) - need(b) || this.order(a.id) - this.order(b.id))[0];
    if (target) this.applyLoot(entry, target);
    else entry.lost = true;
  }

  private applyLoot(entry: LootEntry, to: PlayerRecord): void {
    entry.givenTo = to.id;
    if (entry.item === "heart") {
      to.lives = Math.min(DUNGEON_MAX_LIVES, to.lives + 1);
      if (to.id !== entry.holderId) {
        to.heartsReceived += 1;
        const from = this.player(entry.holderId);
        if (from) from.heartsGiven += 1;
      }
      return;
    }
    to.bag.push(entry.item);
  }

  /**
   * Utiliser un objet de son sac. Au positionnement : sablier, seconde chance (pour sa prochaine série),
   * clé (`target` : une salle accessible, franchie sans combat), carte, bannière. Face au boss : la bombe.
   * Le bouclier, la plume de phénix et la bourse agissent seuls.
   */
  useItem(playerId: string, item: ItemId, target?: string): DungeonActionResult {
    const p = this.player(playerId);
    if (!p || p.gone) return { ok: false, reason: "unknown-player" };
    const at = p.bag.indexOf(item);
    if (at < 0) return { ok: false, reason: "no-item" };
    const use = ITEM_USE[item];
    if (use === "passive" || use === "instant") return { ok: false, reason: "passive" };
    if (use === "positioning" && this.phase !== "positioning") return { ok: false, reason: "phase" };
    if (use === "boss" && this.phase !== "boss") return { ok: false, reason: "phase" };
    switch (item) {
      case "hourglass":
        if (p.buffs.hourglass) return { ok: false, reason: "already" };
        p.buffs.hourglass = true;
        break;
      case "second-chance":
        if (p.buffs.secondChance) return { ok: false, reason: "already" };
        p.buffs.secondChance = true;
        break;
      case "key": {
        const room = this.accessible().find((r) => r.key === target);
        if (!room) return { ok: false, reason: "no-room" };
        // Franchie sans combat : ni points, ni butin, ni sceau brisé ; seulement le chemin qui s'ouvre.
        this.cleared.add(room.key);
        this.entered.add(room.key);
        this.keyed.add(room.key);
        for (const [id, k] of [...this.picks]) {
          if (k !== room.key) continue;
          this.picks.delete(id);
          this.locked.delete(id);
        }
        break;
      }
      case "map":
        if (this.revealed) return { ok: false, reason: "already" };
        this.revealed = true;
        break;
      case "banner":
        for (const q of this.players) if (!q.gone) q.lives = Math.min(DUNGEON_MAX_LIVES, q.lives + 1);
        break;
      case "bomb": {
        const boss = this.boss;
        if (!boss) return { ok: false, reason: "phase" };
        boss.hp -= BOMB_DAMAGE;
        p.bossDamage += BOMB_DAMAGE;
        p.bag.splice(at, 1);
        this.stepOf(p.id)?.used.push(item);
        if (boss.hp <= 0) this.finish("won", null);
        return { ok: true };
      }
      default:
        return { ok: false, reason: "passive" };
    }
    p.bag.splice(at, 1);
    this.stepOf(p.id)?.used.push(item);
    return { ok: true };
  }

  /** Passer un objet de son sac à un allié (positionnement ou butin). */
  giveItem(fromId: string, toId: string, item: ItemId): DungeonActionResult {
    if (this.phase !== "positioning" && this.phase !== "loot") return { ok: false, reason: "phase" };
    const from = this.player(fromId);
    const to = this.player(toId);
    if (!from || !to || to.gone || from === to) return { ok: false, reason: "unknown-player" };
    const at = from.bag.indexOf(item);
    if (at < 0) return { ok: false, reason: "no-item" };
    if (to.bag.length >= BAG_SIZE) return { ok: false, reason: "bag-full" };
    from.bag.splice(at, 1);
    to.bag.push(item);
    return { ok: true };
  }

  /** Jeter un objet (pour faire de la place). */
  dropItem(playerId: string, item: ItemId): DungeonActionResult {
    if (this.isOver) return { ok: false, reason: "phase" };
    const p = this.player(playerId);
    const at = p ? p.bag.indexOf(item) : -1;
    if (!p || at < 0) return { ok: false, reason: "no-item" };
    p.bag.splice(at, 1);
    return { ok: true };
  }

  /** Bilan des combats : ce joueur a fini de le lire (« Suivant »). */
  markReady(playerId: string): DungeonActionResult {
    if (this.phase !== "round-result") return { ok: false, reason: "phase" };
    const p = this.player(playerId);
    if (!p || p.gone) return { ok: false, reason: "unknown-player" };
    this.ready.add(playerId);
    return { ok: true };
  }

  /** Tous les joueurs encore là (debout ou à terre) ont cliqué sur « Suivant » : le serveur peut avancer. */
  get allReady(): boolean {
    return this.phase === "round-result" && this.players.every((p) => p.gone || this.ready.has(p.id));
  }

  /**
   * Après le bilan des combats (tous prêts, ou délai écoulé) : la phase des objets s'il y a du butin à distribuer,
   * sinon la manche suivante.
   */
  advance(now: number): void {
    if (this.phase !== "round-result") return;
    if (!this.lootDone) {
      this.phase = "loot";
      this.phaseEndsAt = now + DUNGEON_IDLE_MS;
      return;
    }
    this.nextRound(now);
  }

  /** Manche d'exploration suivante, ou le boss. */
  private nextRound(now: number): void {
    this.recordLoot();
    this.round += 1;
    if (this.round < DUNGEON_FLOORS) this.startPositioning(now);
    else if (this.bossReached) this.startBoss(now);
    else this.finish("lost", "boss-not-reached");
  }

  /** Le boss : PV selon le nombre de joueurs, réduits par les sceaux brisés ; chrono global. */
  private startBoss(now: number): void {
    const players = this.players.filter((p) => !p.gone).length;
    const ratio = Math.max(SEAL_FLOOR_RATIO, 1 - SEAL_WEAKEN * this.sealsBroken);
    const maxHp = Math.max(1, Math.round(BOSS_HP_PER_PLAYER * players * ratio));
    const durationMs = Math.round((maxHp / Math.max(1, players)) * LEVELS[this.difficulty].defaultTime * 1000 * BOSS_TIME_FACTOR);
    const start = now + this.introMs;
    this.boss = { hp: maxHp, maxHp, startedAt: start, endsAt: start + durationMs };
    this.phase = "boss";
    this.phaseEndsAt = this.boss.endsAt;
    this.bossFights = new Map();
    for (const p of this.standing()) {
      this.bossFights.set(p.id, { playerId: p.id, index: 0, question: bossQuestion(this.seed, this.difficulty, p.id, 0), startedAt: start, down: false });
      this.stepOf(p.id);
    }
    this.introEndsAt = this.introMs > 0 ? start : null;
    if (this.bossFights.size === 0) this.finish("lost", "team-down");
  }

  /* -------------------------------------------------------------- */
  /* Départs, fin, vues                                               */
  /* -------------------------------------------------------------- */

  /** Départ définitif d'un joueur : sa série en cours est ratée, son choix retiré. */
  leave(playerId: string, now: number): void {
    this.returning.delete(playerId);
    const p = this.player(playerId);
    if (!p || p.gone || this.isOver) return;
    p.gone = true;
    this.picks.delete(playerId);
    this.locked.delete(playerId);
    const fight = this.fights.get(playerId);
    if (this.phase === "combat" && fight?.status === "fighting") this.failFight(fight, null, now);
    const boss = this.bossFights.get(playerId);
    if (boss) boss.down = true;
    // Phase des objets : ce qu'il avait à distribuer est réparti d'office, pour ne bloquer personne.
    if (this.phase === "loot") for (const entry of this.loot) if (entry.holderId === playerId) this.settleLoot(entry);
    if (this.standing().length === 0) this.finish("lost", "team-down");
  }

  /**
   * Retour d'un joueur parti (`leave`) : pendant le positionnement il reprend aussitôt sa place, sinon au prochain.
   * Il garde ses vies et son sac ; le boss une fois lancé, il ne fait que regarder.
   */
  rejoin(playerId: string): { ok: boolean } {
    const p = this.player(playerId);
    if (!p || !p.gone || this.isOver) return { ok: false };
    if (this.phase === "positioning") p.gone = false;
    else this.returning.add(playerId);
    return { ok: true };
  }

  private finish(outcome: DungeonOutcome, reason: DungeonLossReason | null, now?: number): void {
    this.recordLoot();
    if (this.phase === "boss") {
      for (const fight of this.bossFights.values()) {
        const step = this.stepOf(fight.playerId);
        if (!step) continue;
        // Chrono écoulé : le calcul en cours est noté sans réponse.
        if (reason === "boss-timeout" && !fight.down && now !== undefined) this.recordBoss(fight, null, false, now);
        step.status = outcome === "won" ? "won" : "failed";
      }
    }
    this.outcome = outcome;
    this.lossReason = reason;
    if (outcome === "won") {
      // Le boss se partage selon les PV que chacun lui a retirés (calculs réussis et bombes).
      const shares = splitPoints(BOSS_POINTS * this.difficulty, this.players.map((p) => p.bossDamage));
      this.players.forEach((p, i) => {
        p.points.boss += shares[i]!;
        if (!p.gone) p.points.lives += LIFE_POINTS * p.lives;
      });
    }
    // Les bourses d'or comptent dans tous les cas, pour qui les a dans son sac.
    for (const p of this.players) p.points.purses += PURSE_POINTS * p.bag.filter((i) => i === "purse").length;
    this.refreshLives();
    this.phase = "finished";
    this.phaseEndsAt = null;
    this.introEndsAt = null;
  }

  /** L'étape de la manche en cours d'un joueur, créée au besoin (undefined pour un joueur inconnu). */
  private stepOf(playerId: string): DungeonJourneyStep | undefined {
    const p = this.player(playerId);
    if (!p) return undefined;
    let steps = this.journeys.get(playerId);
    if (!steps) this.journeys.set(playerId, (steps = []));
    let step = steps.find((s) => s.round === this.round);
    if (!step) {
      step = {
        round: this.round,
        boss: this.round >= DUNGEON_FLOORS,
        roomKey: null,
        roomKind: null,
        enemy: null,
        status: null,
        calcs: [],
        loot: [],
        used: [],
        lives: p.lives,
      };
      steps.push(step);
    }
    return step;
  }

  /** Note un calcul du boss dans le parcours du joueur. */
  private recordBoss(fight: BossFight, given: string | null, correct: boolean, now: number): void {
    const q = fight.question;
    this.stepOf(fight.playerId)?.calcs.push({ game: q.puzzle.game, text: q.text, solution: q.solution, given, correct, timeMs: Math.max(0, now - fight.startedAt) });
  }

  /** Note le butin de la manche (une fois réparti) chez qui l'a trouvé et chez qui l'a reçu. */
  private recordLoot(): void {
    if (this.lootRecorded) return;
    this.lootRecorded = true;
    for (const entry of this.loot) {
      // Pas encore réparti (l'expédition s'est arrêtée avant) : rien à raconter.
      if (entry.givenTo === null && !entry.lost) continue;
      const line = { item: entry.item, fromId: entry.holderId, toId: entry.givenTo };
      this.stepOf(entry.holderId)?.loot.push({ ...line });
      if (entry.givenTo !== null && entry.givenTo !== entry.holderId) this.stepOf(entry.givenTo)?.loot.push({ ...line });
    }
    this.refreshLives();
  }

  /** Vies de chacun à la fin de l'étape en cours. */
  private refreshLives(): void {
    for (const p of this.players) {
      const step = this.journeys.get(p.id)?.find((s) => s.round === this.round);
      if (step) step.lives = p.lives;
    }
  }

  /** Une vie perdue : le bouclier l'arrête ; la plume de phénix relève à 1 vie. */
  private loseLife(p: PlayerRecord): void {
    if (p.lives <= 0) return;
    const shield = p.bag.indexOf("shield");
    if (shield >= 0) {
      p.bag.splice(shield, 1);
      return;
    }
    p.lives -= 1;
    p.livesLost += 1;
    const phoenix = p.bag.indexOf("phoenix");
    if (p.lives === 0 && phoenix >= 0) {
      p.bag.splice(phoenix, 1);
      p.lives = 1;
    }
  }

  private player(id: string): PlayerRecord | undefined {
    return this.players.find((p) => p.id === id);
  }

  private order(id: string): number {
    return this.players.findIndex((p) => p.id === id);
  }

  /** Score de l'équipe : la somme des parts de chacun (y compris de ceux qui sont partis). */
  get score(): number {
    return this.players.reduce((sum, p) => sum + dungeonPointsTotal(p.points), 0);
  }

  /** Ce qu'une salle montre, selon le brouillard. */
  private roomView(room: MapRoom, open: Set<string>, behind: Set<string>): RoomView {
    const cleared = this.cleared.has(room.key);
    const accessible = open.has(room.key);
    const unmasked = this.entered.has(room.key) || cleared;
    const visibility: RoomView["visibility"] = cleared || accessible || unmasked || this.revealed ? "known" : behind.has(room.key) ? "type" : "hidden";
    const disguised = room.kind === "mimic" && !unmasked;
    const shownKind: RoomKind | null = visibility === "hidden" ? null : disguised ? "chest" : room.kind;
    const base: RoomView = {
      key: room.key,
      floor: room.floor,
      index: room.index,
      x: room.x,
      links: room.links,
      bossLink: room.bossLink,
      visibility,
      kind: shownKind,
      enemy: null,
      tier: null,
      points: null,
      loot: null,
      cleared,
      accessible,
      count: null,
      timeMs: null,
      visibleMs: null,
      totalMs: null,
      form: null,
      questionKind: null,
    };
    if (visibility !== "known") return base;
    // Un coffre (ou une mimique encore déguisée, qui ne doit pas s'en distinguer).
    if (disguised || !room.enemy) return { ...base, loot: true, points: CHEST_POINTS };
    const p = ENEMIES[room.enemy].profile(this.difficulty, room.floor - 1);
    return {
      ...base,
      enemy: room.enemy,
      tier: room.tier,
      points: room.points,
      loot: room.loot,
      count: p.count,
      timeMs: p.timeMs,
      visibleMs: p.visibleMs,
      totalMs: p.totalMs ?? null,
      form: p.form ?? "solo",
      questionKind: p.question ?? "standard",
    };
  }

  /** Ce que voit un joueur (ou un spectateur, `viewerId` vide) à l'instant `now`. */
  view(viewerId: string, now: number): DungeonView {
    const open = new Set(this.phase === "finished" || this.phase === "boss" ? [] : this.accessible().map((r) => r.key));
    // Juste derrière : les salles où mène une salle accessible (on en voit le type).
    const behind = new Set(this.map.rooms.filter((r) => open.has(r.key)).flatMap((r) => r.links));
    const showFights = this.phase === "combat" || this.phase === "loot" || this.phase === "round-result";
    const players = this.players.map((p) => {
      const f = showFights ? this.fights.get(p.id) : undefined;
      const pool = f?.form === "shared" ? this.pools.get(f.room.key) : undefined;
      return {
        id: p.id,
        name: p.name,
        lives: p.lives,
        gone: p.gone,
        standing: p.lives > 0 && !p.gone,
        pick: this.picks.get(p.id) ?? null,
        locked: this.locked.has(p.id),
        ready: this.ready.has(p.id),
        fight: f ? { roomKey: f.room.key, index: pool ? pool.total - pool.remaining : f.index, count: pool ? pool.total : f.count, status: f.status } : null,
        bossDamage: p.bossDamage,
        bag: [...p.bag],
        buffs: { ...p.buffs },
      };
    });
    return {
      difficulty: this.difficulty,
      round: this.round,
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      rooms: this.map.rooms.map((r) => this.roomView(r, open, behind)),
      bossReached: this.bossReached,
      sealsBroken: this.sealsBroken,
      sealsTotal: this.map.rooms.filter((r) => r.kind === "seal").length,
      revealed: this.revealed,
      players,
      pools: showFights ? [...this.pools.values()].map((pool) => ({ ...pool })) : [],
      introEndsAt: this.introEndsAt,
      question: this.questionView(viewerId, now),
      boss: this.boss ? { ...this.boss } : null,
      loot: this.loot.map((l) => ({ ...l })),
      lastRound: this.lastRound,
      score: this.score,
      outcome: this.outcome,
      lossReason: this.lossReason,
    };
  }

  private questionView(viewerId: string, now: number): DungeonView["question"] {
    // Décompte : l'énoncé ne part pas avant le départ des chronos.
    if (this.introEndsAt !== null) return null;
    if (this.phase === "combat") {
      const f = this.fights.get(viewerId);
      if (!f || f.status !== "fighting" || !f.question || !f.profile) return null;
      // Momie : passé son délai, l'énoncé ne repart plus, même dans un nouveau snapshot.
      const visibleMs = f.profile.visibleMs;
      const hidden = visibleMs !== null && now >= f.startedAt + visibleMs;
      const deadline = this.deadlineOf(f);
      const windowStart = f.form === "solo" ? f.startedAt : f.form === "regrow" ? f.seriesStartedAt : (this.pools.get(f.room.key)?.startedAt ?? f.startedAt);
      const pool = f.form === "shared" ? this.pools.get(f.room.key) : undefined;
      return {
        text: hidden ? "" : f.question.text,
        hidden,
        // Le nombre manquant : l'égalité avec son trou (jamais ce qui manque).
        puzzle: hidden ? { game: "standard" } : f.question.puzzle,
        answerKind: f.question.puzzle.game === "missing" && f.question.puzzle.hole === "operator" ? "op" : "number",
        index: f.index,
        count: pool ? pool.total : f.count,
        startedAt: f.startedAt,
        deadline,
        timerMs: deadline - windowStart,
      };
    }
    if (this.phase === "boss") {
      const f = this.bossFights.get(viewerId);
      if (!f || f.down) return null;
      return {
        text: f.question.text,
        hidden: false,
        puzzle: f.question.puzzle,
        answerKind: "number",
        index: f.index,
        count: null,
        startedAt: f.startedAt,
        deadline: null,
        timerMs: null,
      };
    }
    return null;
  }

  /** Bilan de l'expédition, pour la page de fin et l'enregistrement. */
  summary(): DungeonSummary {
    return {
      difficulty: this.difficulty,
      outcome: this.outcome,
      lossReason: this.lossReason,
      roundsPlayed: this.round + 1,
      score: this.score,
      bossMaxHp: this.boss?.maxHp ?? null,
      bossHp: this.boss ? Math.max(0, this.boss.hp) : null,
      enemiesDefeated: [...this.cleared].filter((k) => this.rooms.get(k)?.enemy && !this.keyed.has(k)).length,
      sealsBroken: this.sealsBroken,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        lives: p.lives,
        livesLost: p.livesLost,
        enemiesDefeated: p.enemiesDefeated,
        points: dungeonPointsTotal(p.points),
        pointsDetail: { ...p.points },
        bossDamage: p.bossDamage,
        heartsGiven: p.heartsGiven,
        heartsReceived: p.heartsReceived,
        itemsFound: p.itemsFound,
        correct: p.correct,
        answered: p.answered,
        avgTimeMs: p.correct > 0 ? Math.round(p.correctTimeMs / p.correct) : null,
        gone: p.gone,
      })),
      journeys: Object.fromEntries(
        this.players.map((p) => [
          p.id,
          (this.journeys.get(p.id) ?? [])
            .slice()
            .sort((a, b) => a.round - b.round)
            .map((s) => ({ ...s, calcs: s.calcs.map((c) => ({ ...c })), loot: s.loot.map((l) => ({ ...l })), used: [...s.used] })),
        ]),
      ),
    };
  }
}
