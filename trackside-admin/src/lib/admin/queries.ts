// ================== TRACKSIDE ADMIN — read-only query helpers ==================
// Centralized service-role read queries for the v7.2 admin dashboard
// and list views. Every function here:
//
//   * runs server-side only (`import 'server-only'`)
//   * uses the service-role Supabase client, which bypasses RLS — the
//     admin-only tables (qr_codes, media_assets, *_events,
//     guest_profiles, drafts, soft-deleted rows) have no anon-readable
//     RLS policies, so reads MUST go through this layer
//   * returns a uniform `{ ok: true; data } | { ok: false; error }`
//     shape so pages can render an "error reading X" notice instead
//     of throwing a 500
//   * does NOT throw raw Supabase errors into rendered output —
//     errors are logged with a stable prefix and sanitized into the
//     fallback shape
//
// HARD RULES:
//
//   1. NEVER import this module from a Client Component. The
//      `server-only` import at the top will fail the build at the
//      first such import, and `.eslintrc.json` adds a second guard
//      via `no-restricted-imports`.
//
//   2. NEVER export the raw service-role client from this file. All
//      callers should use these higher-level helpers, which keep
//      query shape and error handling consistent across pages.
//
//   3. NEVER add a write here. v7.2 is read-only. Mutations land in
//      v7.3+ and should live in their own module (`mutations.ts`)
//      with their own audit logging and Zod validation.
//
//   4. Keep queries simple. No joins that aren't already in the
//      schema, no view-style aggregation that could mask bugs in the
//      underlying tables. If a count gets expensive at real volume
//      we'll move to a materialized view; not yet.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ---------- result envelope ----------------------------------------------

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Internal log helper. Logs a stable-prefixed error to stderr only —
 * the message is NOT propagated to the rendered HTML. UI shows a
 * generic "couldn't read X" instead so we don't leak query shape /
 * Postgres details to the browser.
 */
