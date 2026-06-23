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
// LOCAL_REGULARS / LOCAL_NON_ALC are no longer imported here.
// ADMIN-v7.4B.N.1 removed the name-keyed LOCAL_BEER_IMAGE_BY_NAME
// bridge in favour of the slug-keyed beerPresentationPack. The
// AppContext still imports those local arrays directly as its
// first-render fallback.
import {
  appSlugFromProdSlug,
  getPresentationPack,
} from './talePresentationPack';
import {
  getBeerPresentationPack,
} from './beerPresentationPack';

// ------------ image fallback bridge ------------
// Remote rows do not yet carry CDN image URLs. Until they do, we
// fall back to the embedded base64 cans from src/data/canImages.ts
// via slug-keyed presentation packs:
//   * tales:  the M.5.1 adapter pulls `image` from the public-app
//             slug presentation pack (talePresentationPack.ts).
//   * beers:  the N.1 adapter pulls the can-art fallback from the
//             production-slug-keyed beerPresentationPack.ts. The
//             previous name-keyed bridge was removed — N.1 keys
//             entirely on slug to handle production beers that have
//             no matching local entry (e.g. conductors-kolsch).

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

// ------------ N.1 beer adapter helpers ------------

/**
 * Classify a production `category` value into one of three
 * partition outcomes:
 *   'resident'         — render in the Menu's Resident tab as a
 *                        Beer card via fetchRemoteRegulars().
 *   'non-alc'          — render in the Menu's N/A tab as a Beer
 *                        card via fetchRemoteNonAlc().
 *   'handled-by-tales' — VALID row, but the Menu's Tales tab
 *                        renders these beers from Tale[] (via the
 *                        separate fetchRemoteTales pipeline,
 *                        keyed on `tale.id` with unlock state and
 *                        scan-story navigation). Exposing the
 *                        same content as Beer[] in the Resident
 *                        tab would render each tale-linked beer
 *                        twice in the menu — once as a Tale card
 *                        with unlock interactions, once as a
 *                        Beer card without them. We deliberately
 *                        skip these rows from the Beer partition.
 *                        No warning is emitted: this is the
 *                        intended outcome, not a defect.
 *
 * The N.1 diagnostic confirmed three observed production values
 * (`tale`, `resident`, `na`). Anything else returns null; the
 * adapter drops the row with a console.warn rather than silently
 * mis-categorizing it — this preserves the unknown-category
 * safety check from N.1 for any future production category
 * introductions.
 *
 * N.1.2 supersedes N.1's two-output mapping (`'regular' | 'non-alc'`).
 * Previously `tale` collapsed into `regular`, causing all 6
 * alcoholic beers to appear under the Resident tab. The new
 * `'handled-by-tales'` outcome preserves production category
 * semantics: tale-linked beers stay in the Tale[] pipeline, and
 * the Resident tab shows only the 3 resident-category rows.
 */
type BeerPartitionCategory = 'resident' | 'non-alc' | 'handled-by-tales';

function mapProdBeerCategory(category: unknown): BeerPartitionCategory | null {
  if (category === 'tale')     return 'handled-by-tales';
  if (category === 'resident') return 'resident';
  if (category === 'na')       return 'non-alc';
  return null;
}

/**
 * Format a production ABV value into the public Beer's string
 * shape. Production stores ABV as a number (or numeric-text); the
 * public app expects strings like '4.8%' for regulars and '<0.5%'
 * for NAs (the established NA display convention, per
 * LOCAL_NON_ALC: 'Signalman' shows '<0.5%' even though the actual
 * ABV is 0.4–0.5).
 *
 * Rules:
 *   - >= 0.5: render as `<value>%` (e.g. 4.8 → '4.8%')
 *   - < 0.5:  render as '<0.5%' (matches the local NA convention)
 *   - 0.5 exactly: also '<0.5%' (NA convention boundary)
 *   - non-finite / non-numeric: return null (caller decides fallback)
 *
 * Numbers are coerced via `Number()` so production columns typed
 * as numeric, text-numeric, or even pre-formatted percent strings
 * funnel through the same path (only the raw numeric value is
 * compared; if the input is unparseable, null is returned).
 */
