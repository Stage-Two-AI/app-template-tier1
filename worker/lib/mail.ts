/**
 * Naar wie gaat een mail? Gebruik dit vóór elke verzending, met welke maildienst ook
 * (Resend, Postmark, Cloudflare Email). In test en lokaal staan er gegevens uit productie in
 * de database, dus ook echte mailadressen van klanten. Zonder deze stap krijgt een klant een
 * mail omdat iemand in de preview op een knop drukte.
 *
 * De regel:
 *   - productie (`OMGEVING` leeg of `productie`): de ontvangers blijven zoals ze zijn;
 *   - elders, met een testadres (`TESTMAIL_ADRES` in `wrangler.jsonc`): alleen naar dat adres,
 *     zonder cc en bcc, en met `[test] ` voor het onderwerp;
 *   - elders, zonder testadres: niet versturen (`null`).
 *
 *   const mail = bepaalOntvangers({ aan: klant.email, onderwerp: "Je bestelling" }, c.env);
 *   if (mail) await verstuur({ to: mail.aan, cc: mail.cc, subject: mail.onderwerp, ... });
 */

/** Alleen wat deze functie leest, zodat hij met elke `Env` werkt. */
export type MailOmgeving = { OMGEVING?: string; TESTMAIL_ADRES?: string };

export type Mail = {
  aan: string | string[];
  onderwerp: string;
  cc?: string | string[];
  bcc?: string | string[];
};

/** Wat je aan de maildienst geeft: altijd lijsten, ook bij één adres. */
export type Verzending = { aan: string[]; onderwerp: string; cc: string[]; bcc: string[] };

const ADRES = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lijst(waarde: string | string[] | undefined): string[] {
  const alle = Array.isArray(waarde) ? waarde : waarde ? [waarde] : [];
  return alle.map((a) => a.trim()).filter(Boolean);
}

/** Is dit productie? Alleen een lege `OMGEVING` of `productie`; al het andere is test. */
export function isProductie(env: MailOmgeving): boolean {
  return !env.OMGEVING || env.OMGEVING === "productie";
}

export function bepaalOntvangers(mail: Mail, env: MailOmgeving): Verzending | null {
  if (isProductie(env)) {
    return {
      aan: lijst(mail.aan),
      onderwerp: mail.onderwerp,
      cc: lijst(mail.cc),
      bcc: lijst(mail.bcc),
    };
  }
  const testadres = env.TESTMAIL_ADRES?.trim() ?? "";
  if (!ADRES.test(testadres)) return null;
  return { aan: [testadres], onderwerp: `[test] ${mail.onderwerp}`, cc: [], bcc: [] };
}
