import { expect, type Locator, type Page } from "@playwright/test";
import { t } from "../fixtures/i18n";
import { answerBox, answerRound, type Move } from "./answer";

/** Page du calcul du jour : les manches se jouent comme en solo, mais c'est le serveur qui les pose. */
export class DailyPage {
  readonly score: Locator;

  constructor(readonly page: Page) {
    this.score = page.getByTestId("daily-score");
  }

  async goto() {
    await this.page.goto("/fr/daily");
    await expect(this.startButton.or(this.score).or(answerBox(this.page))).toBeVisible();
  }

  get startButton() {
    return this.page.getByRole("button", { name: t("daily.start") });
  }

  get nextButton() {
    return this.page.getByRole("button", { name: new RegExp(`^(${t("solo.next")}|${t("solo.seeReport")})$`) });
  }

  /** Joue les manches données, en passant les corrections. */
  async play(moves: Move[]) {
    await this.startButton.click();
    for (const move of moves) {
      await answerRound(this.page, move);
      await expect(this.nextButton.or(answerBox(this.page)).or(this.score).first()).toBeVisible();
      if (move === "wrong") await this.nextButton.click();
    }
    await expect(this.score).toBeVisible({ timeout: 10_000 });
  }
}
