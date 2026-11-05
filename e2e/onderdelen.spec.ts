import { expect, test } from "@playwright/test";
import { ONDERDELEN } from "../src/onderdelen";

/**
 * Elk onderdeel van de app (src/onderdelen.ts) in een echte browser: het hoofdscherm opent
 * zonder fout en toont zijn kop. Dat vangt de meeste breuken: een route die weg is, een
 * servercode die een fout geeft, een query op een kolom die niet meer bestaat.
 *
 * Lokaal is er geen Access; de servercode neemt de vaste testgebruiker, dus inloggen hoeft
 * niet. Een nieuw onderdeel hoeft hier niets: een regel in src/onderdelen.ts is genoeg.
 * Deze test is van de template en komt met elke versie mee.
 */
for (const o of ONDERDELEN) {
  test(`${o.naam}: het hoofdscherm opent zonder fout`, async ({ page }) => {
    const fouten: string[] = [];
    page.on("pageerror", (e) => fouten.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") fouten.push(m.text());
    });

    await page.goto(o.pad);
    await expect(page.getByRole("heading", { level: 1, name: o.kop ?? o.naam })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(fouten, "fouten in de browser").toEqual([]);
  });
}
