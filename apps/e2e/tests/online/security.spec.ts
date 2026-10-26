import { Client } from "colyseus.js";
import { JOIN_ERRORS } from "@calculus/game-core";
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
});
