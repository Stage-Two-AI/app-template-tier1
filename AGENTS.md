# <projectnaam>

<!-- Vervang <projectnaam> en de regel hieronder bij het opzetten van een project.
     Alles boven de markering hoort bij dít project en wordt bij /stagetwo-tier1:updaten
     nooit overschreven. -->

<!-- Wat deze app doet, in één zin, vanuit de gebruiker geschreven. -->

<!-- Welke paden zijn publiek (staan ook in toegang.json van de beheer-repo)? Welke
     apparaten roepen de servercode aan? Noem ze hier, zodat niemand ze vergeet. -->

<!-- stack:begin -->
<!-- Alles hieronder komt uit de app-template en wordt bijgewerkt met
     /stagetwo-tier1:updaten, als pull request. Wijzig het niet hier; meld het bij Stage Two. -->

Dit bestand geldt voor **elke** agent die in deze repo werkt: Claude Code, Codex, Cursor,
Copilot of een mens zonder agent. Er is geen tweede set afspraken ergens anders.

## Klaar is

Een taak is klaar als: er een pull request open staat die geen concept (draft) meer is,
**álle** checks groen zijn, en de Cloudflare-preview-link in de PR staat (de workflow
`Preview uitrollen` zet hem er als reactie bij). Niet eerder. Staat er een check rood, dan
repareer je hem zelf en wacht je opnieuw; meld pas daarna "het is af", of meld wat er nog
mist als het echt niet lukt.

Het ritme (zie `docs/routes/verder-werken.md`): een PR begint als concept, waarop alleen de
snelle checks draaien en de preview wordt bijgewerkt; de gebruiker kijkt mee op het vaste
adres van de app (`actueel-...`). Is de gebruiker tevreden, dan zet je hem op klaar
(`gh pr ready`), wacht je op alle checks (`gh pr checks --watch`) en repareer je wat rood is.

## Stack

Tier 1: één Cloudflare Worker per app.

| Deel | Wat | Waar |
|---|---|---|
| Schermen | Vite + React + TypeScript (strict), Tailwind + shadcn/ui, React Router, Zod | `src/` |
| Servercode | Hono, alles onder `/api` | `worker/` |
| Database | Cloudflare D1 (SQLite) | `migrations/` |
| Bestanden | Cloudflare R2 | binding `BESTANDEN` |
| Geplande taken | Cloudflare-cron | `triggers.crons` in `wrangler.jsonc`, `scheduled` in `worker/index.ts` |
| Deur | Cloudflare Access, plus de controle in `worker/lib/access.ts` | `toegang.json` in de beheer-repo |
| Fouten | Sentry (schermen en servercode) | `src/lib/fouten.ts`, `worker/lib/fouten.ts` |

Achtergrond en het waarom: `docs/WERKWIJZE.md`.

## Commando's

| Commando | Wat het doet |
|---|---|
| `pnpm check` | typecontrole, lint, unittests en guards in één keer |
| `pnpm build` | productiebuild (schermen en servercode) |
| `pnpm test` | unittests: schermen in een nagebootste browser, servercode in Node met een nagebootste D1 |
| `pnpm test:e2e` | end-to-end test in een echte browser, tegen de gebouwde app met een lokale D1 |
| `pnpm db:lokaal` | alle migraties op de lokale D1 (in `.wrangler/`) |
| `pnpm data:test` | de kopie van de echte gegevens van afgelopen nacht in de lokale D1 en R2 (via `gh`, uit de beheer-repo) |
| `pnpm apparaat:nieuw <naam>` | een machine een eigen sleutel geven (zie hieronder) |

## Waar wat staat

```
src/components/ui/     losse bouwblokken (shadcn/ui, staan in deze repo, mag je aanpassen)
src/features/          schermen, per onderwerp
src/lib/               omgeving, validatie, praten met /api, hulpjes
worker/index.ts        de servercode: routes onder /api, en de geplande taken
worker/routes/         routes per onderwerp
worker/lib/            de controle van de deur, apparaatsleutels, de vorm van de database, foutmelding,
                       bestanden lezen (bestanden.ts) en de ontvangers van mail (mail.ts)
worker/apparaten.json  vingerafdrukken van de apparaatsleutels (geen geheimen)
migrations/            elke databasewijziging, in volgorde
tests/helpers/         de nagebootste D1 en Sentry voor de tests
e2e/                   end-to-end tests
public/                manifest en icoontjes: de app is installeerbaar op telefoon en computer
scripts/               de guards uit de kwaliteitspoort, de preview en `pnpm data:test`
scripts/lokaal-rol.sql de rol van de lokale testgebruiker (van dit project)
docs/routes/           de vaste routes, stap voor stap (zie Werkwijzen)
```

