# Verder werken aan deze app

Dit is de enige route waarlangs werk in deze app terechtkomt. Hij geldt voor iedereen,
ook voor een kleine tekstwijziging, want de route is precies wat het veilig maakt om
zonder programmeerkennis te bouwen.

## Stap 1: Weet wat je gaat maken

Vraag door tot je één zin kunt opschrijven die begint met "na deze wijziging kan de
gebruiker …". Lukt dat niet, dan is het verzoek nog niet scherp genoeg en is dit het
moment om het te vragen, niet halverwege.

Is het verzoek groter dan één zin? Knip het op. **Eén pull request = één onderwerp.**
Grote PR's zijn niet te beoordelen en er verdwijnt van alles ongemerkt in.

Komt er een tabel of kolom bij en wordt die in dezelfde wijziging ook gebruikt? Knip dan
in tweeën: eerst de migratie, dan het gebruik. De preview van een pull request ziet een
nieuwe migratie pas na de merge (zie `docs/routes/databasewijziging.md`).

## Stap 2: Begin op een eigen branch

```bash
git checkout main
git pull
git checkout -b <korte-omschrijving>
```

Nooit rechtstreeks op `main` werken. Dat kan ook niet: de repo weigert het.

## Stap 3: Bouw de wijziging

Houd je aan de afspraken uit `AGENTS.md`. De belangrijkste, omdat ze het vaakst
misgaan:

- Geen `any`, geen `@ts-ignore`, geen uitroepteken om een typefout weg te drukken.
  Los de echte fout op.
- Alles wat van buiten komt, valideer je met Zod, ook in de servercode: de browser is geen
  beveiliging. Leg de regels één keer vast in `src/lib/validation.ts` en gebruik ze aan
  beide kanten (zie `worker/routes/items.ts`).
- Een nieuwe route in de servercode komt **onder** de inlog-middleware in
  `worker/index.ts`, zodat hij alleen werkt voor iemand die is ingelogd. Mag een gebruiker
  alleen zijn eigen gegevens zien, filter dan op `c.var.gebruiker.email`.
- Moet een pad publiek worden (een galerij, een contactformulier, een apparaat dat iets
  aanroept)? Dan op twee plekken: de route **boven** de inlog-middleware, en het pad onder
  `publiek` bij deze app in `toegang.json` van de beheer-repo (`<org>/stagetwo-beheer-tier1`), met
  een eigen pull request daar die je zelf mag mergen. Noem het in de PR-tekst.
- Een machine die de servercode aanroept, krijgt een apparaatsleutel:
  `pnpm apparaat:nieuw <naam>`, en in de route `welkApparaat(request, ["<naam>"])` uit
  `worker/lib/apparaat.ts`. De sleutel verschijnt één keer; die zet de gebruiker op het
  apparaat, nooit in git of een chat.
- Geheime sleutels horen nooit in de schermen. Alleen de Sentry DSN mag in een
  `VITE_`-variabele; die is expres publiek. Een sleutel van een ander systeem (Stripe,
  Resend, een AI-dienst) leest de servercode uit `c.env`; zet hem als optioneel in
  `worker/env.ts` en geef een duidelijke fout als hij ontbreekt. Het geheim zelf zet de
  owner van de organisatie, niet jij: zeg de gebruiker dat.
- Iets bewaren gaat in D1 (gegevens) of R2 (bestanden). Andere opslag houdt
  `guard:cloudflare` tegen.

Raakt je wijziging de database (een tabel, kolom of index)? Lees dan nu
`docs/routes/databasewijziging.md` in zijn geheel en volg die stappen erbij.

Wil je tussendoor zien wat je gemaakt hebt? In de Claude-app start de preview vanzelf
(`.claude/launch.json`), met een lokale database en zonder inlog; gebruik die ook om je
eigen werk te controleren. Met een andere assistent: `docs/routes/lokaal-kijken.md`. Het is
een hulpmiddel tijdens het bouwen, niet de oplevering: die volgt hieronder.

## Stap 4: Schrijf de test erbij

