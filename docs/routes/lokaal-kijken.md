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
Workers-omgeving als bij Cloudflare. Twee dingen zijn bewust anders:

| | Bij Cloudflare | Op je eigen computer |
|---|---|---|
| De deur | Cloudflare Access, je logt in | geen inlog: je bent altijd de vaste testgebruiker `lokaal@voorbeeld.nl` |
| De database en bestanden | D1 en R2 van productie, of van de testomgeving in de preview | een lokale D1 en R2 in de map `.wrangler/`, opgebouwd uit alle migraties |

Dat regelt `scripts/lib/lokaal.mjs` bij het starten: het zet `OMGEVING=lokaal` in
`.dev.vars` en draait alle migraties op de lokale database. Beide staan in `.gitignore` en
blijven op je computer. De lokale stand kan nooit bij Cloudflare terechtkomen:
`guard:cloudflare` weigert `OMGEVING=lokaal` in `wrangler.jsonc`.

Productie en de testomgeving bij Cloudflare raak je vanaf je eigen computer dus nooit, en er
is geen sleutel van Cloudflare voor nodig.

## In de Claude-app: dit gaat vanzelf

Werk je in het tabblad Code van de Claude-app, dan hoef je deze route niet te volgen.
De app start de preview zelf, volgens `.claude/launch.json`: dat draait
`scripts/preview.mjs`, en dat haalt de pakketten op als ze er nog niet zijn, zet de lokale
database klaar en start de app. Je ziet hem in het venster naast het gesprek, en de
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
http://localhost:5173. Hij ververst vanzelf bij elke wijziging die je assistent maakt.
Stoppen: `Ctrl+C` in het venster waar hij draait.

Dat `STACK_ALLOW_DEV=1` ervoor is geen vergissing en geen omweg: zonder die variabele
weigert `pnpm dev`, en in Claude Code houdt de hook van de Stage Two-plugin het
commando tegen. Zo blijft lokaal kijken een bewuste keuze van jou en wordt het nooit
stilletjes de manier waarop een assistent werk "oplevert".

## De lokale database

De lokale database begint leeg, op de tabellen uit de migraties na. Voor een scherm dat
gegevens toont, voer je die eerst zelf in via de app; ze blijven bewaard tussen twee keer
starten.

| Wat je wilt | Hoe |
|---|---|
| een nieuwe migratie lokaal toepassen | `pnpm db:lokaal`, of gewoon opnieuw starten |
| helemaal opnieuw beginnen | stop de app, gooi de map `.wrangler/` weg en start opnieuw |

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
  stap 7). Geef nooit een `localhost`-adres als opgeleverd resultaat.
- Lokaal is er geen deur: alles wat je lokaal ziet, ziet de vaste testgebruiker. Of een pad
  echt publiek is of achter de inlog staat, test je in `worker/` met een test, niet door
  lokaal te kijken.
- Zet nooit `OMGEVING=lokaal` ergens anders dan in `.dev.vars`, en zet nooit een sleutel
  van Cloudflare op deze computer. Kom je er een tegen, stop dan en zeg het.
