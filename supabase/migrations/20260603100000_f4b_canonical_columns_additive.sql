-- ============================================================
-- Trackside Tales — F4b canonical columns additive migration
-- (ADMIN-v7.4B.A.3 — schema-drift bridge, additive nullable path)
--
-- Adds the canonical columns missing from production's legacy/demo
-- schema for `beers`, `food_items`, and `tales`, plus a compat view
-- exposing `public.food` over `public.food_items` for canonical
-- name symmetry. All adds are NULLABLE with no DEFAULT — strictly
-- additive, cannot break existing reads.
--
-- Why this exists:
--   ADMIN-v7.4B.A (the read-side Path A code adapter) narrowed the
--   admin app's projections to columns that actually exist in
--   production. That made all admin pages render but left admin
--   feature parity with the canonical schema unaddressed — there
--   was no `status` column on beers, food_items, tales, etc., so
--   admin CRUD couldn't manage publish/draft state.
--
--   This migration closes that gap for Beer/Menu CRUD (v7.4B's
--   stated scope) by adding the missing canonical columns to
--   production's existing tables, all nullable so:
--     * Existing reads (public app, admin_* reporting views,
--       legacy demo paths) are unaffected — new columns are
--       invisible unless explicitly projected.
--     * Existing rows have NULL for the new columns until a
--       separate backfill phase (ADMIN-v7.4B.B) populates them.
--     * Rollback is trivial: DROP COLUMN IF EXISTS ...
--
-- What is added:
--   public.beers
--     + status text NULL CHECK (status IS NULL OR status IN
--                                ('draft','published'))
--
--   public.food_items
--     + slug    text NULL                  (UNIQUE deferred to
--                                            backfill phase per
--                                            v7.4B planning)
--     + status  text NULL CHECK (status IS NULL OR status IN
--                                ('draft','published'))
--
--   public.tales
--     + name        text NULL
--     + tap_status  text NULL CHECK (tap_status IS NULL OR
--                                    tap_status IN
--                                    ('on-tap','retired',
--                                     'coming-soon'))
--     + status      text NULL CHECK (status IS NULL OR status IN
--                                    ('draft','published'))
--
--   public.food (new view)
--     CREATE OR REPLACE VIEW public.food AS
--       SELECT id, name, category, is_active, updated_at
--         FROM public.food_items
--     WITH (security_invoker = true)
--     GRANT SELECT TO service_role
--
-- What is NOT added (deliberate scope decisions per v7.4B planning):
--   * NO qr_codes columns. Production's qr_codes table already
--     has rich rotation infrastructure (status text NOT NULL
--     DEFAULT 'active' with CHECK ('active'|'inactive'|'revoked'),
--     campaign_key, batch_key, valid_from, valid_until, max_uses)
--     that is semantically equivalent to but richer than canonical
--     `purpose`/`location_label`/`rotated_at`. Adding canonical
--     columns alongside prod's existing mechanism would create
--     two ways to track the same state. v7.6 QR CRUD will surface
--     prod's existing fields, not bridge to a stale canonical model.
--
--   * NO `set_updated_at` triggers. Production lacks these (P6
--     preflight confirmed). v7.4B mutations will set
--     `updated_at = now()` explicitly inside RPC functions
--     (mirroring the v7.3 fn_tap_* precedent), giving callers
--     control over whether a write should bump updated_at —
--     which they may not want for soft-delete operations
--     (`UPDATE ... SET is_active = false`).
--
--   * NO UNIQUE constraint on food_items.slug. Adding UNIQUE on
--     a column that's NULL for all 4 existing rows works (NULLs
--     aren't compared) but creates a footgun for any subsequent
--     manual INSERT that omits slug. Constraint deferred to
--     ADMIN-v7.4B.B (backfill phase) where slugs are populated
--     for every row first.
--
--   * NO indexes on the new columns. No queries use them yet.
--     Premature optimization. Index when CRUD has produced
--     enough rows to warrant.
--
--   * NO type changes to beers.abv (numeric) or beers.ibu
--     (integer). Both type-drift from canonical text. Path A
--     drops them from the projection rather than rendering a
--     lossy String() cast. v7.4B keeps that posture; type
--     reconciliation is F4-comprehensive territory.
--
--   * NO change to existing tables, columns, FKs, triggers,
--     RLS policies, or admin_* reporting views.
--
-- Hard constraints (carry forward verbatim):
--   * No public app source edits (this migration is invisible
--     to the public app — it doesn't read these columns).
--   * No existing migration edits (new file only).
--   * No Edge Function edits.
--   * No RLS policy changes (new columns inherit existing
--     table RLS; new view uses security_invoker = true).
--   * No QR / localStorage / badge key changes.
--   * No service-role browser exposure (new view granted
--     SELECT to service_role only, not anon/authenticated).
--   * No DELETE on tap_list. No retroactive started_at editing.
--   * Apply path: Supabase Dashboard SQL Editor only, not CLI
--     (CLI blocked by corporate Zscaler TLS interception per
--     prior session evidence).
--
-- Hard-constraint deviation flagged:
--   The kickoff prompt's hard constraint says "No ALTER on
--   existing tables." This migration ALTERS public.beers,
--   public.food_items, and public.tales. The deviation is
--   explicitly approved at gate per ADMIN-v7.4B-prep planning,
--   on the basis that all changes are NULLABLE additive columns
--   with no DEFAULT — they cannot break existing reads, cannot
--   rewrite existing rows, and are reversible via DROP COLUMN.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Wrapped in BEGIN/COMMIT — partial-failure safe.
--   Idempotent: every change uses IF NOT EXISTS guards or
--   CREATE OR REPLACE, so re-running on a fully-applied
--   database is a no-op.
--
-- Rollback (full unwind):
--   ALTER TABLE public.beers       DROP COLUMN IF EXISTS status;
--   ALTER TABLE public.food_items  DROP COLUMN IF EXISTS slug;
--   ALTER TABLE public.food_items  DROP COLUMN IF EXISTS status;
--   ALTER TABLE public.tales       DROP COLUMN IF EXISTS name;
--   ALTER TABLE public.tales       DROP COLUMN IF EXISTS tap_status;
--   ALTER TABLE public.tales       DROP COLUMN IF EXISTS status;
--   DROP VIEW   IF EXISTS public.food;
--   DELETE FROM supabase_migrations.schema_migrations
--    WHERE version = '20260603100000';
--
--   No data loss because new columns hold only NULL for
--   existing rows (no backfill in this migration).
-- ============================================================

begin;

-- ---------- preflight (hard guard) -------------------------------
-- Confirms the four affected tables exist before we attempt to
-- ALTER them. If any is missing, the apply aborts cleanly without
-- touching the others. Defensive against typo-against-wrong-DB
-- mistakes; not expected to fire in normal operation.

do $preflight$
declare
  v_missing text[];
begin
  if not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'beers'
       and c.relkind = 'r'
  ) then
    v_missing := array_append(v_missing, 'public.beers');
  end if;

  if not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'food_items'
       and c.relkind = 'r'
  ) then
    v_missing := array_append(v_missing, 'public.food_items');
  end if;

  if not exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'tales'
       and c.relkind = 'r'
  ) then
    v_missing := array_append(v_missing, 'public.tales');
  end if;

  -- public.food MUST NOT exist as a table — we're creating it as
  -- a view. P8 preflight confirmed it doesn't, but guard anyway.
  if exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'food'
       and c.relkind = 'r'
  ) then
    raise exception
      'preflight failed: public.food already exists as a TABLE — refusing to CREATE VIEW with same name';
  end if;

  if v_missing is not null and array_length(v_missing, 1) > 0 then
    raise exception
      'preflight failed: missing required tables: %', v_missing;
  end if;

  raise notice 'preflight ok: 3 base tables present, public.food name available for view';
