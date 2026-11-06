/*
 * Bots de donjon pour tester à la main en local (jamais en production : ils signent leur jeton avec GAME_TOKEN_SECRET).
 *
 *   pnpm dungeon:bots                 ouvre un donjon tenu par un bot hôte (+ 1 bot) et affiche le lien ;
 *                                     l'expédition part dès qu'un vrai joueur entre, et repart après chaque fin
 *   pnpm dungeon:bots K7P2QX          fait entrer des bots dans TON donjon (tu restes l'hôte)
 *   options : --bots 1..3 (1 par défaut), --difficulty 1..5 (1), --accuracy 0..1 (0.9), --url ws://localhost:2567
 *
 * Les bots jouent comme des humains moyens : le plus souvent la salle la plus proche du boss, parfois une autre
 * (un coffre, une branche de côté) ; réponse après 1 à 3 s (jamais au-delà de la moitié du temps), juste 9 fois sur 10 ;
 * le butin va à l'allié qui en a le plus besoin. Ils n'utilisent pas leurs objets (à toi de le faire).
 */
import { createRequire } from "node:module";
import { BAG_SIZE, DUNGEON_MAX_LIVES, DUNGEON_ROOM, roomsTowardBoss, solveDungeonQuestion, wrongDungeonAnswer, type DungeonSnapshot } from "@calculus/game-core";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { Client } = require("colyseus.js");
const { SignJWT } = createRequire(import.meta.url)("jose");

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const code = args.find((a) => /^[A-Z0-9]{6}$/i.test(a))?.toUpperCase() ?? null;
const botCount = Math.min(3, Math.max(1, Number(opt("bots", "1"))));
const difficulty = Math.min(5, Math.max(1, Number(opt("difficulty", "1"))));
const accuracy = Math.min(1, Math.max(0, Number(opt("accuracy", "0.9"))));
const url = opt("url", "ws://localhost:2567");
const secret = process.env.GAME_TOKEN_SECRET;
if (!secret) throw new Error("GAME_TOKEN_SECRET manquant : lance le script avec le .env de la racine (pnpm dungeon:bots).");

const NAMES = ["Bot Ambre", "Bot Basalte", "Bot Cendre", "Bot Dune"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

async function token(id: string, name: string): Promise<string> {
  return new SignJWT({ name, guest: false, title: null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuer("calculus-web")
    .setAudience("calculus-game")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(secret));
}

/** Un bot dans la salle ; `host` : il lance l'expédition quand un vrai joueur est là. */
function drive(room: any, id: string, name: string, host: boolean) {
  const done = new Set<string>();
  const once = (key: string) => (done.has(key) ? false : (done.add(key), true));
  let starting = false;
  for (const t of ["welcome", "answer-ack", "answer-refused", "error"]) room.onMessage(t, () => {});
  room.onMessage("snapshot", (s: DungeonSnapshot) => {
    const humans = s.members.filter((m) => !m.id.startsWith("bot-") && m.connected);
    if (host && s.phase === "lobby" && humans.length > 0 && !starting) {
      starting = true;
      console.log(`${name} : ${humans.map((h) => h.name).join(", ")} est là, départ dans 5 s.`);
      setTimeout(() => {
        starting = false;
        room.send("start", {});
      }, 5000);
    }
    if (host && s.phase === "finished" && once(`end:${s.gameNumber}`)) {
      console.log(`Fin de l'expédition : ${s.summary?.outcome === "won" ? "victoire" : "défaite"} (${s.summary?.score} points). Retour en salle d'attente dans 20 s.`);
      setTimeout(() => room.send("back-to-lobby", {}), 20_000);
    }
    const g = s.game;
    if (!g) return;
    const me = g.players.find((p) => p.id === id);
    const round = `${s.gameNumber}:${g.round}`;
    if (g.phase === "positioning" && me?.standing && once(`pick:${round}`)) {
      const ranked = roomsTowardBoss(g);
      const target = Math.random() < 0.7 ? ranked[0] : ranked[Math.floor(Math.random() * ranked.length)];
      setTimeout(() => {
        if (!target) return;
        room.send("pick", { room: target.key });
        room.send("lock", {});
      }, rand(2000, 5000));
    }
    if (g.phase === "loot") {
      const mine = g.loot.find((l) => l.holderId === id && l.givenTo === null && !l.lost);
      if (mine && once(`loot:${round}`)) {
        const fits = (p: (typeof g.players)[number]) => !p.gone && (mine.item === "heart" ? p.lives < DUNGEON_MAX_LIVES : p.bag.length < BAG_SIZE);
        const need = (p: (typeof g.players)[number]) => (mine.item === "heart" ? p.lives : p.bag.length);
        const target = [...g.players].filter(fits).sort((a, b) => need(a) - need(b))[0];
        if (target) setTimeout(() => room.send("give-loot", { to: target.id }), rand(1500, 3000));
      }
    }
    const q = g.question;
    // Chaque calcul (y compris une tête d'hydre repoussée) a son propre texte : la clé le suit.
    if ((g.phase === "combat" || g.phase === "boss") && q?.text && once(`q:${round}:${g.phase}:${q.index}:${q.text}:${q.count}`)) {
      const right = solveDungeonQuestion(q);
      const answer = Math.random() < accuracy ? right : wrongDungeonAnswer(right);
      const window = q.deadline !== null && q.timerMs !== null ? q.deadline - q.startedAt : Infinity;
      const delay = Math.min(rand(1000, 3000), window * 0.5);
      setTimeout(() => room.send("answer", { index: q.index, ...answer }), delay);
    }
  });
  room.send("hello", {});
}

const client = new Client(url);
const rooms: any[] = [];
let target = code;
for (let i = 0; i < (code ? botCount : botCount + 1); i++) {
  const id = `bot-${i}-${Math.random().toString(36).slice(2, 6)}`;
  const name = NAMES[i]!;
  const tok = await token(id, name);
  const room = target ? await client.joinById(target, { token: tok }) : await client.create(DUNGEON_ROOM, { token: tok, settings: { difficulty } });
  target = room.roomId;
  drive(room, id, name, !code && i === 0);
  rooms.push(room);
  await sleep(200);
}

if (code) console.log(`${botCount} bot(s) dans ton donjon ${code}. Lance l'expédition quand tu veux. Ctrl+C pour les faire partir.`);
else {
  console.log(`Donjon ${target} ouvert (niveau ${difficulty}), tenu par ${NAMES[0]} avec ${botCount} autre(s) bot(s).`);
  console.log(`Rejoins-le connecté : http://localhost:3000/fr/dungeon/${target}`);
  console.log("L'expédition part 5 s après ton arrivée, et repart après chaque fin. Ctrl+C pour tout fermer.");
}

process.on("SIGINT", async () => {
  await Promise.all(rooms.map((r) => r.leave(true).catch(() => {})));
  process.exit(0);
});
