import type { Page } from "@playwright/test";
import { t } from "../fixtures/i18n";
import type { TestUser } from "../fixtures/test";

/** Formulaires de connexion, d'inscription et de mot de passe oublié. */
export class AuthPages {
  constructor(readonly page: Page) {}

  async signup(user: TestUser) {
    await this.page.goto("/fr/signup");
    await this.page.getByLabel(t("auth.name")).fill(user.name);
    await this.page.getByLabel(t("auth.email")).fill(user.email);
    await this.page.getByLabel(t("auth.password")).fill(user.password);
    // Case « J'accepte les conditions d'utilisation » : son libellé contient des liens.
    await this.page.getByRole("checkbox").check();
    await this.page.getByRole("button", { name: t("auth.signupBtn") }).click();
  }

  async login(email: string, password: string) {
    await this.page.goto("/fr/login");
    await this.page.getByLabel(t("auth.email")).fill(email);
    await this.page.getByLabel(t("auth.password")).fill(password);
    await this.page.getByRole("button", { name: t("auth.loginBtn") }).click();
  }

  async logout() {
    await this.page.goto("/fr/profile");
    await this.page.getByRole("button", { name: t("profile.logout") }).click();
    await this.page.waitForURL(/\/fr$/);
  }

  /** Lien de la barre de navigation vers « Se connecter » (visible seulement déconnecté). */
  loginLink() {
    return this.page.getByRole("navigation", { name: t("nav.main") }).getByRole("link", { name: t("nav.login") });
  }
}
