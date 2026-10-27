import { WEB_URL } from "../../env";
import { gameWithPlayers, resetTokenFor, seedGamesFor, userExists } from "../../fixtures/db";
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

  test("activer la dictée est gardé sur le compte", async ({ page, user: _connected }) => {
    await page.goto("/fr/profile/preferences");
    const voice = page.getByRole("button", { name: t("profile.inputVoice"), exact: true });
    const keyboard = page.getByRole("button", { name: t("profile.inputKeyboard"), exact: true });
    await expect(keyboard).toHaveAttribute("aria-pressed", "true");
    await voice.click();
    await expect(page.getByText(t("profile.inputSaved"))).toBeVisible();
    await page.reload();
    await expect(voice).toHaveAttribute("aria-pressed", "true");
  });

  test("changer de mot de passe demande l'ancien puis sert à la connexion suivante", async ({ page, user }) => {
    const auth = new AuthPages(page);
    const next = `${user.password}-neuf`;
    await page.goto("/fr/profile");
    await page.getByLabel(t("profile.passwordCurrent"), { exact: true }).fill("pas-le-bon-mot-de-passe");
    await page.getByLabel(t("profile.passwordNew"), { exact: true }).fill(next);
    await page.getByLabel(t("profile.passwordConfirm"), { exact: true }).fill(`${next}!`);
    await page.getByRole("button", { name: t("profile.passwordSave") }).click();
    await expect(page.getByText(t("profile.passwordMismatch"))).toBeVisible();

    await page.getByLabel(t("profile.passwordConfirm"), { exact: true }).fill(next);
    await page.getByRole("button", { name: t("profile.passwordSave") }).click();
    await expect(page.getByText(t("profile.passwordWrong"))).toBeVisible();

    await page.getByLabel(t("profile.passwordCurrent"), { exact: true }).fill(user.password);
    await page.getByLabel(t("profile.passwordNew"), { exact: true }).fill(next);
    await page.getByLabel(t("profile.passwordConfirm"), { exact: true }).fill(next);
    await page.getByRole("button", { name: t("profile.passwordSave") }).click();
    await expect(page.getByText(t("profile.passwordSaved"))).toBeVisible();

    await auth.logout();
    await auth.login(user.email, next);
    await expect(page).toHaveURL(/\/fr\/dashboard$/);
  });

  test("ajouter puis retirer une photo de profil", async ({ page, user: _connected }) => {
    await page.goto("/fr/profile");
    // PNG de 1 × 1 pixel : recadré et réduit par le navigateur avant l'envoi.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    // Le champ fichier est caché derrière le bouton « Ajouter une photo ».
    await page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText(t("profile.avatarSaved"))).toBeVisible();
    const headerAvatar = page.getByRole("navigation", { name: t("nav.main") }).locator("img.avatar");
    await expect(headerAvatar).toHaveAttribute("src", /^\/api\/avatar\/[^/?]+\?v=\d+$/);
    const res = await page.request.get((await headerAvatar.getAttribute("src"))!);
    expect(res.headers()["content-type"]).toMatch(/^image\/(webp|jpeg)$/);

    await page.getByRole("button", { name: t("profile.avatarRemove") }).click();
    await expect(page.getByText(t("profile.avatarRemoved"))).toBeVisible();
    await expect(headerAvatar).toHaveCount(0);
  });

  test("la photo de profil est vérifiée par le serveur", async ({ page, user: _connected }) => {
    // Requêtes avec la session du compte que la fixture a connecté.
    const request = page.request;
    // Une adresse d'image quelconque est refusée par l'API de Better Auth.
    const update = await request.post("/api/auth/update-user", { data: { image: "https://exemple.test/pixel.png" }, headers: { origin: WEB_URL } });
    expect(update.status()).toBe(400);
    expect(await update.json()).toMatchObject({ code: "INVALID_IMAGE" });
    // Un fichier qui n'est pas une image est refusé, quel que soit le type annoncé.
    const upload = await request.post("/api/avatar", { multipart: { file: { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("<svg/>") } } });
    expect(upload.status()).toBe(415);
    // Sans être ami, la photo d'un autre joueur reste invisible.
    const other = await request.get("/api/avatar/un-autre-joueur");
    expect(other.status()).toBe(404);
  });

  test("le pseudo est nettoyé et validé par le serveur, pas seulement par le formulaire", async ({ request }) => {
    const user = newUser();
    const empty = await request.post("/api/auth/sign-up/email", { data: { ...user, name: "  <> " } });
    expect(empty.status()).toBe(400);
    expect(await empty.json()).toMatchObject({ code: "INVALID_NAME" });

    const res = await request.post("/api/auth/sign-up/email", { data: { ...user, name: "  Zoé    <Lune>  qui a un pseudo bien trop long" } });
    expect(res.ok(), await res.text()).toBe(true);
    expect(((await res.json()) as { user: { name: string } }).user.name).toBe("Zoé Lune qui a un ps");

    // Requête avec cookie de session : Better Auth exige l'en-tête Origin (protection CSRF).
    const update = await request.post("/api/auth/update-user", { data: { name: "<<>>" }, headers: { origin: WEB_URL } });
    expect(update.status()).toBe(400);
  });

  test("l'inscription demande d'accepter les conditions d'utilisation", async ({ page }) => {
    const user = newUser();
    await page.goto("/fr/signup");
    await page.getByLabel(t("auth.name")).fill(user.name);
    await page.getByLabel(t("auth.email")).fill(user.email);
    await page.getByLabel(t("auth.password")).fill(user.password);
    await page.getByRole("button", { name: t("auth.signupBtn") }).click();
    await expect(page.getByRole("checkbox")).toHaveJSProperty("validity.valueMissing", true);
    await expect(page).toHaveURL(/\/fr\/signup$/);
    expect(await userExists(user.email)).toBe(false);
  });

  test("supprimer son compte demande le bon mot de passe puis efface tout", async ({ page, user }) => {
    const auth = new AuthPages(page);
    const games = await seedGamesFor(user.email);
    await page.goto("/fr/profile");
    await page.getByRole("button", { name: t("profile.deleteOpen") }).click();
    const password = page.getByLabel(t("profile.deletePassword"));
    await password.fill("pas-le-bon-mot-de-passe");
    await page.getByRole("button", { name: t("profile.deleteBtn") }).click();
    await expect(page.getByText(t("profile.deleteWrongPassword"))).toBeVisible();
    expect(await userExists(user.email)).toBe(true);

    await password.fill(user.password);
    await page.getByRole("button", { name: t("profile.deleteBtn") }).click();
    await page.waitForURL(/\/fr$/);
    await expect(auth.loginLink()).toBeVisible();
    expect(await userExists(user.email)).toBe(false);
    // Partie solo effacée ; partie en ligne gardée pour l'invité, sans le pseudo du compte supprimé.
    expect(await gameWithPlayers(games.soloId)).toBeNull();
    const online = await gameWithPlayers(games.onlineId);
    expect(online?.players.map((p) => [p.displayName, p.userId])).toEqual([["", null], ["Invité", null]]);

    await auth.login(user.email, user.password);
    await expect(page.getByText(t("auth.invalidCreds"))).toBeVisible();
  });
});
