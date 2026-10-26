import type { GameSettings } from "@calculus/game-core";
import { LobbyPage } from "../pages/LobbyPage";
import { Bot, joinBots } from "./bot";
import { test as base } from "./test";

interface Online {
  /** Le joueur de la page principale du test, avec un pseudo invité et des réglages de lobby. */
  host: (name: string, settings?: Partial<GameSettings>) => Promise<LobbyPage>;
  /** Un autre joueur, dans son propre navigateur. */
  guest: (name: string, settings?: Partial<GameSettings>) => Promise<LobbyPage>;
  /** Des faux joueurs qui rejoignent un lobby existant. */
  bots: (code: string, names: string[]) => Promise<Bot[]>;
  /** Un faux joueur qui crée le lobby (il en est donc l'hôte). */
  botHost: (name: string, settings: Partial<GameSettings>) => Promise<Bot>;
}

/** `test` pour les parties en ligne : navigateurs et bots sont fermés à la fin de chaque test. */
export const test = base.extend<Online>({
  host: async ({ page }, use) => {
    await use(async (name, settings) => {
      const lobby = new LobbyPage(page);
      await lobby.preset(name, settings);
      return lobby;
    });
  },
  guest: async ({ browser }, use) => {
    const opened: LobbyPage[] = [];
    await use(async (name, settings) => {
      const lobby = await LobbyPage.guest(browser, name, settings);
      opened.push(lobby);
      return lobby;
    });
    for (const l of opened) await l.close();
  },
  bots: async ({}, use) => {
    const all: Bot[] = [];
    await use(async (code, names) => {
      const bots = await joinBots(code, names);
      all.push(...bots);
      return bots;
    });
    await Promise.all(all.map((b) => b.leave()));
  },
  botHost: async ({}, use) => {
    const all: Bot[] = [];
    await use(async (name, settings) => {
      const bot = await Bot.create(name, settings);
      all.push(bot);
      return bot;
    });
    await Promise.all(all.map((b) => b.leave()));
  },
});

export { expect } from "./test";
