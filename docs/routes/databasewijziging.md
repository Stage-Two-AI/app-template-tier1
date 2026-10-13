# Een databasewijziging doorvoeren

De database is het enige onderdeel van deze stack dat gegevens **onherstelbaar** kan
vernietigen. Een merge-knop die `drop table` op de database van productie uitvoert is
krachtig gereedschap. Loop daarom deze route af, ook als de wijziging klein lijkt.

De database van deze app is Cloudflare D1: gewone SQL, in de smaak van SQLite. Elke
wijziging aan de opbouw ervan (een tabel, een kolom, een index) is een **migratie**: een
genummerd SQL-bestand in `migrations/`.

## Nooit met de hand in de database bij Cloudflare

Niet in het dashboard klikken, niet even een kolom toevoegen "om het te proberen", niet
`wrangler d1 execute --remote`. Dan loopt de repo uit de pas met de werkelijkheid en is de
historie waardeloos. Alles gaat als migratiebestand, via een pull request. Je hebt er ook
geen Cloudflare-sleutel voor nodig: de uitrol doet het bij de merge.

## Stap 1: Doe één ding per pull request

Een nieuwe tabel of kolom **en** de code die hem gebruikt horen niet in dezelfde pull request.
De reden: de preview van een pull request draait op de testdatabase, en daar staat je nieuwe
migratie pas na de merge. Code die de nieuwe kolom nodig heeft, faalt in de preview dus tot
dat moment.

Daarom in twee stappen:

1. een pull request met alleen de migratie (en de test die het schema controleert); mergen;
2. een pull request die de nieuwe tabel of kolom gaat gebruiken. Die preview werkt meteen.

Hetzelfde geldt andersom: een kolom weggooien doe je pas als niets hem meer gebruikt.
Migraties zijn **aanvullend**.

## Stap 2: Schrijf de migratie

Nieuw bestand in `migrations/`, met het volgende volgnummer voorop zodat de volgorde
vastligt, en een korte omschrijving:

```
migrations/0001_items.sql                  (staat er al)
migrations/0002_voeg-status-toe-aan-items.sql
```

Bijvoorbeeld:

```sql
-- Een status bij elk item, zodat de lijst kan filteren op open en klaar.
alter table items add column status text not null default 'open';
```

Let bij D1 op deze punten, want ze gaan het vaakst mis:

- **Een nieuwe kolom met `not null` heeft een `default` nodig.** Anders weigert SQLite de
  migratie, omdat de bestaande rijen geen waarde hebben.
- **Datums en tijden zijn tekst** (`text`, in de vorm `2026-10-13T09:30:00Z`), ja/nee is
  een getal (`integer`, 0 of 1). SQLite kent geen apart type daarvoor.
- **Een index** voor een kolom waar je vaak op zoekt of filtert:
  `create index items_status on items (status);`

Eén migratie beschrijft één wijziging. Ze worden in volgorde uitgevoerd en **nooit achteraf
aangepast**: staat een migratie al in `main`, dan heeft D1 hem al toegepast en draait een
gewijzigde versie niet opnieuw. Een fout herstel je met een nieuw bestand erachter.

## Stap 3: Wie mag de gegevens zien?

D1 heeft geen beveiliging per rij. Wie wat mag zien, regelt de servercode in `worker/`:

- Elke route die de nieuwe tabel gebruikt, staat **onder** de inlog-middleware in
  `worker/index.ts`. Dan komt er alleen iemand bij die door de deur is gekomen.
- Zijn de gegevens per gebruiker, bewaar dan wie het is (zoals de kolom `door` in
  `migrations/0001_items.sql`) en filter in elke query op `c.var.gebruiker.email`.
- Gebruik altijd `?` met `.bind(...)` voor waarden in een query, nooit tekst die je zelf aan
  elkaar plakt. Zo kan invoer van een gebruiker nooit SQL worden.

