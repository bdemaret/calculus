import { expect, type Locator, type Page } from "@playwright/test";
import { t } from "../fixtures/i18n";
import { answerBox, answerRound, type Move } from "./answer";

export type { Move };

/** Page « Jouer solo » : réglages, partie, rapport. */
export class SoloPage {
  readonly answer: Locator;
  readonly verdict: Locator;

  constructor(
    readonly page: Page,
    /** Sur téléphone, on répond avec le pavé intégré. */
    readonly touch = false,
  ) {
    this.answer = answerBox(page);
    this.verdict = page.getByTestId("report-verdict");
  }

  async goto() {
    await this.page.goto("/fr/solo");
    await expect(this.startButton).toBeVisible();
  }

  get startButton() {
    return this.page.getByRole("button", { name: t("solo.start") });
  }

  async start() {
    await this.startButton.click();
  }

  play(move: Move) {
    return answerRound(this.page, move, this.touch);
  }

  async playAll(moves: Move[]) {
    const played = [];
    for (const m of moves) played.push(await this.play(m));
    return played;
  }
}
