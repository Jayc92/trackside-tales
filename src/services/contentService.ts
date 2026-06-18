// ================== CONTENT SERVICE (ADMIN-v6.4 + v7.4B.M.5.1 + v7.4B.M.5.2.2) ==================
// Read-only remote content loader. Fetches published+active rows
// from Supabase and maps them into the public app's existing
// `Tale`, `Beer`, and `FoodItem` shapes.
//
// Behavior contract — by design:
//   * Local content (LOCAL_TALES / LOCAL_REGULARS / LOCAL_NON_ALC /
//     LOCAL_FOOD) is the source of truth at first render. Every
//     fetcher below returns null when remote content is unavailable
//     or malformed; AppContext keeps the local arrays in that case.
//   * Per-category gates (M.5.2.2): each fetcher short-circuits to
//     null unless its USE_REMOTE_<CATEGORY> flag is true. Each flag
//     requires Supabase URL+anon key configured AND the matching
//     VITE_USE_REMOTE_<CATEGORY> env var set to the literal string
//     'true'. All flags default to false. Categories are
//     independent: enabling Tales does not enable beers, food, or
//     rewards. See supabaseClient.ts for the flag definitions.
//   * Fetch errors, network failures, and RLS misconfiguration all
//     surface as `null` — never as a thrown exception that could
//     bubble into a render and blank the app.
//   * Per-row validation drops malformed rows. If zero rows survive
//     validation, the fetcher returns null (do not partially blank
//     a section).
//   * `tales.can_image_url` and `beers.can_image_url` are nullable
//     in the schema; until image uploads land, we bridge to the
//     local base64 `CAN_IMAGES` lookup so swapping to remote does
//     not produce empty cans.
//
// ADMIN-v7.4B.M.5.1 (Tale adapter):
//   The Tale read path is a hybrid adapter. Production's
//   `public.tales` carries scalar metadata + `timeline`/`map_points`
//   jsonb but does NOT carry the rich Tale fields the public app
//   renders today (abbr, person, scanBadge, gameBadge, barSummary,
//   stillHere, image, full game-config copy). The adapter:
//
//     1. Reads only the columns production actually has (10 scalars
//        + 2 jsonb arrays + 1 text = `story_body`).
//     2. Renames production slugs → public-app slugs via
//        talePresentationPack.PROD_TO_APP_SLUG (production carries
//        long forms `packer-pilsner` / `wooden-match-amber`; the
//        rest of the public app keys on short forms `packer-pils` /
//        `wooden-match` for QR / localStorage / badges / routes /
//        game configs / unlock modal — none of those are renamed).
//     3. Drops rows whose post-rename slug has no presentation pack
//        (with console warning), so an unknown production tale
//        never crashes the page.
//     4. Wraps `story_body` text into a single StoryBlock paragraph
//        (the canonical app type expects an array of blocks). When
//        story_body is blank, falls back to LOCAL_TALES.story[].
//     5. Validates production `timeline` and `map_points` jsonb
//        against the canonical TimelineEvent / MapPin shape; falls
//        back to LOCAL_TALES values if the array is empty/malformed.
//     6. Validates production `mini_game_type` matches the local
//        GameConfig.type. The full game config (title, instructions,
//        success copy) always comes from the presentation pack.
//     7. Everything else (abbr, style, abv, ibu, tagline, icon,
//        unlockSeal, person, personBio, mapTitle, scanBadge,
//        gameBadge, barSummary, stillHere, image) is read from the
//        slug-keyed presentation pack — same content the app
//        renders today when remote is disabled.
//
//   Net effect: when USE_REMOTE_TALES is enabled (per the M.5.2.2
//   per-category flag — see supabaseClient.ts), production's
//   editable fields (title/year/chapter/tap_status/timeline/
//   map_points/story_body) become live; everything else stays
//   presentationally identical to the all-local mode.
//
// This service is read-only by phase rule. No writes (badges,
// events, guest progress) belong here — those will be wired through
// edge functions in ADMIN-v6.5.

