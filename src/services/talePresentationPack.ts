// =================== TALE PRESENTATION PACK (ADMIN-v7.4B.M.5.1) ===================
// Slug translation + local presentation lookup for the remote-content
// adapter. The production `public.tales` table carries scalar metadata,
// `timeline` (jsonb), and `map_points` (jsonb) — but does NOT carry the
// rich Tale fields the public app renders today (abbr, style, abv, ibu,
// tagline, icon, unlockSeal, person, personBio, mapTitle, scanBadge,
// gameBadge, barSummary, stillHere, image, full game config copy).
//
// Strategy:
//   * Production rows are the source of truth for: id (after slug
//     rename), name, title, year, chapter, story (text → single
//     paragraph block), pins, timeline, tapStatus.
//   * Everything else comes from a slug-keyed local lookup derived
//     from LOCAL_TALES — the same data the app renders when remote
//     content is disabled.
//   * Production carries long-form slugs (`packer-pilsner`,
//     `wooden-match-amber`); the public app's QR codes, localStorage,
//     badges, routes, and game configs all key on short-form slugs
//     (`packer-pils`, `wooden-match`). The adapter renames at read
//     time; the rest of the app never sees production slugs.
//
// What this module does NOT do:
//   * Mutate any state.
//   * Touch QR validation, localStorage keys, badge keys, or game
//     mechanics.
//   * Introduce a public-app slug rename (DEMO_TALE_IDS,
//     gameConfigs.taleId, UnlockStampModal switches all stay as-is).
//   * Add new public-app routes.

import { Tale, GameConfig } from '../app/types';
import { LOCAL_TALES } from '../data/tales';

// ------------ slug translation -------------------------------------
// Production slug → public-app slug. The public app keeps its
// existing short forms (`wa-lager`, `packer-pils`, `wooden-match`).
// If production ever adds a tale we don't have a presentation pack
// for, the adapter drops it (see getPresentationPack below).
//
// CRITICAL: do NOT rename keys/values here without reviewing every
// downstream consumer (qrValidation.ts DEMO_TALE_IDS, gameConfigs
// taleId, BADGE_KEY_*, route handlers, UnlockStampModal switches,
// localStorage keys). The whole adapter exists to avoid those
// renames.

const PROD_TO_APP_SLUG: Record<string, string> = {
  'wa-lager':           'wa-lager',
  'packer-pilsner':     'packer-pils',
  'wooden-match-amber': 'wooden-match',
};

/**
 * Translate a production slug into the public-app slug. Returns null
 * for slugs we don't recognize — callers should drop the row and
 * log a warning.
 */
export function appSlugFromProdSlug(prodSlug: string): string | null {
  return PROD_TO_APP_SLUG[prodSlug] ?? null;
}

// ------------ presentation pack ------------------------------------
// The set of fields production doesn't carry, derived from the
// existing LOCAL_TALES content. Keys are public-app slugs (post
// rename), so callers must translate first via appSlugFromProdSlug.
//
// Building this from LOCAL_TALES (rather than duplicating values
// in this file) keeps the local content single-sourced: the same
// strings the app renders today when remote is disabled.

export interface TalePresentationPack {
  // Scalar metadata not on production tales today.
  abbr:        string;
  style:       string;
  abv:         string;
  ibu:         string;
  tagline:     string;
  icon:        string;
  unlockSeal:  string;

  // Person + bio (production has `person_or_place` text but not the
  // structured PersonInfo shape; defer until production widens).
  person:      Tale['person'];
  personBio:   string;

  // Map title (production has `map_points` jsonb but not the title).
  mapTitle:    string;

  // Badges (production has no scan_badge / game_badge columns).
  scanBadge:   Tale['scanBadge'];
  gameBadge:   Tale['gameBadge'];

  // Bar summary + still here (production has no bar_summary /
  // still_here columns).
  barSummary:  Tale['barSummary'];
  stillHere:   Tale['stillHere'];

  // Image (production has `stamp_image_url` but the public app's
  // image slot is the local base64 can image).
  image:       string;

  // Game copy (production has `mini_game_type` but not the title /
  // instructions / success copy).
  game:        GameConfig;

  // Local fallback for story when production `story_body` is blank
  // and timeline/pins when production jsonb arrays don't validate.
  // Used only as last-resort fallbacks; production values win when
  // present and well-shaped.
  fallbackStory:    Tale['story'];
  fallbackTimeline: Tale['timeline'];
  fallbackPins:     Tale['pins'];
}

const PACK_BY_APP_SLUG: Record<string, TalePresentationPack> = LOCAL_TALES.reduce(
  (acc, t) => {
    acc[t.id] = {
      abbr:             t.abbr,
      style:            t.style,
      abv:              t.abv,
      ibu:              t.ibu,
      tagline:          t.tagline,
      icon:             t.icon,
      unlockSeal:       t.unlockSeal,
      person:           t.person,
      personBio:        t.personBio,
      mapTitle:         t.mapTitle,
      scanBadge:        t.scanBadge,
      gameBadge:        t.gameBadge,
      barSummary:       t.barSummary,
      stillHere:        t.stillHere,
      image:            t.image,
      game:             t.game,
      fallbackStory:    t.story,
      fallbackTimeline: t.timeline,
      fallbackPins:     t.pins,
    };
    return acc;
  },
  {} as Record<string, TalePresentationPack>,
);

/**
 * Look up the presentation pack for a public-app slug. Returns null
 * if we don't have one — callers should drop the production row
 * and log a warning rather than render a broken tale.
 */
export function getPresentationPack(appSlug: string): TalePresentationPack | null {
  return PACK_BY_APP_SLUG[appSlug] ?? null;
}
