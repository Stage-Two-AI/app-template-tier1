#!/usr/bin/env node
/**
 * Schrijft de config voor het uploaden van een preview (zie `previewConfig` in
 * scripts/lib/cloudflare-config.mjs). Draait in preview-uitrollen.yml, altijd met de
 * wrangler.jsonc van main.
 *
 *   node scripts/preview-config.mjs <worker.js> <map-met-schermen> <uitvoer.json>
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cloudflareConfig, leesWrangler, previewConfig } from "./lib/cloudflare-config.mjs";

const [worker, assets, uitvoer] = process.argv.slice(2);
if (!worker || !assets || !uitvoer) {
  console.error(
    "Gebruik: node scripts/preview-config.mjs <worker.js> <map-met-schermen> <uitvoer.json>",
  );
  process.exit(1);
}
cloudflareConfig();
const config = previewConfig(leesWrangler(), { worker: resolve(worker), assets: resolve(assets) });
writeFileSync(uitvoer, `${JSON.stringify(config, null, 2)}\n`);
console.log(`✓ preview-config voor ${config.name} (opslag van env.preview uit main)`);
