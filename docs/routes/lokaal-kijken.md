# Lokaal kijken: de app op je eigen computer zien terwijl je bouwt

Deze route is voor één ding: tijdens het bouwen **zelf** zien wat je gemaakt hebt,
zonder eerst een pull request te openen en op de preview te wachten. Je assistent
past een bestand aan, en de browser op je eigen computer ververst meteen.

Wat het niet is: het resultaat. Een adres dat met `localhost` begint werkt alleen op
de computer waar het draait, en het bewijst niet dat de gebouwde versie werkt. Werk
laten zien, laten beoordelen en live zetten gaat altijd via de route
`docs/routes/verder-werken.md` en de Cloudflare-preview van de pull request. Deze route
verandert daar niets aan; hij komt ervóór.

## Wat er lokaal anders is

Op je eigen computer draait de hele app: de schermen én de servercode, in dezelfde
Workers-omgeving als bij Cloudflare. Een paar dingen zijn bewust anders:

| | Bij Cloudflare | Op je eigen computer |
|---|---|---|
| De deur | Cloudflare Access, je logt in | geen inlog: je bent altijd de vaste testgebruiker `lokaal@voorbeeld.nl` |
| De database | D1 van productie, of de testdatabase in de preview | een lokale D1 in de map `.wrangler/`, met een kopie van de testdatabase van afgelopen nacht |
| De bestanden | R2 van productie, of de testbestanden in de preview | een lokale R2 in `.wrangler/`; een bestand komt pas uit de testbestanden als de app het vraagt |
| Mail | productie: naar de echte ontvangers | alleen naar het testadres uit `wrangler.jsonc`, of helemaal niet |

Dat regelt `scripts/lib/lokaal.mjs` bij het starten: het zet `OMGEVING=lokaal` en het
testmailadres in `.dev.vars` en draait alle migraties op de lokale database. Daarna laadt
`pnpm data:test` de echte gegevens (zie hieronder). Alles staat in `.gitignore` en blijft
op je computer. De lokale stand kan nooit bij Cloudflare terechtkomen: `guard:cloudflare`
weigert `OMGEVING=lokaal` in `wrangler.jsonc`.

Productie en de testomgeving bij Cloudflare veranderen vanaf je eigen computer dus nooit, en
er is geen sleutel van Cloudflare voor nodig.

## Echte gegevens, en wat dat betekent voor je laptop

Elke nacht zet de workflow Testdatabase verversen in de beheer-repo een kopie van productie
in de testomgeving. Daarna bewaart hij de gegevens bij GitHub, drie dagen, samen met een
lijst tijdelijke leeslinks naar de testbestanden. `pnpm data:test` haalt dat op met `gh`,
waarmee je al bent ingelogd, en laadt het in de lokale database. Zo zie je lokaal wat de
klant ziet.

Dat betekent: **op je laptop staat een kopie van echte gegevens.** Niet ergens in de
cloud, maar echt op je schijf, in de map `.wrangler/` van het project: de hele testdatabase,
plus elk bestand dat je hebt bekeken. Daarom:

- **Schijfversleuteling moet aan staan.** Op een Mac heet dat FileVault (Systeeminstellingen,
  Privacy en beveiliging), op Windows BitLocker. Staat het uit, zet het dan eerst aan.
- Zet het project niet in een map die naar de cloud synchroniseert (iCloud Drive, Dropbox,
  OneDrive).
- Ben je klaar met de app, of gaat de laptop weg: gooi de map `.wrangler/` weg.

## In de Claude-app: dit gaat vanzelf

Werk je in het tabblad Code van de Claude-app, dan hoef je deze route niet te volgen.
De app start de preview zelf, volgens `.claude/launch.json`: dat draait
`scripts/preview.mjs`, en dat haalt de pakketten op als ze er nog niet zijn, zet de lokale
database klaar, laadt de echte gegevens (de eerste keer, en daarna eens per dag) en start
de app. Lukt het laden niet, bijvoorbeeld zonder internet, dan zie je een waarschuwing en
start de app met de lokale database zoals hij was. Je ziet hem in het venster naast het gesprek, en de
assistent kijkt daar zelf ook mee om zijn werk te controleren.

De rest van deze route is voor andere assistenten (Codex, Cursor, …) en voor wie het met
de hand doet.

## Wat je nodig hebt

Eenmalig op de computer waar je werkt. Je assistent kan dit voor je controleren en
installeren; vraag hem "controleer of ik lokaal kan kijken". In Claude Code doet
`/stagetwo-tier1:installatie` het.

| Wat | Waarvoor | Hoe je ziet of het er is |
|---|---|---|
| **git** | de code ophalen en je wijzigingen bijhouden | `git --version` |
| **Node** (versie 22 of nieuwer) | de app bouwen en draaien | `node --version` |
| **pnpm** | de pakketten van de app beheren | `pnpm --version`, anders `npm install -g pnpm` |
| **gh**, ingelogd | de echte gegevens ophalen uit de beheer-repo | `gh auth status` |
| **schijfversleuteling** | de kopie van echte gegevens beschermen | Mac: FileVault staat aan; Windows: BitLocker staat aan |
| **je AI-assistent** (Claude Code, Codex, Cursor, …) | de wijzigingen maken | die heb je al als je dit leest |

Docker is niet nodig.

Daarna de code op je computer zetten en de pakketten ophalen:

