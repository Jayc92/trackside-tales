-- ============================================================
-- Trackside Tales — F4 dashboard compatibility views
-- (ADMIN-v7.4A.F4 — schema-drift bridge for legacy/demo prod)
--
-- Why this exists:
--   The admin app's dashboard read layer in
--     trackside-admin/src/lib/admin/queries.ts
--   reads from canonical event-stream tables (`unlock_events`,
--   `badge_events`, `game_events`) that the v6.3 init migration
--   (20260601000000_init.sql) defines. Production was bootstrapped
--   from a demo schema and never had those exact tables — it has
--   semantically-equivalent legacy tables instead:
--
--     unlock_events  ←  guest_unlocks  ∪  user_tale_unlocks
--     badge_events   ←  guest_badges   ∪  user_badges
--     game_events    ←  (none — empty stub)
--
--   Without this bridge the dashboard's count queries return
--   404/400 and the entire `getDashboardCounts()` call falls back
--   to a "Could not load dashboard counts." error message in the
--   admin UI. Same drift also breaks the activity feed
--   (`listRecentActivity()`), which this same set of views fixes
--   without any application-side change.
--
--   These are read-only SQL views, not materialized views. They
--   resolve at query time, so any new rows written to the legacy
--   tables surface in the dashboard immediately.
--
-- Reconciliation note (read carefully):
--   The 3 views and the matching row in
--   `supabase_migrations.schema_migrations` (version
--   20260603000000) were created on production by an out-of-band
--   apply during admin agent work on 2026-06-02 BEFORE this file
--   existed in the repo. This file was authored AFTER the apply,
--   from the exact `view_definition` output captured via
--   `information_schema.views`. It documents what is already on
--   prod; running it on prod is a safe no-op because of the
--   `CREATE OR REPLACE VIEW` semantics. No DDL change is intended.
--
--   The `schema_migrations` row for this version was inserted
--   with `statements = NULL` instead of the single-element
--   `text[]` convention used by the prior 5 versions (see
--   ADMIN-v7.4A.2H Path B). A separate small UPDATE phase
--   (F4-recovery.4) repairs that drift to match the convention,
--   so future `supabase migration list` output is internally
--   consistent.
--
-- HARD CONSTRAINTS:
--   * No CREATE / ALTER / DROP on any base table.
--   * No new RLS policies. The 3 views inherit RLS posture from
--     their underlying tables (the 4 legacy *_unlocks/*_badges
--     tables already have demo-era RLS posture; the dashboard
--     queries reach these via the service-role client which
--     bypasses RLS). PostgreSQL views do not have their own RLS;
--     access control is enforced on the source tables.
--   * No new triggers.
--   * No data is inserted.
--   * Idempotent: every view uses CREATE OR REPLACE VIEW so the
--     file is safe to re-run on a fully-applied database.
--   * No DELETE on tap_list. No retroactive started_at editing.
--   * Apply path: Supabase Dashboard SQL Editor only, not CLI.
--
-- Column-shape contract (kept stable for queries.ts):
--   unlock_events ( id uuid, created_at timestamptz, guest_id text,
--                   tale_slug text, source text )
--   badge_events  ( id uuid, created_at timestamptz, guest_id text,
--                   tale_slug text, badge_key text )
--   game_events   ( id uuid, created_at timestamptz, guest_id text,
--                   tale_slug text, phase text )
--
--   Type-cast notes:
--     * user_badges.guest_id and user_tale_unlocks.guest_id are
--       uuid in production. The views explicitly cast these to
--       text via `(.guest_id)::text` so the column shape matches
--       the canonical schema's `guest_id text` (which is what
--       guest_unlocks.guest_id and guest_badges.guest_id already
--       are).
--     * user_badges.tale_id and user_tale_unlocks.tale_id are
--       uuid foreign keys to tales.id (uuid). The views resolve
--       these to tales.slug via LEFT JOIN, matching the
--       `tale_slug text` shape.
--     * user_tale_unlocks has no `source` column (legacy schema
--       did not track unlock provenance). The view sets
--       `source = NULL::text` for that branch. Honest gap, not
--       data fabrication.
--
-- Empty-stub view (game_events):
--   Production has no equivalent legacy table for mini-game
--   outcomes. The future canonical `game_events` table would be
--   populated by an Edge Function once the public app starts
--   logging game events (planned for v6.5 / v6.8). Until then,
--   the view returns 0 rows so the dashboard tile shows
--   `gameEventsTotal = 0` truthfully. The `WHERE false` clause
--   is a deliberate guard so the view's planner cost is trivial
--   and no source table is implied.
--
-- F4b deferred:
--   The activity feed (`listRecentActivity()` in queries.ts) reads
--   the same 3 views for different columns. These view definitions
--   already expose every column listRecentActivity needs
--   (created_at, guest_id, tale_slug, source/badge_key/phase) so
--   F4b is implicitly fixed by this same migration. No additional
--   F4b work required.
--
-- Rollback (full unwind):
--   drop view if exists public.unlock_events;
--   drop view if exists public.badge_events;
--   drop view if exists public.game_events;
--   delete from supabase_migrations.schema_migrations
--    where version = '20260603000000';
-- ============================================================

-- ---------- unlock_events ---------------------------------------
-- Bridge: guest_unlocks ∪ user_tale_unlocks → canonical
-- unlock_events shape that queries.ts expects.
create or replace view public.unlock_events as
  select gu.id,
         gu.unlocked_at  as created_at,
         gu.guest_id,
         gu.tale_slug,
         gu.source
    from public.guest_unlocks gu
   union all
  select utu.id,
         utu.unlocked_at as created_at,
         (utu.guest_id)::text as guest_id,
         t.slug          as tale_slug,
         null::text      as source
    from public.user_tale_unlocks utu
    left join public.tales t on t.id = utu.tale_id;

-- ---------- badge_events ----------------------------------------
-- Bridge: guest_badges ∪ user_badges → canonical badge_events
-- shape that queries.ts expects.
create or replace view public.badge_events as
  select gb.id,
         gb.earned_at    as created_at,
         gb.guest_id,
         gb.tale_slug,
         gb.badge_key
    from public.guest_badges gb
   union all
  select ub.id,
         ub.earned_at    as created_at,
         (ub.guest_id)::text  as guest_id,
         t.slug          as tale_slug,
         ub.badge_type   as badge_key
    from public.user_badges ub
    left join public.tales t on t.id = ub.tale_id;

-- ---------- game_events (empty stub) ----------------------------
-- See header for rationale. Returns 0 rows by construction; the
-- WHERE false guard prevents any plan from touching base tables.
create or replace view public.game_events as
  select null::uuid                     as id,
         null::timestamp with time zone as created_at,
         null::text                     as guest_id,
         null::text                     as tale_slug,
         null::text                     as phase
   where false;
