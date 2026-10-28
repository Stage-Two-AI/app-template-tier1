# Werkwijze

*Hoort bij tier 1 van de Stage Two-stack. Welke versie deze app heeft, staat in
`.claude/stack-version`; in de template is elke versie een tag `stack-v<nummer>`. Dit bestand
komt uit de gedeelde template en wordt bijgewerkt met `/stagetwo-tier1:updaten`, als pull
request; wijzig het niet per project.*

Dit legt uit hóé er in dit project gewerkt wordt en vooral **waarom**. De korte,
gebiedende versie voor dagelijks gebruik staat in `AGENTS.md`; dit is de achtergrond
voor wie een keuze wil begrijpen of ter discussie wil stellen.

De uitgangspunten waar alles uit volgt:

- De bouwer is geen programmeur en kan code niet regel voor regel beoordelen. Elke
  keuze moet fouten daarom **mechanisch** afvangen in plaats van te vertrouwen op het
  oog van de bouwer.
- Het werk moet **overdraagbaar** zijn aan een ingehuurde programmeur. Geen
  zelfbedachte workflows, alleen bewezen industriepraktijk.
- Je moet **zonder Stage Two verder kunnen**: wat je bouwt en je gegevens zijn van jou;
  plugin en template mag je blijven gebruiken en ze blijven werken, ook zonder Stage Two.
  Zolang je bedrijf een abonnement heeft, zet Stage Two nieuwe versies van deze werkwijze in
  de kopie die Stage Two bij de start in je eigen GitHub klaarzet, nadat Stage Two ze op zijn eigen apps heeft toegepast; stopt het,
  dan blijft die kopie op de laatste versie staan. Het abonnement kost €150 per maand per
  bedrijf, ongeacht het aantal apps, exclusief btw, en is per maand opzegbaar, met een
  opzegtermijn van één kalendermaand. Het levert nieuwe versies van template en plugin, een
  nieuwe versie van de beheer-repo als dat nodig is, en vragen en meedenken, tot ongeveer een
  uur per maand (meer tijd op afspraak). De plugin meldt
  een nieuwe versie en zet met `/stagetwo-tier1:updaten` per app het update-voorstel klaar; een
  bouwer keurt het goed. Het abonnement houdt de omgeving niet bij: beheer en werking blijven
  na de overdracht bij je bedrijf. Systeembeheer, een garantie op beschikbaarheid en meer werk
  aan je apps (op verzoek, op nacalculatie tegen €120 per uur exclusief btw) vallen erbuiten.
  Dependabot, een dienst van GitHub, stelt in elke app updates van de npm-pakketten voor, als
  pull request, ook zonder abonnement. De versies van de GitHub-workflows in
  `.github/workflows/` komen met een nieuwe versie van de template, omdat die workflows van de
  template zijn; alleen een beveiligingsupdate kan Dependabot tussendoor voorstellen. Hoogt die
  alleen de versie van een GitHub Action in die workflows op, dan laat de controle op
  templatebestanden hem door. Zie [stagetwo.nl/#aanbod](https://stagetwo.nl/#aanbod).
- De afspraken hangen niet aan één AI-assistent. Met Claude Code, Codex of een andere
  agent, of zonder agent, gelden dezelfde regels en dezelfde poort.

---

## 1. Waarom deze onderdelen

Een tier 1-app is **één Cloudflare Worker**: de schermen als gebouwde bestanden, de
servercode onder `/api`, een database en een bestandsopslag ernaast. Alles bij één partij,
achter één deur.

| Laag | Keuze | Waarom |
|---|---|---|
| Taal | TypeScript, `strict` | vangt het gros van de fouten vóór het live gaat |
| Bouwgereedschap | Vite | snel, en bouwt schermen en servercode in één keer |
| Interface | React + shadcn/ui + Tailwind | bouwblokken in je eigen repo, geen afhankelijkheid van iemands versiebeleid |
| Servercode | Hono, in `worker/` | een kleine, gangbare laag voor de routes onder `/api`; draait in de Worker zelf |
| Database | Cloudflare D1 (SQLite) | gewone SQL, migraties als bestanden in `migrations/`, vrijwel gratis per app |
| Bestanden | Cloudflare R2 | foto's, uploads en exports, naast de database in dezelfde Worker |
| Geplande taken | Cloudflare-cron | `triggers.crons` in `wrangler.jsonc`, de code in `scheduled` in `worker/index.ts` |
| Validatie | Zod | controleert gegevens van buiten vóór gebruik, in het scherm én in de servercode |
| Tests | Vitest + Playwright | het vangnet |
| Fouten in productie | Sentry, in de schermen en in de servercode | anders hoor je het van je klant |
| Hosting en toegang | Cloudflare | een preview per pull request achter de login, productie op `main`; Cloudflare Access is de deur |

Waarom het meeste in de browser blijft: het typische project is een intern werktuig
achter een login. De printer, de camera voor barcodes, een PDF uit wat op het scherm staat,
Excel in- en uitlezen: dat kan alleen in de browser. De servercode doet wat de browser niet
mag of kan: gegevens bewaren, sleutels van andere systemen gebruiken, iets op vaste tijden doen.

**Wat tier 1 niet is.** Er is ook tier 2, met Cloudflare en Supabase
(`app-template-tier2`), voor apps die een volwaardige Postgres-database met
beveiliging per rij nodig hebben. Een app zit op tier 1 of op tier 2. Overstappen
van tier 1 naar tier 2 is herbouwen; dat doet Stage Two op verzoek, als betaald werk.

---

## 2. Beveiliging, en waarom dat hier zwaarder weegt

**De deur: Cloudflare Access staat voor de hele app.** Wie niet op de lijst staat, ziet
de schermen niet en bereikt de servercode niet. De lijst staat in `toegang.json` in de
beheer-repo van de organisatie (`<org>/stagetwo-beheer-tier1`): welke mensen bij welke app mogen,
en welke paden publiek zijn. Een bouwer mag daar zelf mensen toevoegen én een pad publiek
maken, met een pull request die alleen `toegang.json` wijzigt. Publiceren hoort bij gewoon
bouwen.

**De servercode controleert het nog een keer.** Access stuurt bij elk doorgelaten verzoek
een ondertekend bewijs mee. `wieIsHet` in `worker/lib/access.ts` controleert dat bewijs en
leest het mailadres eruit. In `worker/index.ts` staat de inlog-middleware: elke route
daaronder weigert een verzoek zonder geldige gebruiker. Alleen routes die **boven** die
middleware staan, zijn zonder inlog bereikbaar. Is de app nog niet ingericht (geen
`ACCESS_TEAM` of `ACCESS_AUD`), dan is er nooit een gebruiker en blijft alles dicht.

Een pad publiek maken gaat dus altijd op twee plekken, en je hebt ze allebei nodig:

| Plek | Wat | Vergeet je het |
|---|---|---|
| `toegang.json` in de beheer-repo | het pad onder `publiek` bij deze app: de deur laat het door zonder inlog | de deur houdt bezoekers tegen |
| `worker/index.ts` | de route staat vóór de inlog-middleware | de servercode geeft 401 |

**Wie wat mag zien, regelt de servercode.** Er is geen beveiliging per rij in de database:
D1 kent dat niet. Mag een gebruiker alleen zijn eigen gegevens zien, dan filtert de route
daarop, met het mailadres uit `c.var.gebruiker`. Zo'n regel test je net als ander gedrag:
vraag als gebruiker A de gegevens van B op, verwacht niets.

**Machines** (een server, een Pi, een script dat elke nacht iets ophaalt) loggen niet in als
mens. Ze krijgen een eigen apparaatsleutel:

| Wat | Hoe |
|---|---|
| Een apparaat toevoegen | `pnpm apparaat:nieuw <naam>`; de sleutel verschijnt één keer, zet hem op het apparaat |
| Wat er in de repo komt | alleen de vingerafdruk, in `worker/apparaten.json`; die mag openbaar zijn |
| Intrekken | `pnpm apparaat:nieuw -- --intrekken <naam>`, pull request, merge |
| In de route | `welkApparaat(request, ["<naam>"])` uit `worker/lib/apparaat.ts`, met alleen de apparaten van die route |
| Aan de deur | het pad staat publiek in `toegang.json`, en de route staat vóór de inlog-middleware |

De apparaatsleutel doet dan het werk van de deur. Laat zo'n route precies doen wat het
apparaat nodig heeft, en niet meer.

**Alles in de schermen is leesbaar voor de gebruiker.** Elke `VITE_`-variabele zit in het
bestand dat de bezoeker downloadt.

- Wél in de schermen: de **Sentry DSN**. Die is expres publiek: hij kan alleen fouten insturen.
- **Nooit** in de schermen: API-sleutels van andere systemen, wachtwoorden. Die horen in de
  servercode, als geheim van de Worker.
- **Sleutels van andere systemen** (Stripe, Resend, een AI-dienst) zet de owner van de
  organisatie als geheim van de Worker, niet de bouwer: een nieuw extern systeem aansluiten
  is een architectuurbesluit. De bouwer schrijft de code zo dat hij een duidelijke fout geeft
  als de sleutel ontbreekt (zie `worker/env.ts`).
- `.env`, `.dev.vars` en `.wrangler/` staan nooit in git.

Twee checks bewaken dit automatisch: `guard:secrets` doorzoekt de repo én de gebouwde
bundel. Die tweede is de belangrijkste van allemaal.

**Fouten naar Sentry.** Eén Sentry-project per app, met één DSN voor de schermen
(`src/lib/fouten.ts`) en de servercode (`worker/lib/fouten.ts`). De DSN is de
GitHub-variabele `VITE_SENTRY_DSN` van de app-repo, in de omgevingen `production` en
`preview`; die zet de owner. De uitrol bouwt hem in de schermen en geeft hem de Worker mee
als `SENTRY_DSN`. In de preview krijgt alleen de servercode hem: de schermen van een pull
request worden gebouwd zonder omgeving. Productie en preview staan in Sentry los van elkaar
(omgeving `productie` en `test`). Is de variabele leeg, dan staat Sentry uit; op je eigen
computer staat hij altijd uit. Er gaan geen persoonsgegevens mee: geen gebruiker of
IP-adres, geen cookies, headers, bodies of queryparameters. Een fout in een route geeft de
gebruiker hetzelfde antwoord als zonder Sentry ("Er ging iets mis"); Sentry krijgt hem erbij.

**De assistent leest Sentry mee.** Het Sentry-account staat op naam van je organisatie, op het
gratis plan met één login. De assistent leest de fouten via de Sentry-koppeling in claude.ai
(`mcp.sentry.dev`); die werkt ook in een cloudsessie. Een nieuwe bouwer zet die koppeling aan
in zijn eigen claude.ai, en wie de login beheert, logt daar één keer in op het scherm van de
bouwer; zo ziet de bouwer het wachtwoord nooit. Alle koppelingen hangen aan die ene login.
Gaat er iemand weg, dan is één koppeling los intrekken waarschijnlijk niet mogelijk: trek ze
dan allemaal in (wachtwoord van Sentry wijzigen) en koppel de anderen opnieuw, of haal de
persoon uit het Team-account van Claude. Bij een fout in productie kijkt de assistent eerst
in Sentry, voordat hij gaat zoeken.

**Mail buiten productie gaat naar één testadres.** In de preview en op je eigen computer
staan echte gegevens, dus ook echte mailadressen van klanten. Daarom gaat elke mail uit de
servercode eerst door `bepaalOntvangers` in `worker/lib/mail.ts`:

| Waar | Naar wie |
|---|---|
| productie | de ontvangers zoals ze in de code staan |
| preview en je eigen computer | alleen naar het testadres, zonder cc en bcc, met `[test]` voor het onderwerp |
| preview en je eigen computer, zonder testadres | niemand: de mail gaat niet weg |

Het testadres staat bovenaan `wrangler.jsonc`, als `vars.TESTMAIL_ADRES`. Het is geen
geheim en het hoort bij de app, niet bij de bouwer: de preview wordt gedeeld. De uitrol van
de preview geeft het mee, en op je eigen computer zet de preview het in `.dev.vars`.

**Eén adres, en dat staat achter Access.** De deur werkt alleen als er geen tweede adres
is om omheen te gaan. `wrangler.jsonc` kent daarom twee standen, en
`scripts/lib/cloudflare-config.mjs` weigert elke andere combinatie:

| Stand | In `wrangler.jsonc` | Wanneer |
|---|---|---|
| standaard | een route met `custom_domain: true` en `workers_dev: false`, eventueel met `www.<domein>` als tweede route | altijd, zodra de app een eigen domein heeft; de app stuurt www zelf door naar het domein |
| tijdelijk | geen `routes` en `workers_dev: true` | alleen zolang de klant nog geen domein heeft gekozen |

In de tijdelijke stand draait de app op `<worker>.<subdomein>.workers.dev`, en zet de
inrichting Access op dat adres. Het is een overbrugging, geen keuze voor de lange termijn:
is het domein er, dan gaat de app naar de standaardstand en gaat workers.dev weer uit. Dat
overstappen gaat met de inrichting in de beheer-repo: tijdens het project door Stage Two,
na de overdracht door de owner van je organisatie, of op verzoek door Stage Two.

**De vaste afspraken in `wrangler.jsonc`.** De check `guard:cloudflare` houdt een PR tegen
die er niet aan voldoet:

- `main` is `worker/index.ts`, en `/api/*` gaat altijd eerst naar de servercode
  (`assets.run_worker_first`);
- opslag alleen in D1 en R2 (plus `ai` en `triggers`); KV, Durable Objects, queues en
  andere opslag niet. Eén soort database en één soort bestanden, in elke app hetzelfde;
- een omgeving `env.preview` met een **eigen** D1 en R2, nooit die van productie;
- nooit `OMGEVING=lokaal` in `wrangler.jsonc`: die stand zet de controle van Access uit en
  hoort alleen in `.dev.vars` op je eigen computer. Productie heeft geen `OMGEVING` (leeg
  betekent productie), de preview krijgt altijd `test`;
- `vars.TESTMAIL_ADRES` is leeg of één mailadres.

**Installeerbaar als app, niet offline.** Elke app is via "Zet op beginscherm" (iPhone) of
"Installeren" (Android, Chrome, Edge) als app te zetten: met een eigen icoon en zonder
adresbalk. Daarvoor zijn er drie onderdelen, allemaal van het project: het manifest
`public/manifest.webmanifest` (naam, kleur, icoontjes), de icoontjes in `public/` en een
paar regels in `index.html`. Het eigen logo van de klant vervangt de icoontjes van Stage
Two (192 en 512 pixels, en 180 voor de iPhone, met het logo binnen het middelste
tachtig procent, want Android snijdt de randen af).

Twee dingen zijn bewust zo:

- Het manifest wordt opgehaald met `crossorigin="use-credentials"`. Zonder die regel
  vraagt de browser het op zonder het inlogkoekje, houdt Access het tegen en is de app
  niet te installeren. Lokaal merk je dat niet; `tests/unit/installeerbaar.test.ts`
  bewaakt het.
- Er is geen service worker (de code die een app offline laat werken). Die bewaart oude
  versies op het toestel, waardoor een gebruiker na een update nog de oude app of oude
  gegevens kan zien. Installeren werkt zonder. Komen er ooit pushmeldingen, dan komt er
  alleen daarvoor een kleine service worker bij, die niets bewaart.

Een geïnstalleerde app op de iPhone heeft een eigen opslag, los van Safari: daar log je
één keer apart in bij Access, en daarna weer zodra de sessie van Access verloopt.

Een app van vóór versie 27 krijgt dit niet vanzelf met `/stagetwo-tier1:updaten`, omdat
`index.html` en `public/` van het project zijn. Neem dan de drie onderdelen en de test
over uit de template, als een gewone wijziging via `/stagetwo-tier1:verder-werken`.

**Een geaccepteerd risico.** De sleutel waarmee GitHub uitrolt, mag D1 en R2 van het hele
Cloudflare-account beheren, niet van één app. Met weinig apps in een account is dat
aanvaardbaar. Wil je organisatie het dichter, dan verdeelt Stage Two op verzoek de apps
over accounts.

---

## 3. Databasewijzigingen lopen via GitHub

### De database van deze app

Elke tier 1-app heeft haar eigen D1-database en haar eigen R2-opslag. Een app die
niets bewaart, laat de voorbeeldtabel weg en gebruikt de database niet; dat kost niets.
De regel erachter is **één app per verzameling gegevens**: gaat het over gegevens die al in
een andere app zitten, dan bouw je het in die app.

Wat waar hoort:

| Wat | Waar |
|---|---|
| gegevens met onderlinge verbanden, die je wilt zoeken, filteren of sorteren | D1, via een migratie |
| bestanden: foto's, audio, uploads, exports | R2 (de binding `BESTANDEN`) |
| iets dat op vaste tijden moet gebeuren | Cloudflare-cron: `triggers.crons` in `wrangler.jsonc` en `scheduled` in `worker/index.ts` |
| inhoud die jij beheert en zelden verandert (teksten, een productenlijst) | gewoon in de repo |

### De testomgeving: preview en lokaal kijken raken nooit productie

Elke app heeft naast productie een **testomgeving**: een eigen D1 en R2, in
`wrangler.jsonc` onder `env.preview`. Zelfde schema, los van productie. Elke nacht zet de
workflow Testdatabase verversen in de beheer-repo er een kopie van productie in: de gegevens
van de database en de bestanden. Productie wordt daarbij alleen gelezen. Wat je in de
testomgeving verandert, is de volgende ochtend weer weg.

Wat erop draait:

- **De preview van elke pull request.** Die draait als aparte Worker `<app>-preview`, met de
  testdatabase en de testbestanden. Klikken, opslaan, verwijderen in een preview raakt nooit
  productie. De preview toont een balk dat dit de testomgeving is. Wie inlogt, heeft daar
  dezelfde rechten als in productie: rollen die aan een mailadres hangen, gaan mee met de
  kopie. Mail gaat er alleen naar het testadres (zie hoofdstuk 2).
- **Migraties, als eerste.** Bij een merge past de workflow Uitrollen de migraties eerst toe
  op de testdatabase (de canary), dan op productie, en zet pas daarna de nieuwe code neer.
  Faalt het op de testdatabase, dan blijft productie zoals hij was.

Twee dingen om te weten over de preview, want ze verrassen mensen:

- **De preview gebruikt altijd de instellingen van `main`.** De pull request levert alleen
  de gebouwde code; welke database, welke bestanden en welke variabelen de preview krijgt,
  komt uit `wrangler.jsonc` op `main`. Zo kan code uit een pull request nooit bij de opslag
  van productie. Een wijziging aan `wrangler.jsonc` (een nieuwe binding, een cron) zie je dus
  pas na de merge. Geplande taken draaien in de preview niet.
- **Nieuwe migraties uit een pull request staan pas na de merge in de testdatabase.** Een
  preview met code die een nieuwe kolom nodig heeft, faalt dus tot de migratie gemerged is.
  Daarom: de migratie in de ene pull request, het gebruik ervan in de volgende.

**Lokaal kijken op je eigen computer** gebruikt geen van beide: daar draait een lokale D1
in de map `.wrangler/`, opgebouwd uit alle migraties (route `docs/routes/lokaal-kijken.md`).
Daarin laadt `pnpm data:test` de kopie van afgelopen nacht. De preview van de Claude-app doet
dat zelf, bij de eerste start en daarna eens per dag. Zo ziet de assistent wat de klant ziet,
zonder dat iemand hoeft in te loggen. Hoe dat werkt:

- De workflow in de beheer-repo bewaart na het verversen de gegevens van de testdatabase als
  bestand bij GitHub (een artifact, drie dagen bewaard), plus een lijst met tijdelijke
  leeslinks naar de testbestanden (zeven dagen geldig). De laptop haalt dat op met `gh`,
  waarmee je al bent ingelogd. Wie bij de beheer-repo mag, kan het ophalen; er komt geen
  sleutel van Cloudflare op je computer.
- Bestanden komen pas op je computer als de app ze vraagt: `leesBestand` in
  `worker/lib/bestanden.ts` haalt een ontbrekend bestand dan op met de leeslink. Dat gebeurt
  alleen in de lokale stand; in productie en de preview kan het niet.
- Op je eigen computer ben je altijd `lokaal@voorbeeld.nl`. Dat adres staat niet in
  productie. Hangen rechten aan een rol in de database, zet dan in `scripts/lokaal-rol.sql`
  hoe die gebruiker een rol krijgt; dat bestand draait na elk inladen.

**Er staat dus een kopie van echte gegevens op je laptop.** Bij tier 1 is dat letterlijk zo:
de hele testdatabase en de bestanden die je hebt bekeken, staan in de map `.wrangler/` van
het project. Daarom:

- **Schijfversleuteling moet aan staan:** FileVault op een Mac, BitLocker op Windows. Zonder
  versleuteling kan wie de laptop vindt of steelt de gegevens lezen.
- Zet het project niet in een map die naar de cloud synchroniseert (iCloud Drive, Dropbox,
  OneDrive): dan gaat de kopie mee naar die dienst.
- Werk je niet meer aan de app, of gaat de laptop de deur uit: gooi de map `.wrangler/` weg.

### Hoe een wijziging aan de database gaat

Het doel: je kunt het databaseschema wijzigen **zonder toegang tot Cloudflare**. Dat werkt
via migraties plus de uitrol.

1. De wijziging wordt een SQL-bestand in `migrations/`, met een volgnummer voorop.
2. Pull request openen. De CI draait: typecontrole, tests (met een nagebootste D1 die alle
   migraties toepast), de end-to-end test op een lokale D1 vanaf nul, en de
   destructie-check.
3. Mergen naar `main`.
4. De workflow Uitrollen past de migratie toe: eerst op de testdatabase, dan op productie.
5. Daarna zet dezelfde workflow de nieuwe versie op Cloudflare neer.

Regels die hierbij horen en niet vrijblijvend zijn:

- **Migraties draaien alleen bij een merge naar `main`**, nooit op een pull request.
- **Een migratie die al in `main` staat, pas je nooit meer aan.** D1 houdt bij welke
  bestanden al zijn toegepast; een gewijzigd oud bestand draait niet opnieuw, en dan lopen
  repo en database uit de pas. Een fout herstel je met een nieuw bestand.
- **Migraties zijn aanvullend.** Voeg een kolom toe in de ene pull request en gebruik hem in
  de volgende; gooi een kolom pas weg als niets hem meer aanroept.
- **Nooit met de hand in de database bij Cloudflare.** Niet in het dashboard, niet met
  `wrangler d1 execute --remote`. Dan loopt de repo uit de pas met de werkelijkheid.
- **Iets weggooien vraagt een bevestiging.** D1 bewaart 30 dagen geschiedenis (Time
  Travel), maar terugzetten is werk van de owner, en alles wat na dat moment is ingevoerd,
  is dan weg.

De stappen zelf staan in `docs/routes/databasewijziging.md`.

---

## 4. De kwaliteitspoort

Draait op elke pull request; alles groen voordat er gemerged kan worden. Wat elke
check bewaakt staat in de tabel in `README.md`.

**Concept eerst, de volle poort bij klaar.** Een pull request begint als concept (draft).
Dan draait bij elke push alleen de snelle check `Code` (een paar minuten) en wordt de preview
bijgewerkt. De zware check `Database en end-to-end` draait pas als de PR op klaar wordt gezet
(`gh pr ready`). Mergen kan alleen met de volle poort groen: een concept kan niet mergen, en
op klaar zetten start alles opnieuw. Zo wacht niemand per tussenstap op een browsertest, en
kost bouwen veel minder Actions-minuten.

**Het vaste preview-adres.** Naast de preview per pull request (`pr-<nummer>-...`) heeft
elke app één vast adres, `actueel-...`, dat altijd de laatst gepushte PR toont. Dat kan de
gebruiker open laten staan en verversen. Staan er twee PR's tegelijk open, dan toont het
vaste adres de laatste push; de PR-adressen blijven ieder hun eigen versie tonen.

Twee dingen om te begrijpen over waaróm dit zo streng staat:

**De tests zijn de reviewer.** Er is bewust geen verplichte goedkeuring van een mens
op gewone wijzigingen, zodat je je eigen werk kunt mergen zodra het groen is. De
keerzijde is dat wat de tests niet dekken, door niemand gedekt wordt. Daarom is
"schrijf de test erbij" hier geen nette gewoonte maar de kern van de afspraak.

**Een rode check zet je niet uit.** De verleiding is groot, zeker als je haast hebt en
de check "iets onbelangrijks" lijkt te vinden. Maar de check is er juist voor het
moment dat je haast hebt.

### Welke tests er zijn

| Test | Waar | Wat |
|---|---|---|
| schermen | `src/**/*.test.ts(x)` | in een nagebootste browser (jsdom) |
| servercode | `worker/**/*.test.ts` | in Node, met een nagebootste D1 (`tests/helpers/d1.ts`) waarop alle migraties draaien. Zo'n bestand begint met `// @vitest-environment node` |
| end-to-end | `e2e/` | de gebouwde app in een echte browser, met een lokale D1 |

`pnpm test` draait de eerste twee, `pnpm test:e2e` de laatste.

### Wat "de happy path" is

De route door de app waarop niets misgaat: lijst openen → item toevoegen → het staat er,
ook na verversen. Niet de randgevallen. Breekt die route, dan is de app waardeloos, dus
dat is de test die het meest telt. Hij raakt in één keer de hele keten: build,
servercode, database en de interface.

Uitbreiden doe je **reactief**: elke keer dat er in productie iets stukgaat, komt er
een test bij die precies dat geval afdekt. Zo groeit het vangnet mee met je echte
fouten in plaats van met bedachte scenario's.

---

## 5. Git- en werkafspraken

1. **`main` is heilig.** Alles via een pull request, ook voor de bouwer.
2. **Eén PR = één onderwerp.** Grote PR's zijn niet te beoordelen en een agent
   verdwaalt erin.
3. **Lees altijd de diff voordat je merget.** Zonder de taal te kennen let je op:
   - zijn dit de bestanden die ik verwachtte?
   - hoeveel regels? ("kleine fix" met 300 regels is een rode vlag)
   - is er iets **verwijderd** waar niemand om gevraagd heeft?
   - staan er nieuwe pakketten in `package.json`?
   - raakt het aan inloggen, publieke routes, betalingen, `wrangler.jsonc` of migraties?
   - staat er een sleutel of wachtwoord hardgecodeerd in?
4. **Klik de Cloudflare-preview aan.** Kijken gaat boven hopen. Een preview-URL van de PR
   is de enige geldige manier om werk te laten zien, nooit een dev-server op localhost. De
   assistent opent hem zelf in de browser in de zijbalk van de Claude-app; de eerste keer
   logt de gebruiker daar één keer in bij Cloudflare Access.
5. **Deployen = mergen.** Nooit met de hand op Cloudflare of in een console ingrijpen.
6. **Conventional Commits** (`feat:`, `fix:`, `chore:`).
7. **Bug gefixt? Schrijf er een test bij.** Zo groeit het vangnet mee.
8. **Scope per taak, niet per uur.** Een agent die twee uur ongestoord doorbouwt,
   levert een diff op die niet meer te beoordelen is. Dan is het vertrouwen in plaats
   van controle.

---

## 6. Wie mag wat

|  | Bouwer (iemand van de klant) | Owner (eigenaar van de organisatie bij de klant) |
|---|---|---|
| GitHub-repo | **Write** | Admin |
| Direct pushen naar `main` | **nee** | nee, geblokkeerd |
| Branch aanmaken en PR openen | **ja** | ja |
| Eigen PR mergen | **ja**, zodra alle checks groen zijn | ja, zodra alle checks groen zijn |
| Mensen toegang geven, een pad publiek maken | **ja**, met een PR op `toegang.json` in de beheer-repo | ja |
| Een sleutel van een ander systeem zetten | nee | ja |
| Cloudflare-console | niet nodig: deployen is mergen, inrichten doet de beheer-repo | ja, voor het account en de rekening |
| Sentry | ja, meelezen | ja |

**De bouwer heeft geen Cloudflare-sleutel.** De Worker, de deur, de database en de opslag
maakt de workflow App inrichten in de beheer-repo; die zet daarna de id's in
`wrangler.jsonc` met een pull request. Zolang daar nullen staan, is de app nog niet
ingericht en slaat de uitrol over. Uitrollen doet GitHub Actions bij een merge.

**De merge-knop is de enige knop die je nodig hebt.** Je kunt met je eigen
AI-assistent bouwen, een pull request openen en die zelf mergen, maar alleen langs de
route waar de tests over gaan.

**Er is geen enkele wijziging waarvoor je op goedkeuring van Stage Two moet wachten.**
Dat is een bewuste keuze en geen vergeetachtigheid: als je voor elke wijziging op ons
zou moeten wachten, kun je niet zonder ons verder, en dat is precies wat deze werkwijze
belooft. Een verplichte review is niet overdraagbaar.

Wat er dan wel voor zorgt dat het goed gaat: de checks blokkeren de merge als er iets
stuk is, een destructieve migratie vraagt een expliciete bevestiging in de PR-tekst, een
wijziging aan de poort zelf ook, en wie in `.github/CODEOWNERS` staat krijgt een melding
bij een wijziging aan de database, aan het inloggen of aan de poort zelf (dat blokkeert
niets maar informeert wel). Dat is de bouwer die de app heeft aangemaakt:
`/stagetwo-tier1:nieuwe-app` zet hem erin. Stage Two staat er niet in.

**Wie doet wat.** Je bouwt zelf: de bouwers zijn mensen van je eigen organisatie, met hun
eigen AI-assistent. Alle accounts (GitHub, Cloudflare, Sentry) staan vanaf het begin op naam van je
organisatie en zijn van jou. In de projectfase richt Stage Two die accounts in en beheert
ze namens je, en begeleidt de bouwers. Bij de overdracht hoeft er dus niets te verhuizen:
je organisatie is en blijft eigenaar, en is vanaf dan zelf verantwoordelijk voor de
accounts en de rekeningen. Oplevering en overdracht zijn hetzelfde moment: het einde van
het project. Dan haalt Stage Two zijn eigen toegang weg: Stage Two houdt geen persoonlijk
account en geen beheerrechten in je organisatie, tenzij je organisatie dat wil; die toegang kan
je organisatie altijd zelf intrekken. Toegang tot je apps heeft Stage Two niet nodig.
Je apps veranderen nooit vanzelf; de plugin wel: dat is software van Stage Two die met de
rechten van de bouwer op zijn computer draait en zichzelf bijwerkt. Dat bijwerken kan uit
(vraag je assistent erom), en dan werk je de plugin zelf bij met `/stagetwo-tier1:updaten`.
Zolang het abonnement loopt, zet Stage Two nieuwe versies van deze werkwijze in de kopie in je
eigen GitHub, via de GitHub App `stagetwo-levering`. Stage Two installeert die bij de start
namens je organisatie, op alleen de twee kopieën van template en plugin ("Only select
repositories"); je organisatie kan hem altijd zelf verwijderen. Hij heeft alleen daar
schrijfrecht, niet op je apps. De plugin
op je computer werkt zichzelf bij uit die kopie. Je apps veranderen alleen via een
update-voorstel dat de plugin met `/stagetwo-tier1:updaten` klaarzet en dat een bouwer
goedkeurt. Een nieuwe versie van de beheer-repo zet Stage Two op verzoek klaar, met tijdelijke
toegang die de owner van je organisatie geeft en daarna weer intrekt. Bij opzeggen haalt
Stage Two je organisatie uit de lijst van abonnees en de App `stagetwo-levering` uit je
organisatie. Wil je na de overdracht de inrichting zelf aanpassen, dan kan dat met een beheerserver
(optioneel): een server van je organisatie met Claude Code, die Stage Two bij de overdracht
kan achterlaten.

---

## 7. Hoe de afspraken worden afgedwongen

Een afspraak die een agent moet ónthouden, breekt uiteindelijk. Een afspraak die de
tooling afdwingt, niet. Vandaar drie lagen, oplopend in sterkte:

1. **`AGENTS.md`** geeft richting. Dat is het bestand dat vrijwel elke AI-assistent
   automatisch leest aan het begin van een sessie in deze map (Claude Code via
   `CLAUDE.md`, dat niets anders doet dan `AGENTS.md` importeren). Bovenaan staat de
   "klaar is"-definitie, want daar stuurt een model het sterkst op. De vaste routes
   staan uitgeschreven in `docs/routes/`, als gewone tekst, zodat ook een assistent
   zonder skills, of een mens, ze kan volgen.
2. **De repo zelf** dwingt af, voor iedereen. `pnpm dev` weigert, tenzij je er
   expliciet `STACK_ALLOW_DEV=1` voor zet om voor jezelf te kijken (de route
   `docs/routes/lokaal-kijken.md`); in de Claude-app loopt dat via de preview
   (`.claude/launch.json`). Zo is lokaal kijken een bewuste keuze en nooit stilletjes
   de oplevering. Een PR die aan de poort of de afspraken komt, laat de
   check `guard:template` rood staan. Voor Claude Code komt daar de Stage Two-plugin bij
   (de kopie `stagetwo-plugin-tier1` in de GitHub van je eigen organisatie, die Stage Two
   klaarzet; Claude Code biedt de installatie zelf aan): een hook
   die een tool-aanroep onderschept vóór hij wordt uitgevoerd en hem blokkeert met uitleg
   terug aan de agent, `/stagetwo-tier1:verder-werken` als aansluiting op de routes, en
   `/stagetwo-tier1:updaten` om een nieuwere template op te halen. Dat is dezelfde afspraak,
   alleen eerder merkbaar: bij de toetsaanslag in plaats van bij de check. Een aansluiting
   voor een agent mag nooit een afspraak bevatten die niet in `AGENTS.md` staat; zo
   betekent "klaar" voor elke agent hetzelfde. Zonder de plugin blijft de check de grens:
   minder snel, even hard.
3. **CI en branch protection** is de bodem. Ook als een agent élke afspraak negeert,
   komt er niets in `main` zonder groene checks.

De eerste twee lagen bepalen hoe vaak je tegen die bodem aan loopt. De derde bepaalt
wat er gebeurt als het toch misgaat.

---

## 8. Woordenlijst

De namen zitten op verschillende verdiepingen; het zijn geen concurrenten van elkaar.

| Term | Wat het is |
|---|---|
| **TypeScript** | de taal: JavaScript met labels erbij ("dit veld is een datum") zodat fouten opvallen vóór het live gaat |
| **React** | het systeem van herbruikbare bouwblokken waarmee je de interface samenstelt. Geen taal |
| **Vite** | het bouwgereedschap: maakt van je bronbestanden iets dat een browser en de Worker kunnen laden |
| **Cloudflare** | het platform waar de app draait, en de deur ervoor: wie niet mag inloggen ziet de app niet |
| **Worker** | het programma bij Cloudflare dat deze app is: het serveert de schermen en draait de servercode onder `/api` |
| **Hono** | de kleine bibliotheek waarmee de routes van de servercode in `worker/` geschreven zijn |
| **Cloudflare Access** | de deur: laat alleen de mensen uit `toegang.json` door, en stuurt een bewijs mee wie het is |
| **D1** | de database van Cloudflare. Gewone SQL (SQLite), per app een eigen database |
| **R2** | de bestandsopslag van Cloudflare, voor foto's, uploads en exports |
| **Cron** | een geplande taak: code die op vaste tijden draait, zonder dat iemand iets aanklikt |
| **Migratie** | een genummerd SQL-bestand dat één databasewijziging vastlegt, zodat de historie navolgbaar is |
| **Binding** | de koppeling in `wrangler.jsonc` die de servercode toegang geeft tot de database (`DB`) of de bestanden (`BESTANDEN`) |
| **Apparaatsleutel** | een eigen sleutel voor een machine die de servercode aanroept zonder als mens in te loggen |
| **Artifact** | een bestand dat een workflow bij GitHub bewaart, een paar dagen. Alleen wie bij de repo mag, kan het ophalen |
| **Beheer-repo** | de repo `<org>/stagetwo-beheer-tier1` van de organisatie: richt apps in en houdt `toegang.json` bij |
| **Beheerserver** | optioneel: een server van je organisatie met Claude Code, waarmee je na de overdracht zelf de inrichting aanpast |
| **PR (pull request)** | het voorstel om wijzigingen naar `main` te brengen. De plek waar diff, checks en preview samenkomen |
| **Diff** | het verschil tussen oud en nieuw: precies wat er gewijzigd is |
| **CI** | de machine die bij elke PR je checks draait en nee kan zeggen |
| **Ruleset / branch protection** | de GitHub-instelling die bepaalt wie wat mag met `main` |
| **AGENTS.md** | het bestand met de afspraken dat AI-assistenten automatisch lezen. Een afspraak tussen tools, niet van één leverancier |
| **Hook** | een regel die een tool-aanroep van de agent onderschept en kan blokkeren. Afdwingen in plaats van vragen. In deze stack alleen voor Claude Code; de afspraak zelf staat in `AGENTS.md` en de check |
| **Happy path** | de route door de app waarop niets misgaat: de normale, geslaagde gang van zaken |