function formatProdAbv(raw: unknown): string | null {
  if (typeof raw === 'string' && /%$/.test(raw)) {
    // Production might one day store pre-formatted percent strings
    // (e.g. '4.8%' or '<0.5%'); pass those through unchanged.
    return raw;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0.5) return '<0.5%';
  return `${n}%`;
}

/**
 * Format a production IBU value into the public Beer's string
 * shape. Production stores IBU as integer; public app expects
 * a string like '20'. Numbers funnel through `String()`; non-finite
 * returns null (caller drops the row).
 */
function formatProdIbu(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().length > 0 && Number.isFinite(Number(raw))) {
    return raw.trim();
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return String(n);
}

/**
 * Discriminated-union row type for production beer SELECT results.
 * Distinct from the public `Beer` type — production owns operational
 * fields, the presentation pack supplies branding fields. The
 * intermediate type carries `sort_order` so the caller can
 * stable-sort the full mapped result before partitioning.
 *
 * Two variants:
 *   * `kind: 'beer'`             — Resident or NA row; carries a
 *                                  fully-populated Beer object the
 *                                  partition loop pushes into
 *                                  regulars[] or nonAlc[].
 *   * `kind: 'handled-by-tales'` — Production `category='tale'`
 *                                  row; valid but intentionally
 *                                  skipped by the Beer partition.
 *                                  The Menu's Tales tab renders
 *                                  these beers as Tale cards via
 *                                  the separate Tale[] pipeline.
 *                                  No Beer object is constructed
 *                                  for this variant — the row never
 *                                  needs one.
 *
 * The discriminated union below replaces an earlier intermediate
 * design that fabricated an unused placeholder Beer for tale-category
 * rows. The variant for skipped tale rows simply has no `beer`
 * field, and the partition loop discriminates on `kind` before
 * touching beer data — no unsafe type assertion is required.
 */
type MappedBeerRow =
  | {
      kind:        'beer';
      slug:        string;
      beer:        Beer;
      category:    'resident' | 'non-alc';
      sort_order:  number;
    }
  | {
      kind:        'handled-by-tales';
      slug:        string;
      sort_order:  number;
    };

/**
 * Adapter: production beers row → MappedBeerRow.
 *
 * Drop conditions (each warns once with the row's slug for
 * operator visibility):
 *   * Missing/blank slug, name, or style
 *   * Unknown category value (anything other than tale/resident/na)
 *
 * For rows classified as `'handled-by-tales'` (production
 * `category='tale'`), the function short-circuits early and returns
 * a `kind: 'handled-by-tales'` variant carrying only the slug and
 * sort_order. No Beer object is constructed, no presentation pack
 * lookup, no abv/ibu formatting, no image resolution. The
 * partition loop discriminates on `kind` and skips these variants
 * without ever consulting beer-specific fields.
 *
 * Doing the short-circuit here (rather than letting the row drop
 * later via missing presentation pack) keeps the no-warning
 * contract intact for new tale-linked beers added in production:
 * an admin adding a 4th tale-linked beer in Supabase will not
 * produce a "no presentation pack" warning because we never look
 * up the pack for tale-category rows.
 *
 * For `'resident'` and `'non-alc'` rows, the full mapping pipeline
 * runs and returns a `kind: 'beer'` variant:
 *   * Production slug must be in beerPresentationPack
 *   * abv / ibu must be coercible to finite numbers
 *   * Full Beer object is constructed
 *
 * A single bad row does not invalidate the others — each row maps
 * independently. The caller filters out nulls.
 */