import {
  Tale,
  Beer,
  FoodItem,
  StoryBlock,
  MapPin,
  TimelineEvent,
} from '../app/types';
import {
  supabaseFetch,
  USE_REMOTE_TALES,
  USE_REMOTE_BEERS,
  USE_REMOTE_FOOD,
  USE_REMOTE_REWARDS,
} from './supabaseClient';
import { LOCAL_TALES } from '../data/tales';
import { LOCAL_REGULARS, LOCAL_NON_ALC } from '../data/menu';
import {
  appSlugFromProdSlug,
  getPresentationPack,
} from './talePresentationPack';

// ------------ image fallback bridge ------------
// Remote rows do not yet carry CDN image URLs. Until they do, we
// fall back to the embedded base64 cans from src/data/canImages.ts
// via the local Tale/Beer arrays. Keying:
//   * tales:  the M.5.1 adapter pulls `image` from the presentation
//             pack keyed by public-app slug (talePresentationPack.ts).
//             No bridge needed in this file.
//   * beers:  display name (LOCAL_REGULARS / LOCAL_NON_ALC have no
//             slug field today; name is stable + unique).

const LOCAL_BEER_IMAGE_BY_NAME: Record<string, string> = [
  ...LOCAL_REGULARS,
  ...LOCAL_NON_ALC,
].reduce(
  (acc, b) => {
    acc[b.name] = b.image;
    return acc;
  },
  {} as Record<string, string>,
);

// ------------ defensive type guards ------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asStringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asArrayOfObj(v: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter(isObj);
}

// ------------ row mappers ------------

function mapPins(v: unknown): MapPin[] {
  const rows = asArrayOfObj(v) ?? [];
  const out: MapPin[] = [];
  for (const r of rows) {
    const x = asNumber(r.x);
    const y = asNumber(r.y);
    const label = asString(r.label);
    const year = asString(r.year);
    const title = asString(r.title);
    const desc = asString(r.desc);
    if (x === null || y === null || !label || !year || !title || !desc) continue;
    out.push({ x, y, label, year, title, desc });
  }
  return out;
}

function mapTimeline(v: unknown): TimelineEvent[] {
  const rows = asArrayOfObj(v) ?? [];
  const out: TimelineEvent[] = [];
  for (const r of rows) {
    const year = asString(r.year);
    const event = asString(r.event);
    const detail = asString(r.detail);
    if (!year || !event || !detail) continue;
    const ev: TimelineEvent = { year, event, detail };
    if (r.major === true) ev.major = true;
    out.push(ev);
  }
  return out;
}

/**
 * Wrap the production `story_body` text column into a single
 * StoryBlock paragraph. Production schema stores story prose as
 * one TEXT column; the public app renders an array of typed
 * blocks (`p` | `quote` | `h2` | `h3`). M.5.1 maps the simplest
 * possible shape: one paragraph block holding the entire body.
 *
 * If story_body is blank/null, returns an empty array; the caller
 * (mapTaleRow) falls back to the presentation pack's local story.
 */
function wrapStoryBody(v: unknown): StoryBlock[] {
  if (typeof v !== 'string') return [];
  const text = v.trim();
  if (text.length === 0) return [];
  return [{ type: 'p', text }];
}

/**
 * Adapter: production tales row → public-app Tale.
 *
 * Production carries: slug (long form), name, title, year,
 * chapter_label, story_body, timeline (jsonb), map_points (jsonb),
 * tap_status, mini_game_type, sort_order, status, is_active,
 * updated_at. Plus a few unused-by-app fields (subtitle,
 * person_or_place, intro_type, intro_asset_url, stamp_image_url,
 * id, beer_id, venue_id, created_at).
 *
 * The presentation pack supplies: abbr, style, abv, ibu, tagline,
 * icon, unlockSeal, person, personBio, mapTitle, scanBadge,
 * gameBadge, barSummary, stillHere, image, full game-config copy.
 *
 * Drop conditions:
 *   * Missing or non-string slug.
 *   * Missing or non-string name OR title (the canonical Tale type
 *     requires both; we won't fabricate them from the local pack).
 *   * Production slug not in PROD_TO_APP_SLUG (unknown new tale).
 *   * Public-app slug has no presentation pack
 *     (LOCAL_TALES doesn't contain it — should be unreachable
 *     because PROD_TO_APP_SLUG and LOCAL_TALES are aligned, but
 *     defensive).
 *   * Production `mini_game_type` does not match the local
 *     game.type (e.g. production says 'spike' for wa-lager, which
 *     is hardcoded as 'grid' in the Allen Town game). Mismatch
 *     would break the GameOverlay's switch statement; safer to
 *     drop than to render a broken game.
 *
 * Each drop logs a console.warn so operators can debug without
 * crashing the page.
 */
