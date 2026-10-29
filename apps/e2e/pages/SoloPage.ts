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

  /** Après une erreur, la correction reste affichée jusqu'à « Suivant » (ou « Voir le bilan » à la fin). */
  get nextButton() {
    return this.page.getByRole("button", { name: new RegExp(`^(${t("solo.next")}|${t("solo.seeReport")})$`) });
  }

  /** Passe la correction d'une erreur, s'il y en a une à l'écran. */
  async skipReview() {
    // La correction s'affiche dans le même rendu que la case verrouillée : pas d'attente à faire.
    if (await this.nextButton.isVisible()) await this.nextButton.click();
  }

  async play(move: Move) {
    await this.skipReview();
    return answerRound(this.page, move, this.touch);
  }

  /** Joue ces manches, puis passe la dernière correction pour aller au bilan. */
  async playAll(moves: Move[]) {
    const played = [];
    for (const m of moves) played.push(await this.play(m));
    await this.skipReview();
    return played;
  }
}
