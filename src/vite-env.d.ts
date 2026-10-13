/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `test` in de preview: de app toont dan de testbalk. Zie src/lib/env.ts. */
  readonly VITE_OMGEVING?: string;
  /** Publiek: waar fouten naartoe gaan (Sentry). Leeg = uit. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
