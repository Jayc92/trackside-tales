-- ============================================================
-- Trackside Tales — production catch-up: tap_list only
-- (ADMIN-v7.4A.2D — companion to 20260601000000_init.sql)
--
-- Why this exists:
--   The repo's clean-room v6.3 init (20260601000000_init.sql) cannot
--   be applied to the existing production Supabase project. Production
--   was bootstrapped from an earlier demo schema and has live data in
--   tales/beers/qr_codes/guest_profiles/reward_tiers, plus legacy
--   tables (food_items, guest_badges, guest_unlocks, guest_scan_events,
--   coming_next_tales, venues, scan_events, user_badges,
--   user_tale_unlocks) that the existing admin_* reporting views read
--   from. A full v6.3 catch-up would conflict with those existing
--   shapes and break those views.
--
--   Production *does*, however, satisfy the only contract that the
--   v7.3 admin tap-list slice needs: public.beers.slug exists and is
--   UNIQUE. PostgreSQL allows a foreign key to reference any unique
--   column, so tap_list.beer_slug can FK into beers(slug) without
--   altering beers.
--
--   This migration creates *only* the tap_list table and its three
--   indexes, and is intended to be applied IMMEDIATELY BEFORE the
--   existing 20260602000000_admin_actions_and_tap_fns.sql migration.
--
-- HARD CONSTRAINTS:
--   * No CREATE on tales/beers/qr_codes/guest_profiles/reward_tiers,
--     or on any legacy demo table. They already exist.
--   * No ALTER on any existing table.
--   * No new RLS policies. tap_list is service-role only.
--   * No new triggers.
--   * No data is inserted.
--   * Idempotent: every CREATE uses IF NOT EXISTS so the file is safe
--     to re-run on a partially applied database.
--
-- Apply order:
--   1. This file (creates tap_list + indexes)
--   2. 20260602000000_admin_actions_and_tap_fns.sql (creates
--      admin_actions + fn_tap_start/end/edit_notes)
--
-- Apply path:
--   Dashboard SQL Editor, not Supabase CLI. Production's
--   supabase_migrations.schema_migrations table does not exist; CLI
--   db push would attempt to apply earlier 20260601* migrations that
--   conflict with the existing demo schema. Migration history repair
--   is a separately approved phase, deferred until after both this
--   file and 20260602000000 are applied and verified.
--
-- Rollback (full unwind, in reverse apply order):
--   See bottom of this file.
-- ============================================================

-- ---------- tap_list ----------------------------------------------
-- "What's pouring right now," decoupled from beers.is_active.
-- A live row has ended_at = NULL. Multiple live rows for the same
-- beer are allowed (busy nights may pour the same beer from two
-- handles); a single tap_number is exclusive while live.
--
-- beer_slug references beers(slug). beers.slug is UNIQUE in
-- production, which is sufficient for FK targeting (PostgreSQL
-- allows FKs against any unique column, not just the PK).
create table if not exists public.tap_list (
  beer_slug    text         not null references public.beers (slug) on delete cascade,
  tap_number   int,
  started_at   timestamptz  not null default now(),
  ended_at     timestamptz,
  notes        text,
  created_at   timestamptz  not null default now(),
  primary key (beer_slug, started_at)
);

-- Index: list of live rows by recency (admin tap-list page main read).
create index if not exists tap_list_live_idx
  on public.tap_list (started_at desc)
  where ended_at is null;

-- Index: enforce one live beer per physical handle. tap_number is
-- nullable for cask / casual handpump pours; the constraint only
-- applies when set.
create unique index if not exists tap_list_one_live_per_tap_idx
  on public.tap_list (tap_number)
  where ended_at is null and tap_number is not null;

-- Index: "is this beer pouring anywhere right now?" Non-unique on
-- purpose — the same beer can occupy two handles.
create index if not exists tap_list_live_by_beer_idx
  on public.tap_list (beer_slug)
  where ended_at is null;

-- No RLS, no policies, no triggers. tap_list is service-role only;
-- the v7.3 admin app talks to it through fn_tap_* (created by the
-- next migration), which run security invoker under service role.
-- Public app does not read tap_list directly in v7.3.

-- ============================================================
-- Verification (read-only) — run AFTER applying the migration block
-- above to confirm the catch-up landed correctly. All queries are
-- pure SELECT; safe to run any number of times.
--
--   V1. tap_list table exists in public schema (expected: 1 row).
--   V2. All three tap_list indexes present (expected: 3 rows).
--   V3. beer_slug FK exists and points at beers(slug)
--       with delete_rule = CASCADE (expected: 1 row).
--   V4. tap_list is empty after migration (expected: 0).
--   V5. Active beers available for v7.3 smoke test (expected: > 0;
--       baseline observed 8).
--   V6. beers.slug is still uniquely constrained (expected: 1 row).
--       If this returns 0 rows, the FK from tap_list.beer_slug
--       cannot enforce parent uniqueness. Stop and investigate.
--   V7. No triggers crept onto tap_list (expected: 0 rows).
--
-- The exact verification queries are kept in the v7.4A.2D planning
-- artifact rather than inlined here so this file remains a pure
-- DDL migration.
-- ============================================================

-- ============================================================
-- ROLLBACK — production catch-up: tap_list
--
-- Safe ONLY if:
--   * 20260602000000_admin_actions_and_tap_fns.sql has NOT been
--     applied yet, OR has been rolled back first via its own
--     rollback block (the v7.3 functions reference public.tap_list
--     and would break if the table is dropped from underneath them).
--   * tap_list contains no rows the business cares about.
--
-- Verify before running:
--   select count(*) from public.tap_list;        -- expect 0
--   select 1
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('fn_tap_start','fn_tap_end','fn_tap_edit_notes');
--   -- expect 0 rows; presence means roll v7.3 back FIRST.
--
-- Rollback statements (run in this order):
--
--   drop index if exists public.tap_list_live_by_beer_idx;
--   drop index if exists public.tap_list_one_live_per_tap_idx;
--   drop index if exists public.tap_list_live_idx;
--   drop table if exists public.tap_list;
-- ============================================================
