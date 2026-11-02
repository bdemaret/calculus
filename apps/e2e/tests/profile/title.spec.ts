import { prisma } from "@calculus/db";
import { grantTitles } from "../../fixtures/db";
import { t } from "../../fixtures/i18n";
import { expect, test } from "../../fixtures/test";

test.describe("titre", () => {
  test("un compte neuf porte le titre par défaut, seul dans la liste", async ({ page, user }) => {
    await page.goto("/fr/profile");
    await expect(page.getByRole("heading", { name: user.name })).toBeVisible();
    const toggle = page.getByRole("button", { name: t("achievementsPage.titlesLabel") });
    await expect(toggle).toHaveText(t("titles.newcomer"));
    await toggle.click();
    await expect(page.getByRole("group", { name: t("achievementsPage.titlesLabel") }).getByRole("button")).toHaveCount(2);
    await expect(page.getByText(t("achievementsPage.titlesEmpty"))).toBeVisible();
  });

  test("choisir un titre possédé, le garder, et ne pas pouvoir en prendre un autre", async ({ page, user }) => {
    await grantTitles(user.email, ["regular", "polymath"]);
    await page.goto("/fr/profile");
    const toggle = page.getByRole("button", { name: t("achievementsPage.titlesLabel") });
    await toggle.click();
    const list = page.getByRole("group", { name: t("achievementsPage.titlesLabel") });
    await expect(list.getByRole("button")).toHaveCount(4);
    await list.getByRole("button", { name: t("titles.polymath") }).click();
    await expect(toggle).toHaveText(t("titles.polymath"));

    await page.reload();
    await expect(toggle).toHaveText(t("titles.polymath"));

    const refused = await page.request.patch("/api/profile/title", { data: { titleId: "terror" } });
    expect(refused.status()).toBe(403);
  });

  test("« Aucun » retire le titre, partout", async ({ page, user }) => {
    await page.goto("/fr/profile");
    const toggle = page.getByRole("button", { name: t("achievementsPage.titlesLabel") });
    await toggle.click();
    await page.getByRole("group", { name: t("achievementsPage.titlesLabel") }).getByRole("button", { name: t("achievementsPage.titlesNone") }).click();
    await expect(toggle).toHaveText(t("achievementsPage.titlesNone"));

    await page.reload();
    await expect(toggle).toHaveText(t("achievementsPage.titlesNone"));

    const { id } = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    await page.goto(`/fr/player/${id}`);
    await expect(page.getByRole("heading", { name: user.name })).toBeVisible();
    await expect(page.getByText(t("titles.newcomer"))).toHaveCount(0);
  });
});