function mapProdBeerRow(row: Record<string, unknown>): MappedBeerRow | null {
  const slug = asString(row.slug);
  if (!slug || slug.trim().length === 0) {
    console.warn('[trackside] Remote beer row dropped: missing slug', row);
    return null;
  }

  const name  = asString(row.name);
  const style = asString(row.style);
  if (!name || name.trim().length === 0) {
    console.warn(`[trackside] Remote beer "${slug}" dropped: missing name`);
    return null;
  }
  if (!style || style.trim().length === 0) {
    console.warn(`[trackside] Remote beer "${slug}" dropped: missing style`);
    return null;
  }

  const category = mapProdBeerCategory(row.category);
  if (!category) {
    console.warn(
      `[trackside] Remote beer "${slug}" has unknown category "${String(row.category)}" — dropping row.`,
    );
    return null;
  }

  // sort_order: production carries integers; default to a large
  // sentinel if missing so the row sorts last within its partition.
  const sortOrderNum = asNumber(row.sort_order);
  const sort_order = sortOrderNum !== null ? sortOrderNum : 9_999_999;

  // Tale-linked beers are valid production rows but the Menu's
  // Tales tab renders them through Tale[] (with unlock state and
  // story navigation), not as Beer cards. Return the
  // 'handled-by-tales' variant — no Beer object, no presentation
  // pack lookup, no abv/ibu formatting, no image resolution.
  // The partition loop discriminates on `kind` and skips this
  // variant entirely.
  if (category === 'handled-by-tales') {
    return { kind: 'handled-by-tales', slug, sort_order };
  }

  const pack = getBeerPresentationPack(slug);
  if (!pack) {
    console.warn(
      `[trackside] Remote beer slug "${slug}" has no presentation pack — dropping row.`,
    );
    return null;
  }

  const abv = formatProdAbv(row.abv);
  if (abv === null) {
    console.warn(`[trackside] Remote beer "${slug}" has malformed abv "${String(row.abv)}" — dropping row.`);
    return null;
  }

  const ibu = formatProdIbu(row.ibu);
  if (ibu === null) {
    console.warn(`[trackside] Remote beer "${slug}" has malformed ibu "${String(row.ibu)}" — dropping row.`);
    return null;
  }

  // Image: prefer production can_image_url if non-empty; otherwise
  // the presentation pack's curated fallback. N.1 diagnostic
  // confirmed all 8 production rows currently have can_image_url
  // null, so every render path uses pack.imageFallback today.
  const remoteImage = asString(row.can_image_url);
  const image = (remoteImage && remoteImage.trim().length > 0)
    ? remoteImage
    : pack.imageFallback;

  // Tasting: prefer trimmed short_description; fall back to trimmed
  // description; omit entirely if both are blank. The Beer type
  // marks `tasting` as optional, so omission is harmless.
  const shortDesc = asString(row.short_description);
  const longDesc  = asString(row.description);
  const tasting =
    (shortDesc && shortDesc.trim().length > 0) ? shortDesc.trim() :
    (longDesc  && longDesc.trim().length  > 0) ? longDesc.trim()  :
    null;

  const beer: Beer = {
    name,
    abbr:  pack.abbr,
    image,
    style,
    abv,
    ibu,
  };
  if (tasting) beer.tasting = tasting;
  if (pack.tapStatus) beer.tapStatus = pack.tapStatus;

  return { kind: 'beer', slug, beer, category, sort_order };
}

/**
 * Adapter: production food_items row → public FoodItem.
 *
 * Production source: public.food_items.
 *   * slug         — required; drop on missing/blank (used for
 *                    warnings, not exposed by FoodItem today).
 *   * name         — required; drop on missing/blank. Maps to
 *                    FoodItem.name.
 *   * description  — required; drop on missing/blank. Maps to
 *                    FoodItem.desc (column rename). Production
 *                    currently has populated description text for
 *                    all 4 active+published rows (matching the
 *                    LOCAL_FOOD descriptions), so we intentionally
 *                    do NOT fall through to empty `<p>` rendering —
 *                    that would be a visible regression vs. the
 *                    rich LOCAL_FOOD copy.
 *   * category     — read but not exposed; public FoodItem has no
 *                    category field today. MenuPage's
 *                    FOOD_VISUAL_META lookup keys on `name` (with
 *                    a default-glyph fallback for unknown names),
 *                    so unknown production categories don't cause
 *                    any visual regression.
 *   * is_featured, sort_order, updated_at — not exposed.
 *
 * A single bad row does not invalidate the others — each row maps
 * independently. The caller filters out nulls.
 */
