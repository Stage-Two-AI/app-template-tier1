import { z } from "zod";

/**
 * Alles wat van buiten komt (formulieren, webhooks, API's) gaat door Zod. In de schermen voor
 * een nette melding; in de servercode (worker/) nog een keer, want de browser is geen
 * beveiliging.
 */
export const itemInputSchema = z.object({
  titel: z
    .string()
    .trim()
    .min(1, "Geef een omschrijving op.")
    .max(120, "Houd het bij maximaal 120 tekens."),
});

export type ItemInput = z.infer<typeof itemInputSchema>;
