-- ============================================================
-- Trackside Tales — F4b canonical columns backfill migration
-- (ADMIN-v7.4B.B.1 — populate the columns added by v7.4B.A.3)
--
-- Backfills the 6 nullable columns added by v7.4B.A.3 with
-- canonical-shape values derived from existing prod row state,
-- then adds a UNIQUE constraint to food_items.slug now that all
-- rows have non-null distinct slugs.
--
-- Why this exists:
--   v7.4B.A.3 added beers.status, food_items.slug, food_items.status,
--   tales.name, tales.tap_status, tales.status as nullable columns
--   with no default. Existing 8/4/3 rows hold NULL across those
--   columns. v7.4B Beer/Menu CRUD won't ship with NULL status (the
--   admin UI's published/draft filter would treat all rows the
--   same), and food_items.slug needs UNIQUE before it can serve as
--   an addressable identifier. This backfill populates the columns
--   per the v7.4B.B planning doc.
--
-- Per-column backfill rules (see ADMIN-v7.4B-prep planning):
--
--   beers.status
--     case when is_active then 'published' else 'draft' end
--     Rationale: prod's is_active boolean drives public-app
--     visibility 1:1 with canonical status. All 8 current beers
--     are is_active=true → all 8 receive 'published'.
--
--   food_items.slug
--     trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+',
--                                       '-', 'g'))
--     Rationale: standard Postgres-style slug. P4 preflight
--     confirmed 4 distinct candidate slugs, no collisions.
--
--   food_items.status
--     Same rule as beers.status. All 4 current items → 'published'.
--
--   tales.name
--     (select b.name from beers b where b.id = tales.beer_id)
--     Rationale: canonical tales.name is the short display name
--     matching the associated beer (e.g. 'W.A. Lager'), distinct
--     from the long narrative title. Pulling from the beer FK
--     gives canonical-correct short names. All 3 current tales
--     have non-null beer_id; the JOIN populates name for all 3.
--
--   tales.status
--     Same rule as beers.status. All 3 current tales → 'published'.
--
--   tales.tap_status
--     SKIPPED. Production has no source data for tap_status; the
--     CHECK constraint added in v7.4B.A.3 explicitly allows NULL.
--     v7.5 Tales CRUD will let admin staff set tap_status on
--     first edit. Backfilling a fake default (e.g. 'on-tap' for
--     all) would lie about retired tales.
--
-- Constraint added (post-backfill):
--   food_items_slug_canonical_unique UNIQUE (food_items.slug)
--   Wrapped in DO-block guard for idempotency (Postgres has no
--   ADD CONSTRAINT IF NOT EXISTS).
--
-- Hard guarantees:
--   * Idempotent. Each UPDATE filters on `where <col> is null`
--     so re-running on a populated row is a 0-row no-op. The
--     UNIQUE constraint addition is similarly guarded.
--   * No DDL on existing tables EXCEPT the UNIQUE constraint
--     addition (defensible — same posture as v7.4B.A.3's CHECK
--     additions).
--   * No RLS changes.
--   * No new tables, no new functions, no new triggers.
--   * No public app source edits, no Edge Function edits.
--   * No DELETE on any row.
--   * Wrapped in BEGIN/COMMIT — full transaction rollback on
--     any preflight/postcheck failure.
--   * Pre-backfill assertion confirms expected NULL state and
--     row counts before any UPDATE runs.
--   * Post-backfill assertion confirms every targeted row got
--     its canonical value.
--   * Post-constraint assertion confirms the UNIQUE constraint
--     exists.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Idempotent: safe to re-run on a fully-applied database.
--
-- Rollback (full unwind):
--   ALTER TABLE public.food_items DROP CONSTRAINT IF EXISTS
--     food_items_slug_canonical_unique;
--   UPDATE public.beers      SET status = NULL
--    WHERE status IS NOT NULL;
--   UPDATE public.food_items SET slug = NULL, status = NULL
--    WHERE slug IS NOT NULL OR status IS NOT NULL;
--   UPDATE public.tales      SET name = NULL, status = NULL
--    WHERE name IS NOT NULL OR status IS NOT NULL;
--   DELETE FROM supabase_migrations.schema_migrations
--    WHERE version = '20260603200000';
--
--   No data loss because all backfill values are computable from
--   existing columns (is_active, name, beer_id).
-- ============================================================

begin;

-- ---------- preflight assertion (hard guard) ---------------------
-- Confirms expected pre-backfill state:
--   * Row counts match v7.4B.A.3 V6 baseline (8 / 4 / 3).
--   * All 6 new columns are NULL on every row (i.e. no out-of-band
--     writes since v7.4B.A.3).
--   * Every tale has a non-null beer_id (so the tales.name JOIN
--     lookup will succeed).
-- Aborts the transaction if any check fails. Allows re-run because
-- post-backfill state (some columns populated) is also valid: the
-- preflight only refuses surprising states, not already-completed
-- states.