function mapFoodRow(row: Record<string, unknown>): FoodItem | null {
  const slug = asString(row.slug);
  if (!slug || slug.trim().length === 0) {
    console.warn('[trackside] Remote food row dropped: missing slug', row);
    return null;
  }

  const name = asString(row.name);
  if (!name || name.trim().length === 0) {
    console.warn(`[trackside] Remote food "${slug}" dropped: missing name`);
    return null;
  }

  const description = asString(row.description);
  if (!description || description.trim().length === 0) {
    console.warn(`[trackside] Remote food "${slug}" dropped: missing description`);
    return null;
  }

  return { name: name.trim(), desc: description.trim() };
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

// ADMIN-v7.4B.N.1: production-aligned beer column subset only. The
// earlier canonical SELECT (abbr, tasting, display_order) referenced
// columns absent from production public.beers — flipping
// USE_REMOTE_BEERS on against current production would have produced
// PostgREST 42703 errors. The N.1 adapter sources `abbr` from the
// slug-keyed beerPresentationPack instead; `short_description` /
// `description` flow into the public Beer's optional `tasting`
// field; `sort_order` replaces canonical `display_order`. The
// production diagnostic confirmed these are the columns
// public.beers actually carries (id and is_active/status are also
// present but used only as query filters; created_at and
// updated_at are present but read-only).
const BEER_SELECT =
  'slug,name,style,abv,ibu,category,short_description,description,can_image_url,sort_order,updated_at';

// ADMIN-v7.4B.O.1: production-aligned food column subset.
// The earlier SELECT referenced `display_order` (canonical) which
// does not exist on production's `food_items`. The O.1 diagnostic
// confirmed production columns: id, venue_id, name, description,
// category, is_featured, sort_order, is_active, created_at,
// updated_at, slug, status. Adapter reads:
//   * slug         — drop-on-missing identity for warnings
//   * name         — drop-on-missing; maps to public FoodItem.name
//   * description  — drop-on-missing; maps to public FoodItem.desc
//   * category     — read for future use; not exposed by FoodItem
//                    today. MenuPage's FOOD_VISUAL_META lookup
//                    keys on `name`, not category, so the public
//                    Food tab continues rendering one flat list.
//   * is_featured  — read for future use; not exposed today.
//   * sort_order   — query-only (ORDER BY); not surfaced.
//   * updated_at   — query-only; not surfaced.
// Production-only columns deliberately omitted from the SELECT:
//   id, venue_id, is_active, status, created_at
//   (is_active+status are filter-only via PUBLISHED_FILTER below).
const FOOD_SELECT =
  'slug,name,description,category,is_featured,sort_order,updated_at';

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

// ADMIN-v7.4B.N.1: one-call beer fetch + client-side partition.
// Previously the two AppContext-facing fetchers (fetchRemoteRegulars
// / fetchRemoteNonAlc) each issued a separate /rest/v1/beers
// request with a `category=eq.<X>` filter. The N.1 adapter
// collapses this to a single fetch and partitions client-side,
// halving the network round-trips on app mount.
//
// The two AppContext-facing fetchers remain as public exports
// (their call sites in AppContext.tsx are unchanged); they now
// share a memoized in-flight promise via fetchRemoteBeersPartitioned
// so the two `void fetchRemoteRegulars().then(...)` and
// `void fetchRemoteNonAlc().then(...)` calls on mount result in
// exactly one HTTP request.

interface PartitionedBeers {
  regulars: Beer[];
  nonAlc:   Beer[];
}

let beersInflight: Promise<PartitionedBeers | null> | null = null;

/**
 * Single shared fetch of all active+published beer rows,
 * partitioned client-side by mapped category. Memoized in-flight
 * so two parallel callers (fetchRemoteRegulars + fetchRemoteNonAlc)
 * share one network request.
 *
 * The memoization is per-process-load and is intentionally NOT
 * cleared on success. After mount, AppContext doesn't re-fetch
 * (see AppContext.tsx — fetch fires once via useEffect with empty
 * deps). On hard refresh, the module reloads and the cache resets.
 *
 * Gates:
 *   * USE_REMOTE_BEERS=false → return null before any HTTP request.
 *   * Fetch failure → return null (caller falls back to local).
 *   * Zero valid rows after mapping → return null.
 *   * One partition empty but the other has rows → caller sees the
 *     populated array and gets null for the empty one (we return
 *     null only if BOTH partitions are empty, matching the
 *     "fail-safe to local" contract for each section).
 */
function fetchRemoteBeersPartitioned(): Promise<PartitionedBeers | null> {
  if (!USE_REMOTE_BEERS) return Promise.resolve(null);
  if (beersInflight) return beersInflight;

  beersInflight = (async () => {
    try {
      const rows = (await supabaseFetch(
        'beers',
        // N.1: no category filter; one fetch returns all categories.
        // Order by sort_order so the natural array order matches
        // the menu's intended display order before we partition.
        `select=${BEER_SELECT}&${PUBLISHED_FILTER}&order=sort_order.asc`,
      )) as unknown;
      if (!Array.isArray(rows)) return null;

      // Map every row, drop malformed/unknown, partition by
      // adapter-classified category. Each row warns once if it
      // drops (mapProdBeerRow handles the warnings).
      const mapped = rows
        .map((r) => (isObj(r) ? mapProdBeerRow(r) : null))
        .filter((r): r is MappedBeerRow => r !== null);

      if (mapped.length === 0) return null;

      // Stable sort across the full mapped result by sort_order,
      // then slug as the tiebreaker. The fetch was already ordered,
      // but partition shouldn't disturb relative order.
      mapped.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.slug.localeCompare(b.slug);
      });

      // Partition by discriminated `kind`. `'handled-by-tales'`
      // rows are intentionally skipped — they're valid production
      // rows but the public Menu's Tales tab renders these beers
      // as Tale cards via the separate fetchRemoteTales pipeline,
      // not as Beer cards. Exposing them as Beer[] in the Resident
      // tab would render each tale-linked beer twice in the menu.
      // The discriminated union means we never touch a Beer field
      // on a tale-category row.
      const regulars: Beer[] = [];
      const nonAlc:   Beer[] = [];
      for (const r of mapped) {
        if (r.kind === 'beer') {
          if (r.category === 'resident')     regulars.push(r.beer);
          else if (r.category === 'non-alc') nonAlc.push(r.beer);
        }
        // else r.kind === 'handled-by-tales' → intentionally skip.
      }

      // If EVERY row dropped out of a partition the caller will
      // see [] for that section and fall back to local. We only
      // return null if BOTH are empty (no signal worth surfacing).
      if (regulars.length === 0 && nonAlc.length === 0) return null;

      return { regulars, nonAlc };
    } catch (err) {
      console.warn('[trackside] Remote beers unavailable — using local fallback', err);
      return null;
    }
  })();

  return beersInflight;
}