function mapTaleRow(row: Record<string, unknown>): Tale | null {
  const prodSlug = asString(row.slug);
  const name     = asString(row.name);
  const title    = asString(row.title);
  if (!prodSlug || !name || !title) return null;

  const appSlug = appSlugFromProdSlug(prodSlug);
  if (!appSlug) {
    console.warn(
      `[trackside] Remote tale slug "${prodSlug}" is not in the presentation slug map — dropping row.`,
    );
    return null;
  }

  const pack = getPresentationPack(appSlug);
  if (!pack) {
    console.warn(
      `[trackside] Remote tale slug "${prodSlug}" → app slug "${appSlug}" has no presentation pack — dropping row.`,
    );
    return null;
  }

  // Game-type guard: production's mini_game_type must match the
  // local pack's game.type. Mismatch indicates a content edit that
  // would break GameOverlay's component dispatch — drop the row.
  const miniGameType = asString(row.mini_game_type);
  if (miniGameType !== null && miniGameType !== pack.game.type) {
    console.warn(
      `[trackside] Remote tale "${prodSlug}" mini_game_type="${miniGameType}" disagrees with local game.type="${pack.game.type}" — dropping row.`,
    );
    return null;
  }

  // Tap status: production CHECK constraint already restricts the
  // value; the type guard mirrors the canonical enum. Falls back to
  // 'on-tap' for any unexpected value (including NULL).
  const tapStatusRaw = asString(row.tap_status);
  const tapStatus: Tale['tapStatus'] =
    tapStatusRaw === 'on-tap' || tapStatusRaw === 'retired' || tapStatusRaw === 'coming-soon'
      ? tapStatusRaw
      : 'on-tap';

  // Story: production stores story_body as one text column; wrap
  // into a single paragraph block. If story_body is blank, fall
  // back to the local story array (which carries multiple typed
  // blocks including quotes and inline HTML emphasis).
  const wrappedStory = wrapStoryBody(row.story_body);
  const story = wrappedStory.length > 0 ? wrappedStory : pack.fallbackStory;

  // Timeline: prefer production jsonb if it validates as ≥1 event;
  // otherwise local fallback. mapTimeline drops malformed entries.
  const remoteTimeline = mapTimeline(row.timeline);
  const timeline = remoteTimeline.length > 0 ? remoteTimeline : pack.fallbackTimeline;

  // Map points: same posture as timeline.
  const remotePins = mapPins(row.map_points);
  const pins = remotePins.length > 0 ? remotePins : pack.fallbackPins;

  return {
    id:          appSlug,
    name,
    abbr:        pack.abbr,
    image:       pack.image,
    style:       pack.style,
    abv:         pack.abv,
    ibu:         pack.ibu,
    tagline:     pack.tagline,
    icon:        pack.icon,
    unlockSeal:  pack.unlockSeal,
    person:      pack.person,
    personBio:   pack.personBio,
    chapter:     asStringOr(row.chapter_label, ''),
    year:        asStringOr(row.year, ''),
    title,
    story,
    mapTitle:    pack.mapTitle,
    pins,
    timeline,
    scanBadge:   pack.scanBadge,
    gameBadge:   pack.gameBadge,
    game:        pack.game,
    tapStatus,
    // Production has no `retired_date` column today; the Tale type
    // allows null and the detail page renders it conditionally.
    retiredDate: null,
    barSummary:  pack.barSummary,
    stillHere:   pack.stillHere,
  };
}

