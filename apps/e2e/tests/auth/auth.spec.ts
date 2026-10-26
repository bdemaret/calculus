import { resetTokenFor } from "../../fixtures/db";
import { t } from "../../fixtures/i18n";
import { expect, newUser, signUp, test } from "../../fixtures/test";
import { AuthPages } from "../../pages/AuthPages";

test.describe("comptes", () => {
  test("inscription, déconnexion puis reconnexion", async ({ page }) => {
    const auth = new AuthPages(page);
    const user = newUser();
    await auth.signup(user);
    await expect(page).toHaveURL(/\/fr\/dashboard$/);
    await expect(page.getByRole("heading", { name: t("dashboard.hello", { name: user.name }) })).toBeVisible();
    await expect(page.getByRole("link", { name: user.name })).toBeVisible();

    await auth.logout();
    await expect(auth.loginLink()).toBeVisible();

    await auth.login(user.email, user.password);
    await expect(page).toHaveURL(/\/fr\/dashboard$/);
    await expect(page.getByRole("link", { name: user.name })).toBeVisible();
  });

  test("mauvais mot de passe", async ({ page, request }) => {
    const user = await signUp(request);
    const auth = new AuthPages(page);
    await auth.login(user.email, "pas-le-bon-mot-de-passe");
    await expect(page.getByText(t("auth.invalidCreds"))).toBeVisible();
    await expect(page).toHaveURL(/\/fr\/login$/);
  });

  test("e-mail déjà utilisé", async ({ page, request }) => {
    const user = await signUp(request);
    const auth = new AuthPages(page);
    await auth.signup({ ...newUser(), email: user.email });
    await expect(page.getByText(t("auth.emailTaken"))).toBeVisible();
  });

  test("mot de passe oublié puis réinitialisé", async ({ page, request }) => {
    const user = await signUp(request);
    const auth = new AuthPages(page);
    await page.goto("/fr/login");
    await page.getByRole("link", { name: t("auth.forgot") }).click();
    await expect(page.getByRole("heading", { name: t("auth.forgotTitle") })).toBeVisible();
    await page.getByLabel(t("auth.email")).fill(user.email);
    await page.getByRole("button", { name: t("auth.sendLink") }).click();
    await expect(page.getByText(t("auth.linkSent"))).toBeVisible();

    const token = await resetTokenFor(user.email);
    await page.goto(`/fr/reset-password?token=${encodeURIComponent(token)}`);
    const newPassword = `${user.password}-neuf`;
    await page.getByLabel(t("auth.newPassword")).fill(newPassword);
    await page.getByRole("button", { name: t("auth.resetBtn") }).click();
    await expect(page.getByText(t("auth.resetDone"))).toBeVisible();

    await auth.login(user.email, user.password);
    await expect(page.getByText(t("auth.invalidCreds"))).toBeVisible();
    await auth.login(user.email, newPassword);
    await expect(page).toHaveURL(/\/fr\/dashboard$/);
  });

  test("un lien de réinitialisation invalide est refusé", async ({ page }) => {
    await page.goto("/fr/reset-password?token=jeton-bidon");
    await page.getByLabel(t("auth.newPassword")).fill("un-mot-de-passe-long");
    await page.getByRole("button", { name: t("auth.resetBtn") }).click();
    await expect(page.getByText(t("auth.invalidToken"))).toBeVisible();
  });

  test("le mot de passe oublié ne révèle pas si l'adresse existe", async ({ page }) => {
    await page.goto("/fr/forgot-password");
    await page.getByLabel(t("auth.email")).fill(newUser().email);
    await page.getByRole("button", { name: t("auth.sendLink") }).click();
    await expect(page.getByText(t("auth.linkSent"))).toBeVisible();
  });
});

test.describe("pages protégées", () => {
  for (const path of ["/fr/dashboard", "/fr/profile"]) {
    test(`${path} renvoie vers la connexion sans compte`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/fr\/login$/);
    });
  }

  test("la page de connexion renvoie vers le tableau de bord une fois connecté", async ({ page, user }) => {
    await page.goto("/fr/login");
    await expect(page).toHaveURL(/\/fr\/dashboard$/);
    await expect(page.getByRole("heading", { name: t("dashboard.hello", { name: user.name }) })).toBeVisible();
  });
});

test.describe("profil", () => {
  test("changer de pseudo", async ({ page, user }) => {
    await page.goto("/fr/profile");
    await expect(page.getByText(user.email)).toBeVisible();
    const name = page.getByLabel(t("profile.name"));
    await expect(name).toHaveValue(user.name);
    await name.fill("Nouveau nom");
    await page.getByRole("button", { name: t("profile.save") }).click();
    await expect(page.getByText(t("profile.saved"))).toBeVisible();
    await expect(page.getByRole("navigation", { name: t("nav.main") }).getByRole("link", { name: "Nouveau nom" })).toBeVisible();
    await page.reload();
    await expect(name).toHaveValue("Nouveau nom");
  });

  test("activer la dictée est gardé sur le compte", async ({ page, user }) => {
    await page.goto("/fr/profile");
    await expect(page.getByText(user.email)).toBeVisible();
    const voice = page.getByRole("button", { name: t("profile.inputVoice"), exact: true });
    const keyboard = page.getByRole("button", { name: t("profile.inputKeyboard"), exact: true });
    await expect(keyboard).toHaveAttribute("aria-pressed", "true");
    await voice.click();
    await expect(page.getByText(t("profile.inputSaved"))).toBeVisible();
    await page.reload();
    await expect(voice).toHaveAttribute("aria-pressed", "true");
  });
});
