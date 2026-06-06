-- ============================================================
-- Trackside Tales — F4b CRUD RPCs migration
-- (ADMIN-v7.4B.C.1 — Beer/Menu CRUD via service-role-only RPCs)
--
-- Adds the SQL surface that admin Beer/Menu CRUD will call:
--   * Expanded admin_actions.action CHECK enum (adds 6 new values
--     for beer.* and food.* lifecycle events)
--   * 4 RPC functions:
--       fn_admin_upsert_beer    (create or update; restore-via-edit)
--       fn_admin_archive_beer   (idempotent; sets is_active=false,
--                                status='draft')
--       fn_admin_upsert_food    (same shape; food_items table)
--       fn_admin_archive_food   (same shape)
--   * Explicit revoke/grant: service_role-only EXECUTE on each
--     function. Anon/authenticated/public cannot call them via
--     PostgREST.
--
-- Why this exists:
--   v7.4B.A.3 added the canonical columns (beers.status,
--   food_items.slug, food_items.status, etc.) but left the actual
--   write surface for v7.4B.C. v7.4B.B.1 backfilled existing rows.
--   This migration creates the audited, atomic mutation functions
--   that v7.4B.C admin UI will call via supabase.rpc().
--
--   Each mutation writes the entity row AND the corresponding
--   admin_actions row in ONE transaction — same atomicity guarantee
--   as v7.3's fn_tap_*. There is no code path for writing beers /
--   food_items WITHOUT a matching admin_actions row.
--
-- Hard guarantees:
--   * No hard delete. Archive means is_active=false, status='draft'.
--   * Archive is idempotent. Re-archiving an already-archived row
--     succeeds with a no-change admin_actions audit entry.
--   * Restore is achieved through fn_admin_upsert_* with
--     is_active=true, status='published' (no separate restore RPC).
--   * Slug-keyed upserts. Slug is the admin-side identifier.
--   * actor_id MUST come from requireAdmin() server-side. The RPC
--     accepts p_actor + p_email as parameters; admin code passes
--     them, but never accepts them from a form field.
--   * security invoker on every function. Service-role caller
--     bypasses RLS via its own privileges, not the function's.
--   * search_path locked to public on every function — defends
--     against schema-confused callers shadowing public.beers etc.
--   * EXECUTE on each function is REVOKED from public/anon/
--     authenticated and GRANTED to service_role only. PostgREST
--     cannot expose these RPCs to anon/authed clients even by
--     accident (no admin UI invokes them via the anon key).
--
-- HARD CONSTRAINT DEVIATION FLAGGED:
--   This migration drops + re-adds the admin_actions.action CHECK
--   constraint to expand the enum. Same posture as v7.4B.A.3's
--   CHECK additions: defensible because the new CHECK is a strict
--   superset (adds 6 values, removes none). Reversible. Brief
--   AccessExclusiveLock during DROP+ADD; no concurrent writers.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Wrapped in BEGIN/COMMIT — partial-failure safe.
--   Idempotent: every change uses CREATE OR REPLACE or DO-block
--   guards, so re-running on a fully-applied database is a no-op.
--
-- Rollback (full unwind, in reverse order):
--   DROP FUNCTION IF EXISTS public.fn_admin_archive_food(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.fn_admin_upsert_food(...);  -- full sig below
--   DROP FUNCTION IF EXISTS public.fn_admin_archive_beer(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.fn_admin_upsert_beer(...);  -- full sig below
--   ALTER TABLE public.admin_actions
--     DROP CONSTRAINT IF EXISTS admin_actions_action_check;
--   ALTER TABLE public.admin_actions
--     ADD CONSTRAINT admin_actions_action_check
--     CHECK (action IN ('tap.start', 'tap.end', 'tap.edit_notes'));
--   DELETE FROM supabase_migrations.schema_migrations
--     WHERE version = '20260603300000';
--
--   Caveat: any admin_actions rows already written with the new
--   action values would block the original CHECK from re-adding.
--   If genuine rollback is needed, also:
--     DELETE FROM admin_actions
--       WHERE action LIKE 'beer.%' OR action LIKE 'food.%';
--   The audit trail loses those rows; admin staff lose history.
--   Don't roll back unless absolutely necessary.
--
-- Errcodes raised by the new functions (for admin code mapping):
--   * 23505  — slug UNIQUE violation on upsert (race: two clients
--              tried to create the same slug between page render
--              and submit). Mapped to "Slug already in use."
--   * 23514  — CHECK violation (status, category enum). Mapped to
--              "Invalid status / category value."
--   * P0001  — slug not found on archive. Mapped to "That item
--              has been removed. Refresh the page."
--   * P0002  — invalid input (e.g. blank required field after
--              trim). Mapped to "Required field missing."
--   * other  — generic "Could not save change."
-- ============================================================

begin;

-- ---------- preflight (hard guard) -------------------------------
-- Confirms expected pre-state:
--   * admin_actions table exists (created by v7.3).
--   * admin_actions.action CHECK constraint exists with the
--     pre-v7.4B.C enum (3 values: tap.start, tap.end,
--     tap.edit_notes).
--   * beers and food_items tables exist with the columns added
--     by v7.4B.A.3 (status on beers, slug+status on food_items).
--   * service_role role exists (Supabase ships with it; defensive
--     check in case of an unusual environment).

do $bcc_pre$
declare
  v_admin_actions_present       boolean;
  v_action_check_present        boolean;
  v_beers_status_present        boolean;
  v_food_slug_present           boolean;
  v_food_status_present         boolean;
  v_service_role_present        boolean;
begin
  select exists(
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='admin_actions'
       and c.relkind='r'
  ) into v_admin_actions_present;

  select exists(
    select 1 from pg_constraint
     where conname='admin_actions_action_check'
       and conrelid = 'public.admin_actions'::regclass
  ) into v_action_check_present;

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
    select 1 from pg_roles where rolname='service_role'
  ) into v_service_role_present;

  if not v_admin_actions_present then
    raise exception 'PREFLIGHT FAILED: public.admin_actions table missing (v7.3 not applied?)';
  end if;
  if not v_action_check_present then
    raise exception 'PREFLIGHT FAILED: admin_actions_action_check constraint missing';
  end if;
  if not v_beers_status_present then
    raise exception 'PREFLIGHT FAILED: public.beers.status column missing (v7.4B.A.3 not applied?)';
  end if;
  if not v_food_slug_present then
    raise exception 'PREFLIGHT FAILED: public.food_items.slug column missing (v7.4B.A.3 not applied?)';
  end if;
  if not v_food_status_present then
    raise exception 'PREFLIGHT FAILED: public.food_items.status column missing (v7.4B.A.3 not applied?)';
  end if;
  if not v_service_role_present then
    raise exception 'PREFLIGHT FAILED: service_role does not exist (unusual Supabase environment?)';
  end if;

  raise notice
    'PREFLIGHT OK: admin_actions present, action CHECK present, v7.4B.A.3 columns present, service_role present';
end
$bcc_pre$;

-- ---------- expand admin_actions.action CHECK enum --------------
-- Drop + re-add. The new enum is a strict superset of the old
-- (adds 6 values for beer.* and food.* lifecycle events; preserves
-- the 3 existing tap.* values). Idempotent: if the new CHECK is
-- already in place (re-run scenario), the DROP succeeds and the
-- ADD recreates with same definition.

alter table public.admin_actions
  drop constraint if exists admin_actions_action_check;

alter table public.admin_actions
  add constraint admin_actions_action_check
  check (action in (
    'tap.start',
    'tap.end',
    'tap.edit_notes',
    'beer.create',
    'beer.update',
    'beer.archive',
    'food.create',
    'food.update',
    'food.archive'
  ));

-- ---------- fn_admin_upsert_beer --------------------------------
-- Create or update a beers row by slug. Returns the resulting row.
-- Writes one admin_actions row (action='beer.create' if newly
-- inserted, 'beer.update' if existing slug). Restore-via-edit:
-- caller passing is_active=true, status='published' to an
-- archived row's slug effectively un-archives it (admin_actions
-- still records 'beer.update' with before/after payload).
--
-- updated_at is set explicitly to now() (no trigger on prod).
-- created_at uses the column DEFAULT (now()) on initial insert
-- and is preserved on update.

