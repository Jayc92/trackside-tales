// ================== SCAN SLUG TRANSLATION (PUBLIC-v7.4B.P.15a) ==================
// The validate-qr Edge Function returns the canonical PRODUCTION Tale
// slug (from the tales table). The public app, however, keys curated
// Tales by their historical short-form APP ids (PROD_TO_APP_SLUG in
// talePresentationPack.ts):
//
//   production 'packer-pilsner'     → app id 'packer-pils'
//   production 'wooden-match-amber' → app id 'wooden-match'
//   production 'wa-lager'           → app id 'wa-lager' (identical)
//
// P.13b's scan path matched the server-returned production slug
// directly against the loaded tales' app ids, so server-valid scans
// of the two renamed curated codes fell into the fail-closed
// "TALE NOT AVAILABLE" branch and never unlocked. Generic
// admin-created Tales were unaffected (their app id IS the production
// slug).
//
// This helper is the single translation point for the scan path. It
// REUSES appSlugFromProdSlug — the one canonical alias map — rather
// than duplicating it, and passes unknown (generic) slugs through
// unchanged.

import { appSlugFromProdSlug } from './talePresentationPack';

/**
 * Translate a validator-returned canonical production Tale slug into
 * the app-side Tale id used for lookup, unlock persistence, and
 * navigation. Curated aliases translate; every other slug (all
 * generic admin-created Tales) passes through unchanged.
 */
export function resolveScannedTaleAppId(productionTaleSlug: string): string {
  return appSlugFromProdSlug(productionTaleSlug) ?? productionTaleSlug;
}

// ---- dev-time regression guard (P.15a) -------------------------------------
// There is no test framework in this repo, so the translation contract
// is asserted at module load in dev builds only (`import.meta.env.DEV`
// is compile-time false in production builds, so this block is
// tree-shaken out of the deployed bundle). If the curated alias map
// drifts, `vite dev` fails loudly instead of silently re-breaking the
// printed curated QR codes.
if (import.meta.env.DEV) {
  const expectedTranslations: ReadonlyArray<readonly [string, string]> = [
    ['packer-pilsner',     'packer-pils'],
    ['wooden-match-amber', 'wooden-match'],
    ['wa-lager',           'wa-lager'],
    ['test-this-jawn',     'test-this-jawn'],   // generic: passes through
    ['some-future-tale',   'some-future-tale'], // unknown: passes through
  ];
  for (const [productionSlug, expectedAppId] of expectedTranslations) {
    const actualAppId = resolveScannedTaleAppId(productionSlug);
    if (actualAppId !== expectedAppId) {
      throw new Error(
        `[trackside] P.15a scan slug translation regression: ${productionSlug} → ${actualAppId} (expected ${expectedAppId})`,
      );
    }
  }
}