do $bf_pre$
declare
  v_beers_count             int;
  v_food_count              int;
  v_tales_count             int;
  v_beers_status_nulls      int;
  v_food_slug_nulls         int;
  v_food_status_nulls       int;
  v_tales_name_nulls        int;
  v_tales_status_nulls      int;
  v_tales_with_beer_id      int;
begin
  select count(*) into v_beers_count from public.beers;
  select count(*) into v_food_count  from public.food_items;
  select count(*) into v_tales_count from public.tales;

  if v_beers_count <> 8 then
    raise exception 'PREFLIGHT FAILED: beers row count is % (expected 8)', v_beers_count;
  end if;
  if v_food_count <> 4 then
    raise exception 'PREFLIGHT FAILED: food_items row count is % (expected 4)', v_food_count;
  end if;
  if v_tales_count <> 3 then
    raise exception 'PREFLIGHT FAILED: tales row count is % (expected 3)', v_tales_count;
  end if;

  select count(*) filter (where status is null)    into v_beers_status_nulls    from public.beers;
  select count(*) filter (where slug is null)      into v_food_slug_nulls       from public.food_items;
  select count(*) filter (where status is null)    into v_food_status_nulls     from public.food_items;
  select count(*) filter (where name is null)      into v_tales_name_nulls      from public.tales;
  select count(*) filter (where status is null)    into v_tales_status_nulls    from public.tales;

  -- Each new column must be EITHER fully NULL (pre-backfill) OR
  -- fully populated (already-applied re-run). A mixed state would
  -- indicate something happened between v7.4B.A.3 and now that we
  -- don't understand — refuse to proceed.
  if not (v_beers_status_nulls in (0, v_beers_count)) then
    raise exception 'PREFLIGHT FAILED: beers.status partially populated (% nulls of % rows)',
      v_beers_status_nulls, v_beers_count;
  end if;
  if not (v_food_slug_nulls in (0, v_food_count)) then
    raise exception 'PREFLIGHT FAILED: food_items.slug partially populated (% nulls of % rows)',
      v_food_slug_nulls, v_food_count;
  end if;
  if not (v_food_status_nulls in (0, v_food_count)) then
    raise exception 'PREFLIGHT FAILED: food_items.status partially populated (% nulls of % rows)',
      v_food_status_nulls, v_food_count;
  end if;
  if not (v_tales_name_nulls in (0, v_tales_count)) then
    raise exception 'PREFLIGHT FAILED: tales.name partially populated (% nulls of % rows)',
      v_tales_name_nulls, v_tales_count;
  end if;
  if not (v_tales_status_nulls in (0, v_tales_count)) then
    raise exception 'PREFLIGHT FAILED: tales.status partially populated (% nulls of % rows)',
      v_tales_status_nulls, v_tales_count;
  end if;

  -- All 3 tales must have non-null beer_id for the tales.name JOIN
  -- to succeed. P3 preflight confirmed this.
  select count(*) filter (where beer_id is not null) into v_tales_with_beer_id from public.tales;
  if v_tales_with_beer_id <> v_tales_count then
    raise exception
      'PREFLIGHT FAILED: only % of % tales have non-null beer_id (all required for name backfill JOIN)',
      v_tales_with_beer_id, v_tales_count;
  end if;

  raise notice
    'PREFLIGHT OK: row counts %/%/%; new-column null counts beers.status=%, food_items.slug=%, food_items.status=%, tales.name=%, tales.status=%; tales with beer_id=%/%',
    v_beers_count, v_food_count, v_tales_count,
    v_beers_status_nulls, v_food_slug_nulls, v_food_status_nulls,
    v_tales_name_nulls, v_tales_status_nulls,
    v_tales_with_beer_id, v_tales_count;
end
$bf_pre$;

-- ---------- backfill 1: beers.status ----------------------------
-- Map is_active boolean → published/draft enum.

update public.beers
   set status = case when is_active then 'published' else 'draft' end
 where status is null;

-- ---------- backfill 2: food_items.slug -------------------------
-- Generate slug from name. P4 preflight confirmed no collisions.

update public.food_items
   set slug = trim(both '-' from
                regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
              )
 where slug is null;

-- ---------- backfill 3: food_items.status -----------------------
-- Same rule as beers.

update public.food_items
   set status = case when is_active then 'published' else 'draft' end
 where status is null;

-- ---------- backfill 4: tales.name (JOIN to beers) --------------
-- Pull canonical short name from the linked beer. P3 preflight
-- confirmed every tale has non-null beer_id and every beer_id
-- resolves to a real beer (FK enforced by tales_beer_id_fkey).

update public.tales t
   set name = (select b.name from public.beers b where b.id = t.beer_id)
 where t.name is null
   and t.beer_id is not null;

-- ---------- backfill 5: tales.status ----------------------------
-- Same rule as beers.

update public.tales
   set status = case when is_active then 'published' else 'draft' end
 where status is null;