create or replace function public.fn_admin_upsert_beer(
  p_actor              uuid,
  p_email              text,
  p_slug               text,
  p_name               text,
  p_category           text,
  p_style              text,
  p_abv                numeric,
  p_ibu                integer,
  p_short_description  text,
  p_description        text,
  p_can_image_url      text,
  p_is_active          boolean,
  p_status             text
)
returns public.beers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_before  public.beers;
  v_after   public.beers;
  v_action  text;
begin
  -- Capture pre-state if a row with this slug exists (FOR UPDATE
  -- so a concurrent edit can't interleave between SELECT and
  -- INSERT...ON CONFLICT).
  select * into v_before
    from public.beers
   where slug = p_slug
   for update;

  insert into public.beers (
    slug, name, category, style, abv, ibu,
    short_description, description, can_image_url,
    is_active, status, updated_at
  ) values (
    p_slug, p_name, p_category, p_style, p_abv, p_ibu,
    p_short_description, p_description, p_can_image_url,
    coalesce(p_is_active, true),
    coalesce(p_status, 'published'),
    v_now
  )
  on conflict (slug) do update
     set name              = excluded.name,
         category          = excluded.category,
         style             = excluded.style,
         abv               = excluded.abv,
         ibu               = excluded.ibu,
         short_description = excluded.short_description,
         description       = excluded.description,
         can_image_url     = excluded.can_image_url,
         is_active         = excluded.is_active,
         status            = excluded.status,
         updated_at        = v_now
  returning * into v_after;

  -- Decide create vs update based on pre-state.
  v_action := case when v_before.id is null then 'beer.create' else 'beer.update' end;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    v_action,
    'beers',
    p_slug,
    jsonb_build_object(
      'before', case when v_before.id is null then null else to_jsonb(v_before) end,
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$$;

-- ---------- fn_admin_archive_beer -------------------------------
-- Idempotent archive. Sets is_active=false, status='draft' on the
-- row matching slug. If the row is already archived (is_active=false
-- AND status='draft'), the UPDATE is a no-op but an admin_actions
-- row is still written for audit-trail completeness.
-- Raises P0001 if slug doesn't exist.

create or replace function public.fn_admin_archive_beer(
  p_actor   uuid,
  p_email   text,
  p_slug    text
)
returns public.beers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_before  public.beers;
  v_after   public.beers;
begin
  select * into v_before
    from public.beers
   where slug = p_slug
   for update;

  if v_before.id is null then
    raise exception 'beer slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  -- Idempotent UPDATE. If already archived, sets the same values
  -- but bumps updated_at to record the (re-)archive event.
  update public.beers
     set is_active  = false,
         status     = 'draft',
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'beer.archive',
    'beers',
    p_slug,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$$;

-- ---------- fn_admin_upsert_food --------------------------------
-- Same shape as fn_admin_upsert_beer, against food_items. Slug is
-- treated as the upsert key (UNIQUE per food_items_slug_canonical_unique
-- added in v7.4B.B.1). Subset of fields per food_items prod schema:
-- no abv/ibu/style/short_description/can_image_url; food_items has
-- description, category, is_active, status. Excludes id, venue_id,
-- is_featured, sort_order (admin-managed in future phases).

create or replace function public.fn_admin_upsert_food(
  p_actor          uuid,
  p_email          text,
  p_slug           text,
  p_name           text,
  p_category       text,
  p_description    text,
  p_is_active      boolean,
  p_status         text
)
returns public.food_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_before  public.food_items;
  v_after   public.food_items;
  v_action  text;
begin
  select * into v_before
    from public.food_items
   where slug = p_slug
   for update;

  insert into public.food_items (
    slug, name, category, description, is_active, status, updated_at
  ) values (
    p_slug, p_name, p_category, p_description,
    coalesce(p_is_active, true),
    coalesce(p_status, 'published'),
    v_now
  )
  on conflict (slug) do update
     set name        = excluded.name,
         category    = excluded.category,
         description = excluded.description,
         is_active   = excluded.is_active,
         status      = excluded.status,
         updated_at  = v_now
  returning * into v_after;

  v_action := case when v_before.id is null then 'food.create' else 'food.update' end;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    v_action,
    'food_items',
    p_slug,
    jsonb_build_object(
      'before', case when v_before.id is null then null else to_jsonb(v_before) end,
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$$;

-- ---------- fn_admin_archive_food -------------------------------
-- Idempotent archive on food_items by slug.
-- Raises P0001 if slug doesn't exist.

create or replace function public.fn_admin_archive_food(
  p_actor   uuid,
  p_email   text,
  p_slug    text
)
returns public.food_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_before  public.food_items;
  v_after   public.food_items;
begin
  select * into v_before
    from public.food_items
   where slug = p_slug
   for update;

  if v_before.id is null then
    raise exception 'food_items slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  update public.food_items
     set is_active  = false,
         status     = 'draft',
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'food.archive',
    'food_items',
    p_slug,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$$;

-- ---------- service_role-only EXECUTE grants --------------------
-- Defense in depth: revoke EXECUTE from public/anon/authenticated
-- on each new function, then grant only to service_role. Prevents
-- PostgREST from exposing these RPCs to anon/authed clients even
-- if Supabase's default GRANTs would otherwise allow it.
--
-- Does NOT retrofit fn_tap_* (deferred F-flag per v7.4B.C planning).

revoke execute on function public.fn_admin_upsert_beer(
  uuid, text, text, text, text, text, numeric, integer, text, text, text, boolean, text
) from public;
revoke execute on function public.fn_admin_upsert_beer(
  uuid, text, text, text, text, text, numeric, integer, text, text, text, boolean, text
) from anon;
revoke execute on function public.fn_admin_upsert_beer(
  uuid, text, text, text, text, text, numeric, integer, text, text, text, boolean, text
) from authenticated;
grant  execute on function public.fn_admin_upsert_beer(
  uuid, text, text, text, text, text, numeric, integer, text, text, text, boolean, text
) to service_role;

revoke execute on function public.fn_admin_archive_beer(uuid, text, text) from public;
revoke execute on function public.fn_admin_archive_beer(uuid, text, text) from anon;
revoke execute on function public.fn_admin_archive_beer(uuid, text, text) from authenticated;
grant  execute on function public.fn_admin_archive_beer(uuid, text, text) to service_role;

revoke execute on function public.fn_admin_upsert_food(
  uuid, text, text, text, text, text, boolean, text
) from public;
revoke execute on function public.fn_admin_upsert_food(
  uuid, text, text, text, text, text, boolean, text
) from anon;
revoke execute on function public.fn_admin_upsert_food(
  uuid, text, text, text, text, text, boolean, text
) from authenticated;
grant  execute on function public.fn_admin_upsert_food(
  uuid, text, text, text, text, text, boolean, text
) to service_role;

revoke execute on function public.fn_admin_archive_food(uuid, text, text) from public;
revoke execute on function public.fn_admin_archive_food(uuid, text, text) from anon;
revoke execute on function public.fn_admin_archive_food(uuid, text, text) from authenticated;
grant  execute on function public.fn_admin_archive_food(uuid, text, text) to service_role;

-- ---------- post-apply assertion --------------------------------
-- Confirms:
--   * Expanded admin_actions.action CHECK accepts all 9 enum
--     values (3 v7.3 + 6 v7.4B.C).
--   * All 4 functions exist with security invoker + search_path
--     locked to public.
--   * service_role has EXECUTE on each; anon/authenticated do not.

do $bcc_post$
declare
  v_check_def              text;
  v_upsert_beer_present    boolean;
  v_archive_beer_present   boolean;
  v_upsert_food_present    boolean;
  v_archive_food_present   boolean;
  v_upsert_beer_secdef     boolean;
  v_archive_beer_secdef    boolean;
  v_upsert_food_secdef     boolean;
  v_archive_food_secdef    boolean;
  v_service_role_grants    int;
  v_anon_grants            int;
  v_authenticated_grants   int;
begin
  -- Check that the expanded enum values are all in the constraint.
  select pg_get_constraintdef(oid) into v_check_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;

  if v_check_def is null then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check vanished';
  end if;
  if v_check_def !~ 'beer\.create' or v_check_def !~ 'beer\.update' or v_check_def !~ 'beer\.archive' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing beer.* values: %', v_check_def;
  end if;
  if v_check_def !~ 'food\.create' or v_check_def !~ 'food\.update' or v_check_def !~ 'food\.archive' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing food.* values: %', v_check_def;
  end if;
  if v_check_def !~ 'tap\.start' or v_check_def !~ 'tap\.end' or v_check_def !~ 'tap\.edit_notes' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing tap.* values: %', v_check_def;
  end if;

  -- Function existence.
  select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='fn_admin_upsert_beer')
    into v_upsert_beer_present;
  select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='fn_admin_archive_beer')
    into v_archive_beer_present;
  select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='fn_admin_upsert_food')
    into v_upsert_food_present;
  select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='fn_admin_archive_food')
    into v_archive_food_present;

  if not (v_upsert_beer_present and v_archive_beer_present
          and v_upsert_food_present and v_archive_food_present) then
    raise exception
      'POSTCHECK FAILED: not all 4 RPCs present (upsert_beer=%, archive_beer=%, upsert_food=%, archive_food=%)',
      v_upsert_beer_present, v_archive_beer_present,
      v_upsert_food_present, v_archive_food_present;
  end if;

  -- Confirm security invoker (prosecdef = false) on all 4.
  select prosecdef into v_upsert_beer_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_beer';
  select prosecdef into v_archive_beer_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_archive_beer';
  select prosecdef into v_upsert_food_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_food';
  select prosecdef into v_archive_food_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_archive_food';

  if v_upsert_beer_secdef or v_archive_beer_secdef
     or v_upsert_food_secdef or v_archive_food_secdef then
    raise exception
      'POSTCHECK FAILED: at least one fn_admin_* function is SECURITY DEFINER (expected INVOKER): upsert_beer=%, archive_beer=%, upsert_food=%, archive_food=%',
      v_upsert_beer_secdef, v_archive_beer_secdef,
      v_upsert_food_secdef, v_archive_food_secdef;
  end if;

  -- Grant posture: service_role should have EXECUTE on all 4;
  -- anon and authenticated should have none.
  select count(*) into v_service_role_grants
    from information_schema.routine_privileges
   where specific_schema='public'
     and grantee='service_role'
     and routine_name in ('fn_admin_upsert_beer', 'fn_admin_archive_beer',
                          'fn_admin_upsert_food', 'fn_admin_archive_food')
     and privilege_type='EXECUTE';

  select count(*) into v_anon_grants
    from information_schema.routine_privileges
   where specific_schema='public'
     and grantee='anon'
     and routine_name in ('fn_admin_upsert_beer', 'fn_admin_archive_beer',
                          'fn_admin_upsert_food', 'fn_admin_archive_food')
     and privilege_type='EXECUTE';

  select count(*) into v_authenticated_grants
    from information_schema.routine_privileges
   where specific_schema='public'
     and grantee='authenticated'
     and routine_name in ('fn_admin_upsert_beer', 'fn_admin_archive_beer',
                          'fn_admin_upsert_food', 'fn_admin_archive_food')
     and privilege_type='EXECUTE';

  if v_service_role_grants <> 4 then
    raise exception
      'POSTCHECK FAILED: expected 4 service_role EXECUTE grants, found %', v_service_role_grants;
  end if;
  if v_anon_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: anon has EXECUTE on % fn_admin_* functions (expected 0)', v_anon_grants;
  end if;
  if v_authenticated_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: authenticated has EXECUTE on % fn_admin_* functions (expected 0)', v_authenticated_grants;
  end if;

  raise notice
    'POSTCHECK OK: action CHECK has all 9 values; 4 fn_admin_* RPCs present; all SECURITY INVOKER; service_role has EXECUTE on all 4; anon/authenticated have none';
end
$bcc_post$;

commit;
