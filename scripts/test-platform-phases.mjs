// Phase 2+ checks, run by scripts/test-platform.mjs with its fixture already in place.
import assert from 'node:assert/strict';
import fs from 'node:fs';

export default async function (h) {
  for (const file of fs.readdirSync(new URL('./tests/', import.meta.url)).filter((f) => /^phase\d+[a-z]?\.mjs$/.test(f)).sort()) {
    await (await import(new URL(`./tests/${file}`, import.meta.url).href)).default(h, assert);
  }
}
