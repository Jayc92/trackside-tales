// =================== BEER PRESENTATION PACK (ADMIN-v7.4B.N.1) ===================
// Slug-keyed presentation supplements for the production beer adapter.
//
// Production's `public.beers` table owns operational/content fields
// (name, style, abv, ibu, category, short_description, description,
// can_image_url, sort_order). It does NOT carry the public app's:
//
//   * `abbr` — short uppercase label rendered on the beer can art
//              ("STEEL ALE", "SIGNALMAN", "W.A.")
//   * curated base64 can image when `can_image_url` is null
//   * optional `tapStatus` ('on-tap' | 'retired' | 'coming-soon')
//
// The production diagnostic confirmed all 8 active+published beer
// rows have `can_image_url = null` today, so the pack's
// `imageFallback` is load-bearing — every rendered beer card pulls
// its image from here until admin uploads land.
//
// Strategy mirrors talePresentationPack.ts:
//   * Pack keyed by production slug (NOT public-app slug — beers
//     have no separate slug rename map; production = public).
//   * Adapter looks up the pack; unknown slugs are dropped with a
//     console.warn rather than rendered as broken cards.
//   * Pack does NOT own production-editable content. The admin
//     editing name/style/abv/ibu/description does not require
//     touching this file.
//
// What this module does NOT do:
//   * Mutate any state.
//   * Touch QR validation, localStorage keys, badge keys, or game
//     mechanics.
//   * Issue any network request.

import { CAN_IMAGES } from '../data/canImages';

export interface BeerPresentationPack {
  /**
   * Short uppercase label rendered as the can-art badge. Production
   * has no `abbr` column today; admins editing beer names won't
   * affect this until a future schema phase surfaces the field.
   */
  abbr:           string;

  /**
   * Base64-encoded fallback can image. Used when production's
   * `can_image_url` is null or empty (today: every row).
   *
   * For production slugs that do not have a dedicated brand-art
   * asset in CAN_IMAGES (e.g. `conductors-kolsch`), we route to the
   * closest visual analogue rather than inventing a new asset.
   * Document the choice on the entry.
   */
  imageFallback:  string;

  /**
   * Optional tap state. The Beer type defines this optional field;
   * the MenuPage doesn't currently branch on its value, but the
   * adapter should pass it through so any future tap-state-aware
   * rendering works without an additional schema migration.
   *
   * Only set for regulars locally. NAs / tale-category beers leave
   * this undefined.
   */
  tapStatus?:     'on-tap' | 'retired' | 'coming-soon';
}

/**
 * Pack keyed by production slug. The N.1 diagnostic confirmed 8
 * active+published rows with these exact slugs:
 *
 *   wa-lager, packer-pilsner, wooden-match-amber           (category=tale     → regular)
 *   trackside-lager, bethlehem-steel-ale, 610-pilsner      (category=resident → regular)
 *   conductors-kolsch, signalmans-citrus-wheat             (category=na       → non-alc)
 *
 * Adding a 9th beer in production:
 *   1. Admin creates the row (any slug they want).
 *   2. First app load with the new row visible: adapter logs
 *      `[trackside] Remote beer slug "<X>" has no presentation pack`
 *      and drops that row. The other 8 still render.
 *   3. A small PR adds the new entry to this map.
 *
 * No silent visual regression. No crash. Operators see the warning
 * in the deployed bundle's console; engineers see it in local-dev
 * validation builds.
 */
const PACK_BY_SLUG: Record<string, BeerPresentationPack> = {
  // Tale-tier beers (category=tale, sort_order 10/20/30).
  // These render in the menu as standalone Beer cards independently
  // from the Tale detail pages. The can-art assets are the same
  // ones the Tale system uses internally.
  'wa-lager': {
    abbr:          'W.A.',
    imageFallback: CAN_IMAGES.WA_LAGER,
  },
  'packer-pilsner': {
    abbr:          'PACKER',
    imageFallback: CAN_IMAGES.PACKER,
  },
  'wooden-match-amber': {
    abbr:          'WOODEN MATCH',
    imageFallback: CAN_IMAGES.WOODEN_MATCH,
  },

  // Resident-tier beers (category=resident, sort_order 40/50/60).
  // The local public app already rendered these three under the
  // canonical names "TRACKSIDE" / "STEEL ALE" / "610".
  'trackside-lager': {
    abbr:          'TRACKSIDE',
    imageFallback: CAN_IMAGES.TRACKSIDE,
    tapStatus:     'on-tap',
  },
  'bethlehem-steel-ale': {
    abbr:          'STEEL ALE',
    imageFallback: CAN_IMAGES.BETHLEHEM,
    tapStatus:     'on-tap',
  },
  '610-pilsner': {
    abbr:          '610',
    imageFallback: CAN_IMAGES.SIX10,
    tapStatus:     'on-tap',
  },

  // Non-alcoholic beers (category=na, sort_order 70/80).
  // signalmans-citrus-wheat already had local brand art; the
  // adapter routes to its dedicated CAN_IMAGES entry.
  //
  // conductors-kolsch is a production-only beer with no dedicated
  // brand asset in CAN_IMAGES.
  //
  // N.1.1 fallback decision (revised from N.1):
  //   The N.2 local validation surfaced that the prior fallback —
  //   reusing CAN_IMAGES.ROUNDHOUSE — was visually misleading
  //   because the Roundhouse Red can artwork prominently shows the
  //   text "Roundhouse Red". A user looking at the Conductor's
  //   Kölsch card would read a different beer's name on the can.
  //
  //   N.1.1 sets `imageFallback` to an empty string instead. The
  //   public app's BeerArt component (MenuPage.tsx) already
  //   handles the empty-image case: when `image` is falsy, the
  //   card renders a text-only fallback inside
  //   `<span class="ts-beer-card__art-fallback">{abbr || name}</span>`
  //   — preserving the card's footprint and dimensions, but
  //   showing "CONDUCTOR" as the can-art well's content instead
  //   of a mislabeled image. This is the existing built-in
  //   no-image rendering path; no new asset, no new component,
  //   no new code.
  //
  //   The moment production carries a real `can_image_url` for
  //   this slug, the adapter prefers production and ignores this
  //   fallback (per the `remoteImage || pack.imageFallback`
  //   chain in mapProdBeerRow). The empty-string fallback is
  //   intentional and explicit, not a silent regression.
  'conductors-kolsch': {
    abbr:          'CONDUCTOR',
    // FALLBACK (N.1.1): empty string → BeerArt renders the
    // text-only "CONDUCTOR" label in the can-art well instead of
    // showing another beer's labeled can. Honest "no can art
    // available yet" presentation. Replace with a real asset
    // (either a new CAN_IMAGES entry or a production
    // can_image_url) when one becomes available.
    imageFallback: '',
  },
  'signalmans-citrus-wheat': {
    abbr:          'SIGNALMAN',
    imageFallback: CAN_IMAGES.SIGNALMANS,
  },
};

/**
 * Look up the presentation pack for a production slug. Returns
 * null if we don't have one — adapters should drop the row with a
 * console warning rather than render a broken card.
 */
export function getBeerPresentationPack(slug: string): BeerPresentationPack | null {
  return PACK_BY_SLUG[slug] ?? null;
}