export async function fetchRemoteRegulars(): Promise<Beer[] | null> {
  const partitioned = await fetchRemoteBeersPartitioned();
  if (!partitioned) return null;
  // Empty regulars partition → fall back to local. Same posture as
  // mapping zero valid rows: caller treats null as "keep local".
  return partitioned.regulars.length > 0 ? partitioned.regulars : null;
}

export async function fetchRemoteNonAlc(): Promise<Beer[] | null> {
  const partitioned = await fetchRemoteBeersPartitioned();
  if (!partitioned) return null;
  return partitioned.nonAlc.length > 0 ? partitioned.nonAlc : null;
}

export async function fetchRemoteFood(): Promise<FoodItem[] | null> {
  // M.5.2.2: gated on USE_REMOTE_FOOD (per-category flag in
  // supabaseClient.ts). When the env var VITE_USE_REMOTE_FOOD is
  // not exactly the string 'true', this fetcher short-circuits to
  // null and AppContext keeps LOCAL_FOOD.
  //
  // O.1: production-aligned adapter against public.food_items.
  //   * Production confirmed columns: id, venue_id, name,
  //     description, category, is_featured, sort_order, is_active,
  //     created_at, updated_at, slug, status.
  //   * Active+published filter via PUBLISHED_FILTER.
  //   * Sorted by sort_order (production's column; canonical
  //     `display_order` does not exist on production).
  //   * Returns one flat FoodItem[]. MenuPage's Food tab renders
  //     one section with FOOD_VISUAL_META looked up by `name`;
  //     production categories are not consumed.
  //   * One HTTP request. No second fetch.
  if (!USE_REMOTE_FOOD) return null;
  try {
    const rows = (await supabaseFetch(
      // O.1: target verified table name `food_items` (NOT the
      // canonical `food` — that view/table does not exist on
      // production).
      'food_items',
      `select=${FOOD_SELECT}&${PUBLISHED_FILTER}&order=sort_order.asc`,
    )) as unknown;
    if (!Array.isArray(rows)) return null;
    const mapped = rows
      .map((r) => (isObj(r) ? mapFoodRow(r) : null))
      .filter((f): f is FoodItem => f !== null);
    // Empty array → return null so AppContext keeps the full
    // LOCAL_FOOD menu rather than rendering an empty Food tab.
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