```bash
git clone <adres van deze repo>
cd <map>
pnpm install
```

Lukt dit niet binnen tien minuten, vraag het dan aan Stage Two in plaats van door te
worstelen. Dit is inrichting, geen bouwen.

## Starten

```bash
STACK_ALLOW_DEV=1 pnpm dev
```

Dat zet eerst de lokale database klaar (alle migraties) en start dan de app op
http://localhost:5173. Echte gegevens laad je erbij met `pnpm data:test`, in een tweede
venster of vóór het starten. Hij ververst vanzelf bij elke wijziging die je assistent maakt.
Stoppen: `Ctrl+C` in het venster waar hij draait.

Dat `STACK_ALLOW_DEV=1` ervoor is geen vergissing en geen omweg: zonder die variabele
weigert `pnpm dev`, en in Claude Code houdt de hook van de Stage Two-plugin het
commando tegen. Zo blijft lokaal kijken een bewuste keuze van jou en wordt het nooit
stilletjes de manier waarop een assistent werk "oplevert".

## De lokale database

`pnpm data:test` maakt de lokale database leeg, draait alle migraties en laadt de kopie van
afgelopen nacht. Wat je daarna in de app verandert, blijft bewaard tot je opnieuw laadt; in
de Claude-app gebeurt dat vanzelf na een dag.

| Wat je wilt | Hoe |
|---|---|
| de nieuwste echte gegevens | `pnpm data:test` |
| een nieuwe migratie lokaal toepassen | `pnpm db:lokaal`, of gewoon opnieuw starten |
| helemaal opnieuw beginnen | stop de app, gooi de map `.wrangler/` weg en start opnieuw |

Lukt `pnpm data:test` niet, dan zegt de melding waarom. De gewone oorzaken:

| Melding | Wat je doet |
|---|---|
| gh ontbreekt, of je bent niet ingelogd | `/stagetwo-tier1:installatie`, of `gh auth login` |
| geen beheer-repo gevonden | je hebt geen toegang tot `<org>/stagetwo-beheer-tier1`; vraag de owner. Heet hij anders, zet dan `STAGETWO_BEHEER_REPO=<naam>` |
| geen testgegevens voor deze app | Testdatabase verversen heeft nog niet voor deze app gedraaid. Vraag de owner hem te starten in de beheer-repo (Actions) |
| een fout bij het inladen | de kopie past niet bij de migraties van je branch, bijvoorbeeld door een nieuwe kolom. De database is dan leeg met alle migraties; de app werkt gewoon, alleen zonder echte gegevens |

Zonder echte gegevens werkt alles zoals vroeger: een lege database met de tabellen uit de
migraties, die je zelf via de app vult.

## Als de testgebruiker

Op je eigen computer ben je altijd `lokaal@voorbeeld.nl`. Dat adres staat niet in de
gegevens van productie. Hangen rechten in deze app aan een rol in de database, dan ziet die
gebruiker na het laden weinig. Zet dan in `scripts/lokaal-rol.sql` hoe hij een rol krijgt;
dat bestand is van deze app en draait na elk inladen. Er staat een voorbeeld in.

## Mail

In de lokale stand gaat mail alleen naar het testadres (`vars.TESTMAIL_ADRES` bovenaan
`wrangler.jsonc`), met `[test]` voor het onderwerp. Is dat adres leeg, dan gaat er lokaal
geen mail weg. Dat werkt alleen als de servercode elke mail eerst door `bepaalOntvangers` uit
`worker/lib/mail.ts` haalt; zie `AGENTS.md`.

Faalt het starten met een melding over een migratie, dan klopt die migratie niet. Repareer
het bestand zolang het nog niet in `main` staat; staat het daar al, schrijf dan een nieuwe
migratie (zie `docs/routes/databasewijziging.md`).

## Voor de assistent

- In de Claude-app gebruik je de preview (`.claude/launch.json`), geen dev-server in
  Bash. De rest van deze lijst geldt voor andere assistenten.
- Zet de dev-server alleen op als de gebruiker daarom vraagt of als je hem hebt
  voorgesteld en de gebruiker ja zegt. Nooit uit jezelf als vervanging van de preview.
- Start hem op de achtergrond en laat hem draaien terwijl je bouwt; de gebruiker kijkt
  in de browser mee. Meld het adres één keer, niet bij elke wijziging.
- Een lokale dev-server is **nooit** het antwoord op "is het klaar?". Klaar is: PR open,
  checks groen, preview-link in de beschrijving (zie `docs/routes/verder-werken.md`,
  stap 8). Geef nooit een `localhost`-adres als opgeleverd resultaat.
- Lokaal is er geen deur: alles wat je lokaal ziet, ziet de vaste testgebruiker. Of een pad
  echt publiek is of achter de inlog staat, test je in `worker/` met een test, niet door
  lokaal te kijken.
- Zet nooit `OMGEVING=lokaal` ergens anders dan in `.dev.vars`, en zet nooit een sleutel
  van Cloudflare op deze computer. Kom je er een tegen, stop dan en zeg het.
- Lokaal staan echte gegevens. Kopieer ze niet naar een chat, een issue, een test of een
  bestand in git. Heb je een voorbeeld nodig voor een test, verzin dan zelf gegevens.
- Vraag bij de eerste keer of de schijfversleuteling aan staat, als je dat niet zelf kunt
  zien (op een Mac: `fdesetup status`).