function logQueryError(scope: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[trackside-admin][queries:${scope}]`, err);
}

// ---------- dashboard counts ---------------------------------------------

export interface DashboardCounts {
  talesTotal:        number;
  talesPublished:    number;
  talesDraft:        number;
  beersTotal:        number;
  qrActive:          number;
  unlockEventsTotal: number;
  badgeEventsTotal:  number;
  gameEventsTotal:   number;
  recentActivity7d:  number;
}

/**
 * Fetch the headline tile counts for the admin dashboard. Everything
 * runs in parallel; if any one query fails the whole call returns the
 * first error, since a partially-populated dashboard would mislead
 * staff into thinking the database is healthier than it is.
 *
 * `recentActivity7d` is the union of unlock + badge + game events in
 * the last 7 days.
 */
export async function getDashboardCounts(): Promise<QueryResult<DashboardCounts>> {
  try {
    const supabase = createServiceRoleClient();

    // `head: true, count: 'exact'` issues a HEAD request that returns
    // only the count via the Content-Range header — no row payload.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      talesTotal,
      talesPublished,
      talesDraft,
      beersTotal,
      qrActive,
      unlockTotal,
      badgeTotal,
      gameTotal,
      unlockRecent,
      badgeRecent,
      gameRecent,
    ] = await Promise.all([
      supabase.from('tales').select('slug', { head: true, count: 'exact' }),
      supabase.from('tales').select('slug', { head: true, count: 'exact' }).eq('status', 'published'),
      supabase.from('tales').select('slug', { head: true, count: 'exact' }).eq('status', 'draft'),
      supabase.from('beers').select('slug', { head: true, count: 'exact' }),
      supabase.from('qr_codes').select('id',  { head: true, count: 'exact' }).eq('is_active', true),
      supabase.from('unlock_events').select('id', { head: true, count: 'exact' }),
      supabase.from('badge_events').select('id',  { head: true, count: 'exact' }),
      supabase.from('game_events').select('id',   { head: true, count: 'exact' }),
      supabase.from('unlock_events').select('id', { head: true, count: 'exact' }).gte('created_at', sevenDaysAgo),
      supabase.from('badge_events').select('id',  { head: true, count: 'exact' }).gte('created_at', sevenDaysAgo),
      supabase.from('game_events').select('id',   { head: true, count: 'exact' }).gte('created_at', sevenDaysAgo),
    ]);

    const failures = [
      talesTotal, talesPublished, talesDraft, beersTotal, qrActive,
      unlockTotal, badgeTotal, gameTotal,
      unlockRecent, badgeRecent, gameRecent,
    ].filter((r) => r.error);

    if (failures.length > 0) {
      logQueryError('getDashboardCounts', failures.map((f) => f.error));
      return { ok: false, error: 'Could not load dashboard counts.' };
    }

    return {
      ok: true,
      data: {
        talesTotal:        talesTotal.count        ?? 0,
        talesPublished:    talesPublished.count    ?? 0,
        talesDraft:        talesDraft.count        ?? 0,
        beersTotal:        beersTotal.count        ?? 0,
        qrActive:          qrActive.count          ?? 0,
        unlockEventsTotal: unlockTotal.count       ?? 0,
        badgeEventsTotal:  badgeTotal.count        ?? 0,
        gameEventsTotal:   gameTotal.count         ?? 0,
        recentActivity7d:
          (unlockRecent.count ?? 0) +
          (badgeRecent.count  ?? 0) +
          (gameRecent.count   ?? 0),
      },
    };
  } catch (err) {
    logQueryError('getDashboardCounts', err);
    return { ok: false, error: 'Could not load dashboard counts.' };
  }
}

// ---------- tales list ----------------------------------------------------

export interface TaleRow {
  slug:       string;
  name:       string;
  title:      string;
  year:       string | null;
  tap_status: string;
  status:     string;
  is_active:  boolean;
  updated_at: string;
}

/**
 * List all tales (drafts + published, active + soft-deleted). Sorted
 * by updated_at desc so freshly-edited rows surface first; this is
 * the most useful default for content review.
 */
export async function listTales(): Promise<QueryResult<TaleRow[]>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tales')
      .select('slug, name, title, year, tap_status, status, is_active, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      logQueryError('listTales', error);
      return { ok: false, error: 'Could not load tales.' };
    }
    return { ok: true, data: (data ?? []) as TaleRow[] };
  } catch (err) {
    logQueryError('listTales', err);
    return { ok: false, error: 'Could not load tales.' };
  }
}

// ---------- beers list ----------------------------------------------------

export interface BeerRow {
  slug:       string;
  name:       string;
  category:   string;
  style:      string | null;
  abv:        string | null;
  ibu:        string | null;
  status:     string;
  is_active:  boolean;
  updated_at: string;
}

export async function listBeers(): Promise<QueryResult<BeerRow[]>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('beers')
      .select('slug, name, category, style, abv, ibu, status, is_active, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      logQueryError('listBeers', error);
      return { ok: false, error: 'Could not load beers.' };
    }
    return { ok: true, data: (data ?? []) as BeerRow[] };
  } catch (err) {
    logQueryError('listBeers', err);
    return { ok: false, error: 'Could not load beers.' };
  }
}

// ---------- food list -----------------------------------------------------
// NOTE: the v7.2 brief listed `description` and `price` as columns to
// surface, but the canonical schema (supabase/migrations/20260601000000_init.sql)
// does not define those columns on `public.food`. We surface only the
// fields that exist; introducing description/price is a schema change
// and is out of scope for this read-only phase. See report.

export interface FoodRow {
  slug:       string;
  name:       string;
  status:     string;
  is_active:  boolean;
  updated_at: string;
}

export async function listFood(): Promise<QueryResult<FoodRow[]>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('food')
      .select('slug, name, status, is_active, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      logQueryError('listFood', error);
      return { ok: false, error: 'Could not load food items.' };
    }
    return { ok: true, data: (data ?? []) as FoodRow[] };
  } catch (err) {
    logQueryError('listFood', err);
    return { ok: false, error: 'Could not load food items.' };
  }
}

// ---------- qr codes list -------------------------------------------------

export interface QrCodeRow {
  code:           string;
  tale_slug:      string;
  purpose:        string | null;
  location_label: string | null;
  is_active:      boolean;
  rotated_at:     string | null;
  created_at:     string;
}

export async function listQrCodes(): Promise<QueryResult<QrCodeRow[]>> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('qr_codes')
      .select('code, tale_slug, purpose, location_label, is_active, rotated_at, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      logQueryError('listQrCodes', error);
      return { ok: false, error: 'Could not load QR codes.' };
    }
    return { ok: true, data: (data ?? []) as QrCodeRow[] };
  } catch (err) {
    logQueryError('listQrCodes', err);
    return { ok: false, error: 'Could not load QR codes.' };
  }
}

// ---------- merged activity feed -----------------------------------------

export type ActivityEventType = 'unlock' | 'badge' | 'game';

export interface ActivityRow {
  type:       ActivityEventType;
  created_at: string;
  guest_id:   string;
  tale_slug:  string | null;
  /** badge_key for badge events, phase for game events, source for unlocks */
  detail:     string | null;
}

const ACTIVITY_LIMIT = 50;

/**
 * Fetch the most recent N rows from each event stream, merge them
 * client-side (well, server-side — this is a Server Component query),
 * sort descending by timestamp, and truncate. Each per-stream query
 * is bounded so this can never accidentally pull millions of rows
 * once the events table grows.
 */
export async function listRecentActivity(
  limit: number = ACTIVITY_LIMIT,
): Promise<QueryResult<ActivityRow[]>> {
  try {
    const supabase = createServiceRoleClient();

    const [unlocks, badges, games] = await Promise.all([
      supabase
        .from('unlock_events')
        .select('created_at, guest_id, tale_slug, source')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('badge_events')
        .select('created_at, guest_id, tale_slug, badge_key')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('game_events')
        .select('created_at, guest_id, tale_slug, phase')
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    if (unlocks.error || badges.error || games.error) {
      logQueryError('listRecentActivity', {
        unlocks: unlocks.error,
        badges:  badges.error,
        games:   games.error,
      });
      return { ok: false, error: 'Could not load recent activity.' };
    }

    const merged: ActivityRow[] = [
      ...((unlocks.data ?? []) as Array<{
        created_at: string; guest_id: string; tale_slug: string | null; source: string | null;
      }>).map((r) => ({
        type:       'unlock' as const,
        created_at: r.created_at,
        guest_id:   r.guest_id,
        tale_slug:  r.tale_slug,
        detail:     r.source,
      })),
      ...((badges.data ?? []) as Array<{
        created_at: string; guest_id: string; tale_slug: string | null; badge_key: string;
      }>).map((r) => ({
        type:       'badge' as const,
        created_at: r.created_at,
        guest_id:   r.guest_id,
        tale_slug:  r.tale_slug,
        detail:     r.badge_key,
      })),
      ...((games.data ?? []) as Array<{
        created_at: string; guest_id: string; tale_slug: string | null; phase: string;
      }>).map((r) => ({
        type:       'game' as const,
        created_at: r.created_at,
        guest_id:   r.guest_id,
        tale_slug:  r.tale_slug,
        detail:     r.phase,
      })),
    ];

    merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { ok: true, data: merged.slice(0, limit) };
  } catch (err) {
    logQueryError('listRecentActivity', err);
    return { ok: false, error: 'Could not load recent activity.' };
  }
}
