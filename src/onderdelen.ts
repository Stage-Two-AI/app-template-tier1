/**
 * De onderdelen van deze app: elk hoofdscherm met zijn eigen pad. De startpagina (tegels of
 * een menu) kan deze lijst lezen, en de browsertest `e2e/onderdelen.spec.ts` opent elk
 * onderdeel en kijkt of het zonder fout opent en zijn kop toont.
 *
 * Een nieuw onderdeel krijgt hier een regel; de browsertest opent het dan vanzelf. Vergeet je
 * dat, dan wordt `tests/unit/onderdelen.test.ts` rood: die vergelijkt deze lijst met de routes
 * in src/.
 *
 * - `pad`: waar het onderdeel woont, bijvoorbeeld "/klanten".
 * - `naam`: hoe het onderdeel heet, zoals op de startpagina.
 * - `kop`: de kop (h1) van het hoofdscherm, als die anders is dan de naam.
 *
 * Dit bestand is van het project: de template levert alleen het voorbeeld. Deze app heeft nog
 * geen router (src/App.tsx toont één scherm); komt er een, dan krijgt elk hoofdpad hier een regel.
 */
export type Onderdeel = { pad: string; naam: string; kop?: string };

export const ONDERDELEN: Onderdeel[] = [{ pad: "/", naam: "Mijn lijst" }];

/**
 * Paden in de router die bewust geen onderdeel zijn, bijvoorbeeld een scherm dat je alleen
 * via een ander onderdeel bereikt.
 */
export const GEEN_ONDERDEEL: string[] = [];