function mapBeerRow(row: Record<string, unknown>): Beer | null {
  const name = asString(row.name);
  if (!name) return null;

  // Image fallback: prefer remote, otherwise local base64 keyed by name.
  const remoteImage = asString(row.can_image_url);
  const image = remoteImage || LOCAL_BEER_IMAGE_BY_NAME[name] || '';
  if (!image) return null;

  const beer: Beer = {
    name,
    abbr: asStringOr(row.abbr, ''),
    image,
    style: asStringOr(row.style, ''),
    abv: asStringOr(row.abv, ''),
    ibu: asStringOr(row.ibu, ''),
  };
  const tasting = asString(row.tasting);
  if (tasting) beer.tasting = tasting;
  // The local Beer type carries an optional tapStatus on regulars; we
  // do not currently track tap state on beers in the schema (tap_list
  // is a separate live-pour table). Leave tapStatus undefined for now;
  // ADMIN-v6.5+ will reconcile.
  return beer;
}

function mapFoodRow(row: Record<string, unknown>): FoodItem | null {
  const name = asString(row.name);
  if (!name) return null;
  // Schema uses `description`; local app type uses `desc`.
  const desc = asString(row.description);
  return { name, desc: desc ?? '' };
}

// ------------ public fetchers ------------

// M.5.1: production-safe column subset only. The earlier canonical
// SELECT (abbr, abv, ibu, style, tagline, icon, unlock_seal,
// scan_badge, game_badge, game, bar_summary, still_here, person,
// person_bio, map_title, hero_image_url, can_image_url, retired_date,
// display_order) referenced columns absent from production
// public.tales — flipping USE_REMOTE_TALES on would have produced
// PostgREST 42703 errors. The adapter pulls those fields from the
// presentation pack instead. Production-only columns we read here:
//   * slug             — primary key; renamed via PROD_TO_APP_SLUG
//   * name, title      — required by the canonical Tale type
//   * year             — rendered in hero header
//   * chapter_label    — production's name for canonical `chapter`
//   * story_body       — text; wrapped into one StoryBlock paragraph
//   * timeline         — jsonb; production's M.2 editor matches shape
//   * map_points       — jsonb; production's M.2 editor matches shape
//   * tap_status       — enum; matches Tale['tapStatus'] verbatim
//   * mini_game_type   — guard against game-type drift
const TALE_SELECT =
  'slug,name,title,year,chapter_label,story_body,' +
  'timeline,map_points,tap_status,mini_game_type,sort_order,updated_at';

const BEER_SELECT =
  'slug,name,abbr,category,style,abv,ibu,tasting,can_image_url,display_order';

const FOOD_SELECT = 'slug,name,description,display_order';

const REWARD_TIER_SELECT = 'id,name,stamps_required,perks';

// RLS already filters to is_active+status='published' for tales/beers/food
// and to is_active for reward_tiers, but we pass the filters explicitly
// so the request is correct against any anon-read environment that has
// not yet enabled RLS (e.g. a future staging project mid-bootstrap).
const PUBLISHED_FILTER = 'is_active=eq.true&status=eq.published';

export async function fetchRemoteTales(): Promise<Tale[] | null> {
  // M.5.2.2: gated on the per-category USE_REMOTE_TALES flag, not
  // the global Supabase-configured boolean. Tales can be enabled
  // independently of beers, food, or reward tiers.
  if (!USE_REMOTE_TALES) return null;
  try {
    const rows = (await supabaseFetch(
      'tales',
      // M.5.1: order by `sort_order` (production column) instead of
      // canonical `display_order` (which doesn't exist on prod).
      `select=${TALE_SELECT}&${PUBLISHED_FILTER}&order=sort_order.asc`,
    )) as unknown;
    if (!Array.isArray(rows)) return null;
    const mapped = rows
      .map((r) => (isObj(r) ? mapTaleRow(r) : null))
      .filter((t): t is Tale => t !== null);
    return mapped.length > 0 ? mapped : null;
  } catch (err) {
    console.warn('[trackside] Remote tales unavailable — using local fallback', err);
    return null;
  }
}

