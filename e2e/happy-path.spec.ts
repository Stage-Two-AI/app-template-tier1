import { expect, test } from "@playwright/test";

/**
 * De happy path: de route door de app waarop niets misgaat.
 *
 * Waarom juist deze test, en waarom als eerste: breekt de happy path, dan is de app
 * waardeloos. Hij raakt in één keer de hele keten (build, servercode, database, scherm).
 * Lokaal is er geen Access; de servercode neemt dan de vaste testgebruiker.
 *
 * Uitbreiden doe je reactief: elke keer dat er in productie iets stukgaat, komt daar een
 * test bij die precies dát geval afdekt.
 */
test("item toevoegen en terugzien, ook na verversen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mijn lijst" })).toBeVisible();
  await expect(page.getByText("lokaal@voorbeeld.nl")).toBeVisible();

  const omschrijving = `Testitem ${Date.now()}`;
  await page.getByLabel("Nieuw item").fill(omschrijving);
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: omschrijving })).toBeVisible();

  // Na verversen staat het er nog: het is echt in de database opgeslagen.
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: omschrijving })).toBeVisible();
});

test("een lege omschrijving geeft een nette melding", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByRole("alert")).toHaveText("Geef een omschrijving op.");
});