## Stap 4: Draai hem lokaal

```bash
pnpm db:lokaal
```

Dat past alle migraties die nog niet gedraaid zijn toe op de lokale database in
`.wrangler/`. De preview in de Claude-app en `STACK_ALLOW_DEV=1 pnpm dev` doen dit bij het
starten ook zelf. Productie en de testdatabase bij Cloudflare raak je hiermee nooit.

Wil je bewijzen dat alle migraties vanaf niets werken, in volgorde? Draai dan
`pnpm test:e2e`: de CI doet hetzelfde op een lege database. Lokaal opnieuw beginnen kan door
de map `.wrangler/` weg te gooien; die staat niet in git en wordt bij de volgende start
opnieuw opgebouwd.

## Stap 5: Schrijf de test

Servercode test je in Node, met een nagebootste D1 uit `tests/helpers/d1.ts`. Die past alle
migraties uit `migrations/` in volgorde toe, dus de test draait op hetzelfde schema als
productie. Een kapotte migratie valt hier al op.

Het testbestand staat naast de route in `worker/` en begint met
`// @vitest-environment node`. Het patroon staat in `worker/index.test.ts`:

```ts
// @vitest-environment node
import { expect, it } from "vitest";
import { testDatabase } from "../tests/helpers/d1";

it("een nieuw item staat op open", () => {
  const db = testDatabase();
  db.sqlite.exec("insert into items (titel, door) values ('Test', 'a@voorbeeld.nl')");
  const rij = db.sqlite.prepare("select status from items").get();
  expect(rij).toEqual({ status: "open" });
});
```

Gaat het om gegevens per gebruiker, test dan ook wat er níet mag: maak een rij voor
gebruiker B, vraag de lijst op als gebruiker A, verwacht niets. Er is geen andere test die
zo'n fout vangt; de app ziet er van buiten volstrekt normaal uit terwijl iedereen alles kan
opvragen.

```bash
pnpm test
```

## Stap 6: Gaat er iets weg? Stop even

Verwijdert je migratie een tabel of een kolom, of gegevens (`drop table`, `drop column`,
`truncate`, `delete` of `update` zonder `where`), dan blokkeert `guard:migrations` de PR.
Dat is de bedoeling. Loop dit na voordat je bevestigt:

1. D1 bewaart 30 dagen geschiedenis (Time Travel), maar terugzetten is werk van de owner,
   en alles wat na dat moment is ingevoerd, is dan weg.
2. Is dit op **productie** ook echt de bedoeling, of alleen in jouw testomgeving?
3. Kan het ook zonder dataverlies? Een kolom die je niet meer gebruikt mag ook
   gewoon blijven staan. Ongebruikte kolommen kosten niets; verdwenen gegevens zijn weg.
4. Gebruikt de code die nu in `main` staat de kolom of tabel nog? Haal dat gebruik dan eerst
   weg, in een eigen pull request.

Weet je het zeker, zet dan deze regel exact zo in de PR-tekst:

```
Bevestigd: destructieve migratie
```

## Stap 7: Open de pull request

Volg verder `docs/routes/verder-werken.md` vanaf stap 5: `pnpm check`, `pnpm test:e2e`,
pull request openen, previewlink erin. Zeg in de PR-tekst dat de nieuwe tabel of kolom pas
na de merge in de preview staat.

## Wat er gebeurt na de merge

De workflow `Uitrollen` doet, in deze volgorde:

1. De migratie op de **testdatabase** (de canary). Faalt het daar, dan stopt het hier en
   blijft productie onaangeroerd. Lees dan de log van de workflow `Uitrollen` en repareer
   met een nieuwe migratie.
2. Daarna dezelfde migratie op **productie**.
3. Pas dan de nieuwe versie van de app op Cloudflare.

Migraties draaien **alleen bij een merge naar `main`**, nooit op een PR. Een PR mag
de database van niemand aanraken.