-- (Backfill 6 — tales.tap_status — INTENTIONALLY OMITTED.
--  See header rationale: leave NULL; v7.5 Tales CRUD sets it
--  per-row on first edit.)

-- ---------- post-backfill assertion ------------------------------
-- Confirms every row got its canonical value, that values pass
-- their respective CHECK constraints (defensive — the constraint
-- itself rejects bad values, but explicit assertion gives clearer
-- failure messages), and that food_items.slug values are distinct.
-- A duplicate slug here would fail the UNIQUE constraint addition
-- below, so check defensively first.

do $bf_post$
declare
  v_beers_status_nulls       int;
  v_food_slug_nulls          int;
  v_food_status_nulls        int;
  v_tales_name_nulls         int;
  v_tales_status_nulls       int;
  v_food_slug_distinct       int;
  v_food_count               int;
  v_beers_invalid_status     int;
  v_food_invalid_status      int;
  v_tales_invalid_status     int;
begin
  select count(*) filter (where status is null)    into v_beers_status_nulls    from public.beers;
  select count(*) filter (where slug is null)      into v_food_slug_nulls       from public.food_items;
  select count(*) filter (where status is null)    into v_food_status_nulls     from public.food_items;
  select count(*) filter (where name is null)      into v_tales_name_nulls      from public.tales;
  select count(*) filter (where status is null)    into v_tales_status_nulls    from public.tales;

  if v_beers_status_nulls <> 0 then
    raise exception 'POSTCHECK FAILED: beers.status still has % NULL rows', v_beers_status_nulls;
  end if;
  if v_food_slug_nulls <> 0 then
    raise exception 'POSTCHECK FAILED: food_items.slug still has % NULL rows', v_food_slug_nulls;
  end if;
  if v_food_status_nulls <> 0 then
    raise exception 'POSTCHECK FAILED: food_items.status still has % NULL rows', v_food_status_nulls;
  end if;
  if v_tales_name_nulls <> 0 then
    raise exception 'POSTCHECK FAILED: tales.name still has % NULL rows', v_tales_name_nulls;
  end if;
  if v_tales_status_nulls <> 0 then
    raise exception 'POSTCHECK FAILED: tales.status still has % NULL rows', v_tales_status_nulls;
  end if;

  -- Defensive value-shape check (CHECK constraints already enforce,
  -- but explicit assertion gives clearer failure context).
  select count(*) filter (where status not in ('draft','published'))
    into v_beers_invalid_status from public.beers;
  if v_beers_invalid_status <> 0 then
    raise exception 'POSTCHECK FAILED: beers has % rows with status outside (draft, published)',
      v_beers_invalid_status;
  end if;

  select count(*) filter (where status not in ('draft','published'))
    into v_food_invalid_status from public.food_items;
  if v_food_invalid_status <> 0 then
    raise exception 'POSTCHECK FAILED: food_items has % rows with status outside (draft, published)',
      v_food_invalid_status;
  end if;

  select count(*) filter (where status not in ('draft','published'))
    into v_tales_invalid_status from public.tales;
  if v_tales_invalid_status <> 0 then
    raise exception 'POSTCHECK FAILED: tales has % rows with status outside (draft, published)',
      v_tales_invalid_status;
  end if;

  -- food_items.slug distinctness — required for the UNIQUE
  -- constraint addition below. P4 preflight surfaced 0 collisions
  -- pre-backfill, so this is just defensive.
  select count(distinct slug), count(*)
    into v_food_slug_distinct, v_food_count
    from public.food_items;
  if v_food_slug_distinct <> v_food_count then
    raise exception
      'POSTCHECK FAILED: food_items.slug collision detected (% distinct vs % rows) — UNIQUE constraint cannot be added',
      v_food_slug_distinct, v_food_count;
  end if;

  raise notice
    'POSTCHECK OK: all 5 backfilled columns populated; CHECK values valid; food_items.slug distinct (% values)',
    v_food_slug_distinct;
end
$bf_post$;

-- ---------- UNIQUE constraint on food_items.slug ----------------
-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS"; DO-block guard
-- enables idempotency on re-run.

do $food_slug_unique$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'food_items_slug_canonical_unique'
  ) then
    alter table public.food_items
      add constraint food_items_slug_canonical_unique unique (slug);
    raise notice 'added food_items_slug_canonical_unique';
  else
    raise notice 'food_items_slug_canonical_unique already present, skipping';
  end if;
end
$food_slug_unique$;

-- ---------- post-constraint assertion ---------------------------
-- Confirms the UNIQUE constraint is now in place.

do $constraint_post$
declare
  v_present boolean;
begin
  select exists (
    select 1 from pg_constraint
     where conname = 'food_items_slug_canonical_unique'
       and contype = 'u'
  ) into v_present;

  if not v_present then
    raise exception 'POSTCHECK FAILED: food_items_slug_canonical_unique not present after add';
  end if;

  raise notice 'POSTCHECK OK: food_items_slug_canonical_unique present (UNIQUE)';
end
$constraint_post$;

commit;
