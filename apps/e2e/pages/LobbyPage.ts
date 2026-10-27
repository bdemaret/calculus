import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { GameSettings } from "@calculus/game-core";
import { WEB_URL } from "../env";
import { t } from "../fixtures/i18n";
import { answerRound, type Move } from "./answer";

/** Réglages en ligne courts par défaut : 5 manches faciles, pour des parties de quelques secondes. */
export function onlineSettings(settings: Partial<GameSettings> = {}): GameSettings {
  return {
    game: "standard",
    missingKind: "number",
    buildTime: 15,
    powerMax: 2,
    difficulty: 1,
    mode: "speed-race",
    operations: ["add"],
    parentheses: false,
    rounds: 5,
    timePerQuestion: 10,
    turnStyle: "simultaneous",
    ...settings,
  };
}

/** Un joueur dans son propre navigateur : page « Jouer en ligne », lobby, partie et rapport. */
export class LobbyPage {
  readonly slots: Locator;
  readonly chips: Locator;
  readonly result: Locator;
  readonly verdict: Locator;

  constructor(readonly page: Page) {
    this.slots = page.getByTestId("lobby-slots");
    this.chips = page.getByTestId("player-chips");
    this.result = page.locator(".result-line");
    this.verdict = page.getByTestId("report-verdict");
  }

  /** Ouvre un nouveau navigateur (contexte isolé) pour un joueur invité. */
  static async guest(browser: Browser, name: string, settings?: Partial<GameSettings>): Promise<LobbyPage> {
    const context: BrowserContext = await browser.newContext({ baseURL: WEB_URL, locale: "fr-FR" });
    const page = await context.newPage();
    const lobby = new LobbyPage(page);
    await lobby.preset(name, settings);
    return lobby;
  }

  /** Pseudo invité et réglages du prochain lobby créé, posés avant le chargement (clés de `lib/storage`). */
  async preset(name: string | null, settings?: Partial<GameSettings>) {
    await this.page.addInitScript(
      ([n, s]) => {
        if (n) localStorage.setItem("calculus:name", JSON.stringify(n));
        localStorage.setItem("calculus:online", JSON.stringify(s));
      },
      [name, onlineSettings(settings)] as const,
    );
  }

  /** Crée un lobby et renvoie son code. */
  async create(): Promise<string> {
    await this.page.goto("/fr/online");
    await this.page.getByRole("button", { name: t("online.create") }).click();
    await this.page.waitForURL(/\/fr\/lobby\/[A-Z0-9]{6}$/);
    await expect(this.slots).toBeVisible();
    return this.page.url().split("/").pop() as string;
  }

  /** Rejoint par le formulaire « Rejoindre avec un code ». */
  async joinWithCode(code: string) {
    await this.page.goto("/fr/online");
    await this.page.getByLabel(t("online.joinCode")).fill(code);
    await this.page.getByRole("button", { name: t("online.join") }).click();
    await this.page.waitForURL(new RegExp(`/fr/lobby/${code}$`));
    await expect(this.slots).toBeVisible();
  }

  /** Rejoint par le lien du lobby. */
  async open(code: string) {
    await this.page.goto(`/fr/lobby/${code}`);
  }

  playersHeading(count: number) {
    return this.page.getByRole("heading", { name: t("lobby.players", { count, max: 12 }) });
  }

  slot(name: string) {
    return this.slots.locator(".slot.filled").filter({ hasText: name });
  }

  button(key: string) {
    return this.page.getByRole("button", { name: t(key), exact: true });
  }

  async start() {
    await this.button("lobby.start").click();
  }

  play(move: Move) {
    return answerRound(this.page, move);
  }

  /** Score affiché sur la pastille d'un joueur pendant la partie. */
  chipScore(name: string) {
    return this.chips.locator(".chip").filter({ hasText: name }).locator(".pts");
  }

  /** Ligne du classement final pour un joueur. */
  rankingRow(name: string) {
    return this.page.locator("ol.ranking li").filter({ hasText: name });
  }

  async close() {
    await this.page.context().close();
  }
}