end
$preflight$;

-- ---------- beers --------------------------------------------------
-- Add status column (publish/draft state). Nullable, no default;
-- existing 8 rows leave status NULL until backfill phase.

alter table public.beers
  add column if not exists status text;

-- CHECK constraint added separately (not inline) so an idempotent
-- re-run doesn't error on existing constraint. Postgres has no
-- "ADD CONSTRAINT IF NOT EXISTS" so we use a DO block guard.
do $beers_check$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'beers_status_canonical_check'
  ) then
    alter table public.beers
      add constraint beers_status_canonical_check
      check (status is null or status in ('draft','published'));
    raise notice 'added beers_status_canonical_check';
  else
    raise notice 'beers_status_canonical_check already present, skipping';
  end if;
end
$beers_check$;

-- ---------- food_items --------------------------------------------
-- Add slug + status. UNIQUE on slug deferred to backfill phase
-- (per v7.4B planning) since all 4 existing rows would have
-- NULL slug until backfilled.

alter table public.food_items
  add column if not exists slug text;

alter table public.food_items
  add column if not exists status text;

do $food_items_check$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'food_items_status_canonical_check'
  ) then
    alter table public.food_items
      add constraint food_items_status_canonical_check
      check (status is null or status in ('draft','published'));
    raise notice 'added food_items_status_canonical_check';
  else
    raise notice 'food_items_status_canonical_check already present, skipping';
  end if;
