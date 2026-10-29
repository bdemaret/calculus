import { Client } from "colyseus.js";
import { JOIN_ERRORS, MODES } from "@calculus/game-core";
import { GAME_HTTP_URL } from "../../env";
import { Bot } from "../../fixtures/bot";
import { expect, test } from "../../fixtures/test";

const gameClient = () => new Client(GAME_HTTP_URL.replace("http", "ws"));

test.describe("serveur de jeu : protections", () => {
  test("sans jeton valide, aucun lobby n'est créé", async () => {
    await expect(gameClient().create("game", {})).rejects.toMatchObject({ code: JOIN_ERRORS.badToken });
    await expect(gameClient().create("game", { token: "faux.jeton.signé" })).rejects.toMatchObject({ code: JOIN_ERRORS.badToken });
  });

  test("un lobby ne se rejoint qu'avec son code, jamais au hasard", async () => {
    const alice = await Bot.create("Alice", {});
    try {
      const token = await Bot.token("Intrus");
      await expect(gameClient().join("game", { token })).rejects.toThrow();
      const bob = await Bot.join(alice.room.roomId, "Bob");
      await expect.poll(() => alice.snapshot?.players.length).toBe(2);
      await bob.leave();
    } finally {
      await alice.leave();
    }
  });

  test("les messages en rafale sont ignorés au-delà de la limite", async () => {
    const alice = await Bot.create("Alice", {});
    try {
      await expect.poll(() => alice.snapshots.length).toBeGreaterThan(0);
      const before = alice.snapshots.length;
      // 100 « prêt / pas prêt » d'un coup : chacun déclencherait un snapshot pour tout le lobby.
      for (let i = 0; i < 100; i++) alice.room.send("ready", { ready: i % 2 === 0 });
      // Le dernier message accepté arrive vite ; on laisse le temps aux suivants d'être (non) traités.
      await expect.poll(() => alice.snapshots.length).toBeGreaterThan(before);
      await new Promise((r) => setTimeout(r, 500));
      expect(alice.snapshots.length - before).toBeLessThanOrEqual(20);
    } finally {
      await alice.leave();
    }
  });

  test("course de vitesse : pause après le point, bonne réponse diffusée, aucune réponse acceptée pendant la pause", async () => {
    const alice = await Bot.create("Alice", { mode: "speed-race", rounds: 5, difficulty: 1, operations: ["add"] });
    const bob = await Bot.join(alice.room.roomId, "Bob");
    try {
      alice.play(({ index }) => (index === 0 ? { move: "right", delayMs: 1_000 } : "idle"));
      bob.play(() => "idle");
      await expect.poll(() => alice.snapshot?.players.length).toBe(2);
      alice.start();
      const question = await bob.waitFor((s) => s.phase === "question" && s.roundIndex === 0);
      // Pendant la manche, la réponse n'est jamais envoyée.
      expect(question.lastRound).toBeNull();
      const pause = await bob.waitFor((s) => s.phase === "round-result");
      const pausedAt = Date.now();
      // Le point et la bonne réponse arrivent à tous, avec la fin de la pause.
      expect(pause.lastRound?.scorers).toEqual([alice.playerId]);
      expect(pause.lastRound?.text).toBe(question.question!.text);
      expect(pause.question).toBeNull();
      expect(pause.deadline! - pause.serverNow).toBeGreaterThanOrEqual(MODES["speed-race"].resultMs - 100);
      // Bob envoie la bonne réponse pendant la pause, pour cette manche et pour la suivante : ignorée.
      bob.send("answer", { value: pause.lastRound!.answer, questionIndex: 0 });
      bob.send("answer", { value: pause.lastRound!.answer, questionIndex: 1 });
      const next = await bob.waitFor((s) => s.phase === "question" && s.roundIndex === 1);
      expect(Date.now() - pausedAt).toBeGreaterThanOrEqual(MODES["speed-race"].resultMs - 500);
      expect(next.players.find((p) => p.id === bob.playerId)?.answeredThisRound).toBe(false);
      expect(next.players.find((p) => p.id === bob.playerId)?.score).toBe(0);
      expect(bob.acks.filter((a) => a.type === "answer-ack")).toEqual([]);
    } finally {
      await bob.leave();
      await alice.leave();
    }
  });

  test("la bombe : bombe invalide refusée avec sa raison, pas de réponse pendant la construction, une seule bombe", async () => {
    const alice = await Bot.create("Alice", { game: "bomb", difficulty: 1, operations: ["add", "sub"], buildTime: 15 });
    const bob = await Bot.join(alice.room.roomId, "Bob");
    try {
      alice.buildBombs(() => "idle");
      bob.buildBombs(() => "idle");
      await expect.poll(() => alice.snapshot?.players.length).toBe(2);
      alice.start();
      const build = await alice.waitFor((s) => s.phase === "build");
      const q = build.question!;
      const tiles = q.text.split(" ");
      // Pendant la construction, une réponse est ignorée (vérifié plus bas : jamais d'accusé de réception).
      alice.send("answer", { value: 3, questionIndex: q.index });
      // Plaque inventée, trop peu de plaques, message mal formé : refusés, avec la raison.
      alice.send("bomb", { roundIndex: q.index, expr: "999 + 1" });
      alice.send("bomb", { roundIndex: q.index, expr: tiles[0] });
      alice.send("bomb", { roundIndex: q.index, expr: 42 });
      await expect.poll(() => alice.acks.filter((a) => a.type === "bomb-ack").map((a) => (a.message as { reason?: string }).reason)).toEqual(["tiles", "min-tiles", "invalid"]);
      // Une bombe valide est acceptée, une seconde refusée.
      alice.send("bomb", { roundIndex: q.index, expr: `${tiles[0]} + ${tiles[1]}` });
      alice.send("bomb", { roundIndex: q.index, expr: `${tiles[1]} + ${tiles[0]}` });
      await expect
        .poll(() => alice.acks.filter((a) => a.type === "bomb-ack").slice(3).map((a) => (a.message as { accepted: boolean; reason?: string }).reason ?? "ok"))
        .toEqual(["ok", "already-answered"]);
      expect(alice.acks.some((a) => a.type === "answer-ack")).toBe(false);
      // Bob ne voit pas la bombe d'Alice, seulement qu'elle est prête.
      await expect.poll(() => bob.snapshot?.bomb?.built).toEqual([alice.playerId]);
      expect(bob.snapshot?.bomb?.mine).toBeNull();
      expect(JSON.stringify(bob.snapshots)).not.toContain(`${tiles[0]} + ${tiles[1]}`);
    } finally {
      await bob.leave();
      await alice.leave();
    }
  });
});