Niet achteraf, en niet "later". Bij deze werkwijze zijn de tests de enige verplichte
beoordelaar van je werk, dus wat de tests niet dekken, dekt niemand.

- **Nieuwe functionaliteit?** Leg het nieuwe gedrag vast in een test.
- **Bug opgelost?** Schrijf eerst een test die de bug reproduceert, en repareer dan
  tot hij groen is. Anders komt dezelfde bug over drie maanden terug.
- **Servercode gewijzigd?** Een test naast de route, in `worker/`, die in Node draait met
  de nagebootste D1 uit `tests/helpers/d1.ts`. Het bestand begint met
  `// @vitest-environment node`; het patroon staat in `worker/index.test.ts`. Test ook
  wat er níet mag: zonder gebruiker een 401, en gebruiker A ziet de gegevens van B niet.
- **Nieuw scherm?** Een test in `src/` naast het scherm, of breid de end-to-end test in
  `e2e/` uit als het de belangrijkste route raakt.

De CI blokkeert een PR die productiecode wijzigt (in `src/`, `worker/` of `migrations/`)
zonder één enkele test aan te raken.

## Stap 5: Draai de poort lokaal

```bash
pnpm check
```

Dat is typecontrole, lint, unittests en de guards in één keer. Alles groen? Door. Rood?
Repareren, niet omzeilen.

## Stap 6: Open een concept-PR en laat de gebruiker meekijken

De eerste keer dat er iets te zien is:

```bash
git push -u origin <branch>
gh pr create --draft
```

Altijd als concept (draft). Zolang de PR een concept is, draait bij elke push alleen de
snelle check `Code`, en de workflow `Preview uitrollen` zet de nieuwe versie online. De zware
check `Database en end-to-end` wacht tot stap 7. Zo kost een tussenstap minuten in plaats van
een volle poort, en ziet de gebruiker geen rode tussenstanden.

Vul het PR-formulier volledig in. De regel `Cloudflare-preview:` is niet optioneel: die
link is de enige geldige manier om werk te laten zien. Wacht tot `Preview uitrollen` de links
als reactie in de PR heeft gezet en plak de PR-link erin. Die reactie noemt er twee:

- **de preview van deze PR** (`pr-<nummer>-...`): precies deze wijziging;
- **het vaste adres van de app** (`actueel-...`): altijd de laatst gepushte PR. Dit adres
  verandert nooit. Geef het de gebruiker één keer; hij kan het open laten staan, ook op een
  tablet, en hoeft na een push alleen te verversen.

**Kijk zelf eerst.** Open de preview in de browser in de zijbalk van de Claude-app (of, als
die er niet is, in Chrome via Claude in Chrome) en loop de wijziging na voordat je de
gebruiker vraagt te kijken. Zie je het inlogscherm van Cloudflare Access, vraag de gebruiker
dan één keer in te loggen met zijn werkaccount, in dat paneel; de browser onthoudt dat voor
alle apps. Lukt geen van beide, geef dan de link en zeg dat je hem niet zelf kon openen.

De preview draait achter dezelfde login als productie, met een eigen testdatabase en eigen
testbestanden. Twee dingen zie je daar pas na de merge: nieuwe migraties uit deze PR, en
wijzigingen aan `wrangler.jsonc`. Zeg dat erbij als de gebruiker ze in de preview wil proberen.

**Push per afgerond stukje, niet per kleine wijziging.** Kleine stappen bekijk je in de
preview van de Claude-app zelf (die ververst direct); elke push kost een run in GitHub.

Zet nooit een dev-server op localhost op om iets te tonen. Die kan de klant niet
openen en hij bewijst niet dat de gebouwde versie werkt. Lokaal kijken voor jezelf
(`docs/routes/lokaal-kijken.md`) is iets anders dan werk laten zien.

## Stap 7: Op klaar zetten, wachten en repareren

Zegt de gebruiker dat het goed is ("prima", "zo laten", "zet maar live"), dan:

```bash
pnpm test:e2e      # de hele keten in een echte browser, lokaal, geen Docker nodig
gh pr ready        # nu draait de volledige poort, ook Database en end-to-end
gh pr checks --watch
```