async function fetchRemoteBeersByCategory(
  category: 'regular' | 'non-alc',
): Promise<Beer[] | null> {
  // M.5.2.2: gated on USE_REMOTE_BEERS. Both regular and non-alc
  // beer fetchers funnel through this helper, so a single flag
  // covers both categories. Production's `beers` table currently
  // doesn't carry the canonical SELECT column set this fetcher
  // expects (production has short_description / description /
  // sort_order; this fetcher's BEER_SELECT references abbr /
  // tasting / display_order). Flipping USE_REMOTE_BEERS on against
  // current production would produce PostgREST 400. Keep this off
  // until a future M.5.3 phase reconciles the beer adapter.
  if (!USE_REMOTE_BEERS) return null;
  try {
    const rows = (await supabaseFetch(
      'beers',
      `select=${BEER_SELECT}&${PUBLISHED_FILTER}&category=eq.${category}&order=display_order.asc`,
    )) as unknown;
    if (!Array.isArray(rows)) return null;
    const mapped = rows
      .map((r) => (isObj(r) ? mapBeerRow(r) : null))
      .filter((b): b is Beer => b !== null);
    return mapped.length > 0 ? mapped : null;
  } catch (err) {
    console.warn(
      `[trackside] Remote beers (${category}) unavailable — using local fallback`,
      err,
    );
    return null;
  }
}

export function fetchRemoteRegulars(): Promise<Beer[] | null> {
  return fetchRemoteBeersByCategory('regular');
}

export function fetchRemoteNonAlc(): Promise<Beer[] | null> {
  return fetchRemoteBeersByCategory('non-alc');
}

export async function fetchRemoteFood(): Promise<FoodItem[] | null> {
  // M.5.2.2: gated on USE_REMOTE_FOOD. Production's food_items
  // table currently carries only id, name, category, is_active,
  // updated_at — this fetcher's FOOD_SELECT references slug,
  // description, display_order which don't exist. Flipping
  // USE_REMOTE_FOOD on against current production would produce
  // PostgREST 400. Keep this off until a future M.5.4 phase
  // reconciles the food adapter.
  if (!USE_REMOTE_FOOD) return null;
  try {
    const rows = (await supabaseFetch(
      'food',
      `select=${FOOD_SELECT}&${PUBLISHED_FILTER}&order=display_order.asc`,
    )) as unknown;
    if (!Array.isArray(rows)) return null;
    const mapped = rows
      .map((r) => (isObj(r) ? mapFoodRow(r) : null))
      .filter((f): f is FoodItem => f !== null);
    return mapped.length > 0 ? mapped : null;
  } catch (err) {
    console.warn('[trackside] Remote food unavailable — using local fallback', err);
    return null;
  }
}

// ------------ reward tiers (placeholder export for ADMIN-v6.8) ------------
// Not yet consumed by any UI component. Exported so future work can
// import without re-adding plumbing. RLS allows anon read where
// is_active=true.

export interface RewardTier {
  id: number;
  name: string;
  stampsRequired: number;
  perks: string[];
}

function mapRewardTierRow(row: Record<string, unknown>): RewardTier | null {
  const id = asNumber(row.id);
  const name = asString(row.name);
  const stampsRequired = asNumber(row.stamps_required);
  if (id === null || !name || stampsRequired === null) return null;
  const perksRaw = row.perks;
  const perks: string[] = Array.isArray(perksRaw)
    ? perksRaw.filter((p): p is string => typeof p === 'string')
    : [];
  return { id, name, stampsRequired, perks };
}

export async function fetchRemoteRewardTiers(): Promise<RewardTier[] | null> {
  // M.5.2.2: gated on USE_REMOTE_REWARDS. Reward-tier shape
  // alignment hasn't been validated against production yet (the
  // reward_tiers table is a v6.8 placeholder per the comment
  // above), so keep this off until a future phase confirms.
  if (!USE_REMOTE_REWARDS) return null;
  try {
    const rows = (await supabaseFetch(
      'reward_tiers',
      `select=${REWARD_TIER_SELECT}&is_active=eq.true&order=stamps_required.asc`,
    )) as unknown;
    if (!Array.isArray(rows)) return null;
    const mapped = rows
      .map((r) => (isObj(r) ? mapRewardTierRow(r) : null))
      .filter((t): t is RewardTier => t !== null);
    return mapped.length > 0 ? mapped : null;
  } catch (err) {
    console.warn('[trackside] Remote reward tiers unavailable — keeping local-only', err);
    return null;
  }
}