## Regels

- **Kijken mag lokaal, opleveren gaat via de Cloudflare-preview van de PR.** In de
  Claude-app start de preview (`.claude/launch.json`, `scripts/preview.mjs`) de app op de
  computer van de gebruiker, zonder inlog, als `lokaal@voorbeeld.nl` en met een kopie van de
  echte gegevens van afgelopen nacht; gebruik die eerst om je werk te controleren en om de
  gebruiker te laten meekijken. De Cloudflare-preview is het laatste nakijken. Zet geen dev-server in een
  terminal op, en geef nooit een `localhost`-adres als resultaat: `pnpm dev` weigert om die
  reden, het is geen storing. Andere assistenten volgen `docs/routes/lokaal-kijken.md`.
- **Geen `any`, geen `@ts-ignore`, geen `as unknown as`, geen non-null `!`.** Los de echte
  typefout op. Een groene build met verstopte fouten is erger dan een rode.
- **Invoer van buiten** (formulieren, webhooks, API's) valideer je met Zod, in de
  servercode, ook als het formulier het al doet: de browser is geen beveiliging. Leg de
  regels één keer vast in `src/lib/validation.ts` en gebruik ze aan beide kanten.
- **De deur staat voor alles.** Cloudflare Access laat alleen mensen op de lijst binnen, en
  `worker/index.ts` controleert het bewijs van Access nog een keer: elke route ná de
  inlog-middleware weigert een verzoek zonder geldige gebruiker. Zet nooit een route vóór
  die middleware zonder dat de gebruiker dat pad publiek wil hebben.
- **Een pad publiek maken** gaat op twee plekken: de route vóór de inlog-middleware in
  `worker/index.ts`, en het pad onder `publiek` bij deze app in `toegang.json` van de
  beheer-repo (een pull request daar; de bouwer mag die zelf mergen). Noem het in de PR.
- **Een machine die de servercode aanroept** (server, Pi, script) logt niet in als mens. Hij
  krijgt een apparaatsleutel: `pnpm apparaat:nieuw <naam>` zet de vingerafdruk in
  `worker/apparaten.json` en toont de sleutel één keer. De route staat publiek (zie
  hierboven) en controleert de sleutel met `welkApparaat(request, ["<naam>"])` uit
  `worker/lib/apparaat.ts`, altijd met de namen van de apparaten die déze route mogen
  gebruiken. Zet de sleutel zelf nooit in git of een chat; de gebruiker zet hem op het
  apparaat.
- **Een sleutel van een ander systeem** (Stripe, Resend, een AI-dienst) is een geheim van
  de Worker. Dat zet de owner, niet de bouwer: het is een architectuurwijziging. Lees hem
  in de servercode uit `c.env`, zet hem als optioneel in `worker/env.ts`, geef een duidelijke
  fout als hij ontbreekt, en zeg de gebruiker dat de owner hem moet zetten. Zet geen
  geheim in een `VITE_`-variabele: die zitten in de bundel die iedereen downloadt.
- **Lokaal staan echte gegevens.** Kopieer ze nooit naar een chat, issue, test of bestand in
  git; verzin testgegevens zelf. De lokale testgebruiker krijgt zijn rol via
  `scripts/lokaal-rol.sql`, nooit via een uitzondering in de servercode.
- **Mail gaat altijd door `bepaalOntvangers`** uit `worker/lib/mail.ts`, vóór de aanroep
  van de maildienst. Buiten productie stuurt die alles naar `vars.TESTMAIL_ADRES` in
  `wrangler.jsonc`, of niets. Stuur nooit mail om die functie heen.
- **Bestanden lees je met `leesBestand`** uit `worker/lib/bestanden.ts`, niet rechtstreeks
  met `c.env.BESTANDEN.get`. Lokaal haalt die een ontbrekend bestand op uit de testbestanden.
- **Fouten in productie** lees je eerst in Sentry, via de Sentry-koppeling in claude.ai.
- **Databasewijzigingen altijd als migratie** in `migrations/`, met het volgende nummer.
  Lees eerst `docs/routes/databasewijziging.md`. Een migratie die al in main staat, pas je
  nooit meer aan: schrijf een nieuw bestand erbij.
- **Migraties zijn aanvullend.** Voeg een kolom toe in de ene PR en gebruik hem in de
  volgende; gooi een kolom pas weg als niets hem meer aanroept.
- **Opslag alleen in D1 en R2.** Geen KV, Durable Objects, queues of andere opslag van
  Cloudflare, en geen database van buiten. `guard:cloudflare` laat alleen de afgesproken
  sleutels in `wrangler.jsonc` door.
- **De preview heeft een eigen database en eigen bestanden** (`env.preview` in
  `wrangler.jsonc`). Wijs die nooit naar die van productie; `guard:cloudflare` houdt dat
  tegen, en de uitrol van een preview gebruikt altijd de config van main.
- **De app heeft één adres, en dat staat achter Access.** Normaal is dat het eigen domein
  (`routes` met `custom_domain: true`, `workers_dev: false`), eventueel met `www.<domein>` als
  tweede route; de app stuurt www dan zelf door. Alleen zolang er nog geen
  domein is, mag de tijdelijke stand: geen `routes` en `workers_dev: true`. Zet die stand
  niet op eigen houtje aan of uit; `docs/WERKWIJZE.md` zegt wanneer hij mag.
- **Wie code wijzigt, wijzigt ook een test.** Bugfix? Eerst een test die de bug
  reproduceert, dan de reparatie. Servercode test je in Node met `tests/helpers/d1.ts`
  (bestand begint met `// @vitest-environment node`).
- **Eén PR = één onderwerp.** Beschrijf wat je gewijzigd hebt en waarom.
- **Pushen naar `main` kan niet en hoeft niet:** uitrollen gebeurt door te mergen.
- **Niet met de hand uitrollen of migreren** (`wrangler deploy`, `wrangler login`,
  `wrangler d1 migrations apply --remote`, `wrangler secret put`). Dat doet GitHub Actions
  bij een merge, of de owner; op deze computer hoort geen Cloudflare-sleutel.

## Werkwijzen

Voor de vaste routes staat een stappenplan in `docs/routes/`. Lees het bestand **vóórdat**
je begint en loop de stappen in volgorde af, in plaats van te improviseren:

- `docs/routes/verder-werken.md`: iets toevoegen, wijzigen of repareren aan deze app. Dit is
  de route voor vrijwel elk verzoek, ook een kleinigheid.
- `docs/routes/databasewijziging.md`: een tabel of kolom erbij of anders. Hoort bij
  verder-werken: lees hem zodra een wijziging de database raakt.
- `docs/routes/lokaal-kijken.md`: de app op je eigen computer zien terwijl je bouwt. In de
  Claude-app gaat dat vanzelf via de preview; deze route is voor andere assistenten en voor
  wie het met de hand doet.

Een compleet nieuwe applicatie begin je niet vanuit deze map: die krijgt een eigen repo, via
`/stagetwo-tier1:nieuwe-app` in een lege map.

In Claude Code geeft de Stage Two-plugin vier commando's: `/stagetwo-tier1:installatie` (een
nieuwe computer klaarzetten), `/stagetwo-tier1:nieuwe-app`, `/stagetwo-tier1:verder-werken`
(verwijst naar de routes hierboven, er is maar één tekst) en `/stagetwo-tier1:updaten`
(plugin, computer en apps bijwerken, elke wijziging aan een app als pull request).

## Wat je niet aanpast

`.github/workflows/`, `.claude/`, `scripts/` (behalve `scripts/lokaal-rol.sql`),
`worker/lib/access.ts`, `worker/lib/apparaat.ts`, `worker/lib/bestanden.ts`, `worker/lib/db.ts`,
`worker/lib/fouten.ts`, `worker/lib/mail.ts`, `tests/helpers/`, de tests van de template in
`tests/unit/`, `docs/WERKWIJZE.md`, `docs/routes/` en dit bestand onder de markering komen uit
de gedeelde template en worden bijgewerkt met `/stagetwo-tier1:updaten`, als pull request. De check
`guard:template` laat een PR die eraan komt rood staan; in Claude Code houdt de hook van de
Stage Two-plugin de wijziging al bij de toetsaanslag tegen. Klopt er iets niet, meld het dan
bij Stage Two: dan krijgt elk project de verbetering, in plaats van dit project alleen.
<!-- stack:end -->
