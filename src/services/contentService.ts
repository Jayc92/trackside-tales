// ================== CONTENT SERVICE (ADMIN-v6.4) ==================
// Read-only remote content loader. Fetches published+active rows
// from Supabase and maps them into the public app's existing
// `Tale`, `Beer`, and `FoodItem` shapes.
//
// Behavior contract — by design:
//   * Local content (LOCAL_TALES / LOCAL_REGULARS / LOCAL_NON_ALC /
//     LOCAL_FOOD) is the source of truth at first render. Every
//     fetcher below returns null when remote content is unavailable
//     or malformed; AppContext keeps the local arrays in that case.
//   * `USE_REMOTE_CONTENT` is true only when both VITE_SUPABASE_URL
//     and VITE_SUPABASE_ANON_KEY are set (see supabaseClient.ts).
//     Without them, every fetcher short-circuits to null.
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
  Badge,
  GameConfig,
  BarSummary,
  StillHere,
  PersonInfo,
} from '../app/types';
import { supabaseFetch, USE_REMOTE_CONTENT } from './supabaseClient';
import { LOCAL_TALES } from '../data/tales';
import { LOCAL_REGULARS, LOCAL_NON_ALC } from '../data/menu';

// ------------ image fallback bridge ------------
// Remote rows do not yet carry CDN image URLs. Until they do, we
// fall back to the embedded base64 cans from src/data/canImages.ts
// via the local Tale/Beer arrays. Keying:
//   * tales:  slug == Tale.id (stable, matches DB primary key)
//   * beers:  display name (LOCAL_REGULARS / LOCAL_NON_ALC have no
//             slug field today; name is stable + unique).

const LOCAL_TALE_IMAGE_BY_ID: Record<string, string> = LOCAL_TALES.reduce(
  (acc, t) => {
    acc[t.id] = t.image;
    return acc;
  },
  {} as Record<string, string>,
);

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

function mapStoryBlocks(v: unknown): StoryBlock[] {
  const rows = asArrayOfObj(v) ?? [];
  const out: StoryBlock[] = [];
  for (const r of rows) {
    const type = asString(r.type);
    if (type !== 'p' && type !== 'quote' && type !== 'h2' && type !== 'h3') continue;
    const block: StoryBlock = { type };
    const text = asString(r.text);
    const cite = asString(r.cite);
    if (text !== null) block.text = text;
    if (cite !== null) block.cite = cite;
    out.push(block);
  }
  return out;
}

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

function mapBadge(v: unknown): Badge | null {
  if (!isObj(v)) return null;
  const icon = asString(v.icon);
  const title = asString(v.title);
  const desc = asString(v.desc);
  if (!icon || !title || !desc) return null;
  return { icon, title, desc };
}

function mapGame(v: unknown): GameConfig | null {
  if (!isObj(v)) return null;
  const type = asString(v.type);
  if (type !== 'grid' && type !== 'spike' && type !== 'match') return null;
  const title = asString(v.title);
  const instructions = asString(v.instructions);
  const successTitle = asString(v.successTitle);
  const successMsg = asString(v.successMsg);
  if (!title || !instructions || !successTitle || !successMsg) return null;
  return { type, title, instructions, successTitle, successMsg };
}

function mapBarSummary(v: unknown): BarSummary | null {
  if (!isObj(v)) return null;
  const who = asString(v.who);
  const why = asString(v.why);
  const beer = asString(v.beer);
  if (!who || !why || !beer) return null;
  return { who, why, beer };
}

function mapStillHere(v: unknown): StillHere[] {
  const rows = asArrayOfObj(v) ?? [];
  const out: StillHere[] = [];
  for (const r of rows) {
    const place = asString(r.place);
    const detail = asString(r.detail);
    if (!place || !detail) continue;
    out.push({ place, detail });
  }
  return out;
}

function mapPerson(v: unknown): PersonInfo | null {
  if (!isObj(v)) return null;
  const name = asString(v.name);
  const dates = asString(v.dates);
  const role = asString(v.role);
  const initials = asString(v.initials);
  if (!name || !dates || !role || !initials) return null;
  const person: PersonInfo = { name, dates, role, initials };
  const portrait = asString(v.portrait);
  if (portrait) person.portrait = portrait;
  return person;
}

function mapTaleRow(row: Record<string, unknown>): Tale | null {
  const id = asString(row.slug);
  const name = asString(row.name);
  const title = asString(row.title);
  if (!id || !name || !title) return null;

  const person = mapPerson(row.person);
  const scanBadge = mapBadge(row.scan_badge);
  const gameBadge = mapBadge(row.game_badge);
  const game = mapGame(row.game);
  const barSummary = mapBarSummary(row.bar_summary);
  // These three are required by the Tale type; if any is missing,
  // the row is unrenderable — drop it.
  if (!person || !scanBadge || !gameBadge || !game || !barSummary) return null;

  const tapStatusRaw = asString(row.tap_status);
  const tapStatus: Tale['tapStatus'] =
    tapStatusRaw === 'on-tap' || tapStatusRaw === 'retired' || tapStatusRaw === 'coming-soon'
      ? tapStatusRaw
      : 'on-tap';

  // Image fallback: prefer remote can_image_url; otherwise the local
  // base64 can keyed by slug. If neither exists, drop the row — the
  // public Tale Detail page assumes a non-empty `image`.
  const remoteImage = asString(row.can_image_url);
  const image = remoteImage || LOCAL_TALE_IMAGE_BY_ID[id] || '';
  if (!image) return null;

  return {
    id,
    name,
    abbr: asStringOr(row.abbr, ''),
    image,
    style: asStringOr(row.style, ''),
    abv: asStringOr(row.abv, ''),
    ibu: asStringOr(row.ibu, ''),
    tagline: asStringOr(row.tagline, ''),
    icon: asStringOr(row.icon, ''),
    unlockSeal: asStringOr(row.unlock_seal, ''),
    person,
    personBio: asStringOr(row.person_bio, ''),
    chapter: asStringOr(row.chapter, ''),
    year: asStringOr(row.year, ''),
    title,
    story: mapStoryBlocks(row.story),
    mapTitle: asStringOr(row.map_title, ''),
    pins: mapPins(row.pins),
    timeline: mapTimeline(row.timeline),
    scanBadge,
    gameBadge,
    game,
    tapStatus,
    retiredDate: asString(row.retired_date),
    barSummary,
    stillHere: mapStillHere(row.still_here),
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

const TALE_SELECT =
  'slug,name,abbr,abv,ibu,style,tagline,icon,unlock_seal,chapter,year,title,' +
  'story,pins,timeline,scan_badge,game_badge,game,bar_summary,still_here,' +
  'person,person_bio,map_title,hero_image_url,can_image_url,tap_status,' +
  'retired_date,display_order';

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
  if (!USE_REMOTE_CONTENT) return null;
  try {
    const rows = (await supabaseFetch(
      'tales',
      `select=${TALE_SELECT}&${PUBLISHED_FILTER}&order=display_order.asc`,
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
  if (!USE_REMOTE_CONTENT) return null;
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
  if (!USE_REMOTE_CONTENT) return null;
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
  if (!USE_REMOTE_CONTENT) return null;
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