end
$food_items_check$;

-- ---------- tales -------------------------------------------------
-- Add name + tap_status + status. The tap_status CHECK matches
-- canonical's enum; same for status. name has no CHECK (free text).

alter table public.tales
  add column if not exists name text;

alter table public.tales
  add column if not exists tap_status text;

alter table public.tales
  add column if not exists status text;

do $tales_tap_status_check$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'tales_tap_status_canonical_check'
  ) then
    alter table public.tales
      add constraint tales_tap_status_canonical_check
      check (tap_status is null
             or tap_status in ('on-tap','retired','coming-soon'));
    raise notice 'added tales_tap_status_canonical_check';
  else
    raise notice 'tales_tap_status_canonical_check already present, skipping';
  end if;
end
$tales_tap_status_check$;

do $tales_status_check$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'tales_status_canonical_check'
  ) then
    alter table public.tales
      add constraint tales_status_canonical_check
      check (status is null or status in ('draft','published'));
    raise notice 'added tales_status_canonical_check';
  else
    raise notice 'tales_status_canonical_check already present, skipping';
  end if;
end
$tales_status_check$;

-- ---------- public.food view --------------------------------------
-- Read-only canonical-name surface over public.food_items.
-- Projects only the columns Path A's listFood() reads (admin app
-- doesn't need slug or status from the view because food_items.slug
-- is brand-new + still NULL on every row, and the view is purely
-- for canonical-name symmetry with public.beers).
--
-- security_invoker = true: callers' privileges determine table
-- access, not the view owner's. service_role has full grants on
-- food_items, so service_role queries through the view work.
-- anon/authenticated have no SELECT grant on the view (granted
-- below), so they cannot reach food_items via this surface.

create or replace view public.food
  with (security_invoker = true)
as
  select id,
         name,
         category,
         is_active,
         updated_at
    from public.food_items;

-- Service-role-only SELECT grant. Not granted to anon or
-- authenticated, matching the admin-only read posture for
-- food_items itself.
revoke all     on public.food from public;
revoke all     on public.food from anon;
revoke all     on public.food from authenticated;
grant select   on public.food to service_role;

-- ---------- post-apply assertion ---------------------------------
-- Confirms the migration ran end-to-end. Raises if any expected
-- column / view is missing. The schema_migrations registry row
-- is inserted SEPARATELY (after this DO block) so this assertion
-- can run before the row exists.

do $postapply$
declare
  v_beers_status_present       boolean;
  v_food_slug_present          boolean;
  v_food_status_present        boolean;
  v_tales_name_present         boolean;
  v_tales_tap_status_present   boolean;
  v_tales_status_present       boolean;
  v_food_view_present          boolean;
begin
  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='beers'
       and column_name='status'
  ) into v_beers_status_present;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='food_items'
       and column_name='slug'
  ) into v_food_slug_present;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='food_items'
       and column_name='status'
  ) into v_food_status_present;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tales'
       and column_name='name'
  ) into v_tales_name_present;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tales'
       and column_name='tap_status'
  ) into v_tales_tap_status_present;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tales'
       and column_name='status'
  ) into v_tales_status_present;

  select exists(
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='food'
       and c.relkind='v'
  ) into v_food_view_present;

  if not (v_beers_status_present
          and v_food_slug_present and v_food_status_present
          and v_tales_name_present and v_tales_tap_status_present
          and v_tales_status_present
          and v_food_view_present) then
    raise exception
      'postapply failed: beers.status=%, food_items.slug=%, food_items.status=%, tales.name=%, tales.tap_status=%, tales.status=%, food view=%',
      v_beers_status_present, v_food_slug_present,
      v_food_status_present, v_tales_name_present,
      v_tales_tap_status_present, v_tales_status_present,
      v_food_view_present;
  end if;

  raise notice
    'POSTAPPLY OK: all 6 columns + food view present';
end
$postapply$;

commit;