`pnpm test:e2e` bouwt de app, zet een lokale database klaar met alle migraties en klikt de
belangrijkste route door. De eerste keer vraagt Playwright misschien om een browser:
`pnpm exec playwright install chromium`.

Wacht zelf tot alle checks klaar zijn. Wordt er een rood, lees dan de melding
(`gh run view <run-id> --log-failed`), repareer het, push, en wacht opnieuw. Vraag de
gebruiker nooit wat hij met een rode check moet; dat is jouw werk. Alleen als het echt niet
lukt, of als een melding om een besluit vraagt (zoals `guard:migrations` of
`guard:secrets`), leg je het hem uit, met jouw advies.

## Stap 8: Klaar is klaar

Een taak is klaar als, en alleen als:

1. de pull request open staat en geen concept meer is,
2. **alle** checks groen zijn, en
3. de Cloudflare-preview-link in de beschrijving staat en werkt.

Niet eerder. Meld niet "het is af" bij een rode check, een concept-PR of een ontbrekende
preview; meld dan wat er nog mist.

## Na de merge

Er is geen aparte stap om live te zetten: de workflow `Uitrollen` doet het bij de merge,
in deze volgorde: migraties op de testdatabase, migraties op productie, dan de nieuwe code.
Wil je zien of het gelukt is:

```bash
gh run watch "$(gh run list --workflow uitrollen.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId')"
```

Faalt een migratie, dan stopt de uitrol en blijft de vorige versie draaien. Repareren gaat
met een nieuwe pull request, nooit met de hand bij Cloudflare.

Hoorde er een publiek pad of een nieuwe persoon bij, kijk dan of de pull request op
`toegang.json` in de beheer-repo ook gemerged is. Hoorde er een sleutel van een ander
systeem bij, dan werkt die functie pas als de owner het geheim heeft gezet.

## Als een check rood staat

| Check | Wat het betekent |
|---|---|
| `typecheck` | de code klopt niet met zichzelf. Er zijn twee delen: de schermen (`tsconfig.json`) en de servercode (`tsconfig.worker.json`) |
| `lint` | opmaak of stijl. `pnpm lint:fix` lost het meeste vanzelf op |
| `test` | gedrag is stuk, of de test klopt niet meer. Kijk eerst welke van de twee |
| `guard:tests` | je wijzigde code zonder test. Voeg er een toe |
| `guard:secrets` | er staat mogelijk een sleutel in de code of in de bundel. **Altijd zelf naar kijken**, dit is de gevaarlijkste |
| `guard:escapes` | er is een typefout weggemoffeld (`any`, `@ts-ignore`, `as unknown as`). Los de echte fout op |
| `guard:migrations` | je migratie kan data vernietigen; lees de melding en bevestig bewust |
| `guard:template` | je wijzigde een bestand van de gedeelde template. Draai het terug en meld het bij Stage Two; wil je de nieuwste versie van de template, dan is dat `/stagetwo-tier1:updaten` |
| `guard:cloudflare` | `wrangler.jsonc` houdt zich niet aan de afspraken: andere opslag dan D1 en R2, geen eigen D1 en R2 voor de preview, een tweede adres naast het adres achter Access, of `OMGEVING=lokaal`. De melding zegt welke |
| Database en end-to-end | de belangrijkste route werkt niet in de gebouwde app, of een migratie faalt op een lege database. Draai `pnpm test:e2e` en kijk wat er misgaat. Bij een concept-PR staat deze check op overgeslagen: dat is de bedoeling, hij draait bij `gh pr ready` |

**Een regel in de PR-tekst toegevoegd** (`Geen tests nodig: ...`, `Bevestigd: ...`) terwijl
de pull request al open staat? Een aangepaste PR-tekst start de controles niet vanzelf opnieuw,
zodat de previewlink plakken of een vinkje zetten geen nieuwe run kost. Start de rode job
daarna zelf opnieuw: `gh run rerun <run-id> --failed`.

Een rode check omzeilen door hem uit te zetten is nooit het antwoord. De check is
er niet om jou te hinderen, maar omdat er verder niemand meekijkt.
