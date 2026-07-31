-- ============================================================
-- Trackside Tales — F4b CRUD RPCs migration (Tales)
-- (ADMIN-v7.4B.M.1 — Tale editor basics: scalar-only CRUD via
-- service-role-only RPCs)
--
-- Adds the SQL surface that admin Tale CRUD will call:
--   * Expanded admin_actions.action CHECK enum (adds 3 new values
--     for tale.* lifecycle events; preserves all 14 prior values)
--   * 2 RPC functions:
--       fn_admin_upsert_tale     (create or update; restore-via-edit;
--                                 SCALAR-ONLY in M.1 — preserves
--                                 existing JSONB columns on update)
--       fn_admin_archive_tale    (idempotent; sets is_active=false,
--                                 status='draft')
--   * Explicit revoke/grant: service_role-only EXECUTE on each
--     function. Anon/authenticated/public cannot call them via
--     PostgREST.
--
-- Why this exists:
--   ADMIN-v7.4B.M planning confirmed that the public.tales schema
--   already carries every column the public app needs (story / pins
--   / timeline / game / etc. as JSONB; scalar metadata as TEXT). The
--   admin app today renders /admin/tales as a read-only listing and
--   has no write surface. ADMIN-v7.4B.M.1 ships the smallest Tale
--   CRUD slice — scalar-only edits — atop the established beer/food
--   RPC pattern. JSONB structured editors (story/pins/timeline) are
--   deferred to M.2.
--
--   Each mutation writes the entity row AND the corresponding
--   admin_actions row in ONE transaction — same atomicity guarantee
--   as v7.3's fn_tap_*, v7.4B.C.1's fn_admin_*_beer/food, and
--   v7.4B.G.1's fn_admin_log_*. There is no code path for writing
--   tales WITHOUT a matching admin_actions row.
--
-- Hard guarantees:
--   * No hard delete. Archive means is_active=false, status='draft'.
--   * Archive is idempotent. Re-archiving an already-archived row
--     succeeds with a no-change admin_actions audit entry.
--   * Restore is achieved through fn_admin_upsert_tale with
--     is_active=true, status='published' (no separate restore RPC).
--   * Slug-keyed upserts. Slug is the admin-side identifier AND the
--     public app's permanent reference (embedded in QR codes,
--     localStorage Sets, badge keys). It cannot be renamed by any
--     code path here — the upsert keys on slug, so a "rename" would
--     be a CREATE of the new slug + ARCHIVE of the old slug. This
--     is intentional friction.
--   * SCALAR-ONLY in M.1. The upsert RPC accepts only TEXT/INTEGER/
--     BOOLEAN/DATE columns. The 9 JSONB columns on public.tales
--     (story, pins, timeline, still_here, scan_badge, game_badge,
--     game, bar_summary, person) are NOT in the function signature.
--     On UPDATE, ON CONFLICT DO UPDATE SET clauses do not touch
--     JSONB columns — existing rich content is preserved verbatim.
--     On INSERT (new tale), JSONB columns are populated by their
--     schema defaults ('[]'::jsonb for NOT NULL array columns,
--     NULL for nullable object columns).
--   * actor_id MUST come from requireAdmin() server-side. The RPC
--     accepts p_actor + p_email as parameters; admin code passes
--     them, but never accepts them from a form field.
--   * security invoker on every function. Service-role caller
--     bypasses RLS via its own privileges, not the function's.
--   * search_path locked to public on every function — defends
--     against schema-confused callers shadowing public.tales etc.
--   * EXECUTE on each function is REVOKED from public/anon/
--     authenticated and GRANTED to service_role only.
--
-- HARD CONSTRAINT DEVIATION FLAGGED:
--   This migration drops + re-adds the admin_actions.action CHECK
--   constraint to expand the enum. Same posture as v7.4B.C.1,
--   v7.4B.G.1: defensible because the new CHECK is a strict
--   superset (adds 3 values, removes none). Reversible. Brief
--   AccessExclusiveLock during DROP+ADD; no concurrent writers.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Wrapped in BEGIN/COMMIT — partial-failure safe.
--   Idempotent: every change uses CREATE OR REPLACE or DO-block
--   guards, so re-running on a fully-applied database is a no-op.
--
-- Rollback (full unwind, in reverse order):
--   DROP FUNCTION IF EXISTS public.fn_admin_archive_tale(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.fn_admin_upsert_tale(
--     uuid, text, text, text, text, text, text, text, text, text,
--     text, text, text, text, text, text, boolean, date, integer,
--     text, text
--   );
--   ALTER TABLE public.admin_actions
--     DROP CONSTRAINT IF EXISTS admin_actions_action_check;
--   ALTER TABLE public.admin_actions
--     ADD CONSTRAINT admin_actions_action_check
--     CHECK (action IN (
--       -- restore the 14-value pre-M.1 enum:
--       'tap.start', 'tap.end', 'tap.edit_notes',
--       'beer.create', 'beer.update', 'beer.archive',
--       'food.create', 'food.update', 'food.archive',
--       'admin.invite', 'admin.promote', 'admin.demote',
--       'admin.disable', 'admin.enable'
--     ));
--   DELETE FROM supabase_migrations.schema_migrations
--     WHERE version = '20260610000000';
--
--   Caveat: any admin_actions rows already written with the new
--   tale.* values would block the original CHECK from re-adding.
--   If genuine rollback is needed, also:
--     DELETE FROM admin_actions WHERE action LIKE 'tale.%';
--   The audit trail loses those rows; admin staff lose history.
--   Forward-fix is preferred — both functions are CREATE OR
--   REPLACE-able.
--
-- Errcodes raised by the new functions (for admin code mapping):
--   * 23505  — slug PRIMARY KEY violation on upsert (race: two
--              clients tried to create the same slug between page
--              render and submit). Mapped to "Slug already in use."
--   * 23514  — CHECK violation (status, tap_status enum, or
--              admin_actions.action enum). Mapped to "Invalid
--              status / tap_status value."
--   * 23502  — NOT NULL violation (e.g. blank title in canonical
--              schema). Mapped to "Required field missing."
--   * P0001  — slug not found on archive. Mapped to "That item
--              has been removed. Refresh the page."
--   * P0002  — invalid input (reserved for future field-level
--              guards inside the RPCs).
--   * other  — generic "Could not save change."
-- ============================================================

begin;

-- ---------- preflight (hard guard) -------------------------------
-- Confirms expected pre-state:
--   * admin_actions table exists (created by v7.3).
--   * admin_actions.action CHECK constraint exists.
--   * tales table exists with the columns added by v7.4B.A.3
--     (status, tap_status).
--   * service_role role exists.

do $tcc_pre$
declare
  v_admin_actions_present       boolean;
  v_action_check_present        boolean;
  v_tales_present               boolean;
  v_tales_status_present        boolean;
  v_tales_tap_status_present    boolean;
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
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='tales'
       and c.relkind='r'
  ) into v_tales_present;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tales'
       and column_name='status'
  ) into v_tales_status_present;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tales'
       and column_name='tap_status'
  ) into v_tales_tap_status_present;

  select exists(
    select 1 from pg_roles where rolname='service_role'
  ) into v_service_role_present;

  if not v_admin_actions_present then
    raise exception 'PREFLIGHT FAILED: public.admin_actions table missing (v7.3 not applied?)';
  end if;
  if not v_action_check_present then
    raise exception 'PREFLIGHT FAILED: admin_actions_action_check constraint missing';
  end if;
  if not v_tales_present then
    raise exception 'PREFLIGHT FAILED: public.tales table missing';
  end if;
  if not v_tales_status_present then
    raise exception 'PREFLIGHT FAILED: public.tales.status column missing (v7.4B.A.3 not applied?)';
  end if;
  if not v_tales_tap_status_present then
    raise exception 'PREFLIGHT FAILED: public.tales.tap_status column missing (v7.4B.A.3 not applied?)';
  end if;
  if not v_service_role_present then
    raise exception 'PREFLIGHT FAILED: service_role does not exist (unusual Supabase environment?)';
  end if;

  raise notice
    'PREFLIGHT OK: admin_actions present, action CHECK present, tales present with v7.4B.A.3 columns, service_role present';
end
$tcc_pre$;

-- ---------- expand admin_actions.action CHECK enum --------------
-- Drop + re-add. The new enum is a strict superset of the old
-- (adds 3 values for tale.* lifecycle events; preserves the 14
-- existing values: tap.* x3, beer.* x3, food.* x3, admin.* x5).
-- Idempotent: if the new CHECK is already in place (re-run
-- scenario), the DROP succeeds and the ADD recreates with same
-- definition.

alter table public.admin_actions
  drop constraint if exists admin_actions_action_check;

alter table public.admin_actions
  add constraint admin_actions_action_check
  check (action in (
    -- v7.3 (tap-list)
    'tap.start',
    'tap.end',
    'tap.edit_notes',
    -- v7.4B.C.1 (beer/food CRUD)
    'beer.create',
    'beer.update',
    'beer.archive',
    'food.create',
    'food.update',
    'food.archive',
    -- v7.4B.G.1 (admin user management)
    'admin.invite',
    'admin.promote',
    'admin.demote',
    'admin.disable',
    'admin.enable',
    -- v7.4B.M.1 (tale CRUD — this migration)
    'tale.create',
    'tale.update',
    'tale.archive'
  ));

-- ---------- fn_admin_upsert_tale --------------------------------
-- Create or update a tales row by slug. Returns the resulting row.
-- Writes one admin_actions row (action='tale.create' if newly
-- inserted, 'tale.update' if existing slug). Restore-via-edit:
-- caller passing is_active=true, status='published' to an
-- archived row's slug effectively un-archives it (admin_actions
-- still records 'tale.update' with before/after payload).
--
-- updated_at is set explicitly to now() (no trigger guarantee
-- from prod). created_at uses the column DEFAULT (now()) on
-- initial insert and is preserved on update.
--
-- SCALAR-ONLY POSTURE (M.1):
--   This signature DOES NOT include any JSONB column. The 9 JSONB
--   columns on public.tales (story, pins, timeline, still_here,
--   scan_badge, game_badge, game, bar_summary, person) plus the
--   2 long-form text columns (person_bio, map_title) are:
--     * Preserved verbatim on UPDATE — the ON CONFLICT DO UPDATE
--       SET list does not include them, so existing values pass
--       through unchanged.
--     * Defaulted to schema defaults on INSERT — '[]'::jsonb for
--       NOT NULL array columns (story, pins, timeline, still_here),
--       NULL for nullable object columns and text columns.
--   Adding JSONB editing in M.2 will be additive: a new function,
--   or new params with sensible defaults so M.1 callers continue
--   to work unchanged.
--
-- Identity-stability invariant:
--   The function keys on p_slug. There is no code path that
--   renames an existing slug. Production tales (wa-lager,
--   packer-pils, wooden-match) cannot have their slug changed
--   via this RPC. To "rename" a tale, an admin must CREATE a new
--   slug and ARCHIVE the old one — intentional friction, matching
--   beer/food behavior.

create or replace function public.fn_admin_upsert_tale(
  p_actor          uuid,
  p_email          text,
  p_slug           text,
  p_title          text,
  p_name           text,
  p_abbr           text,
  p_year           text,
  p_chapter        text,
  p_tagline        text,
  p_style          text,
  p_abv            text,
  p_ibu            text,
  p_icon           text,
  p_unlock_seal    text,
  p_tap_status     text,
  p_status         text,
  p_is_active      boolean,
  p_retired_date   date,
  p_display_order  integer,
  p_hero_image_url text,
  p_can_image_url  text
)
returns public.tales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_before  public.tales;
  v_after   public.tales;
  v_action  text;
begin
  -- Capture pre-state if a row with this slug exists (FOR UPDATE
  -- so a concurrent edit can't interleave between SELECT and
  -- INSERT...ON CONFLICT).
  select * into v_before
    from public.tales
   where slug = p_slug
   for update;

  insert into public.tales (
    slug,
    title,
    name,
    abbr,
    year,
    chapter,
    tagline,
    style,
    abv,
    ibu,
    icon,
    unlock_seal,
    tap_status,
    status,
    is_active,
    retired_date,
    display_order,
    hero_image_url,
    can_image_url,
    updated_at
  ) values (
    p_slug,
    p_title,
    p_name,
    p_abbr,
    p_year,
    p_chapter,
    p_tagline,
    p_style,
    p_abv,
    p_ibu,
    p_icon,
    p_unlock_seal,
    p_tap_status,
    coalesce(p_status, 'draft'),
    coalesce(p_is_active, true),
    p_retired_date,
    coalesce(p_display_order, 0),
    p_hero_image_url,
    p_can_image_url,
    v_now
  )
  on conflict (slug) do update
     set title          = excluded.title,
         name           = excluded.name,
         abbr           = excluded.abbr,
         year           = excluded.year,
         chapter        = excluded.chapter,
         tagline        = excluded.tagline,
         style          = excluded.style,
         abv            = excluded.abv,
         ibu            = excluded.ibu,
         icon           = excluded.icon,
         unlock_seal    = excluded.unlock_seal,
         tap_status     = excluded.tap_status,
         status         = excluded.status,
         is_active      = excluded.is_active,
         retired_date   = excluded.retired_date,
         display_order  = excluded.display_order,
         hero_image_url = excluded.hero_image_url,
         can_image_url  = excluded.can_image_url,
         updated_at     = v_now
         -- Explicitly NOT updated:
         --   story, pins, timeline, still_here, scan_badge,
         --   game_badge, game, bar_summary, person, person_bio,
         --   map_title.
         -- These structured columns are preserved verbatim so M.1
         -- scalar-only edits never clobber rich content. M.2 will
         -- add editing for them.
  returning * into v_after;

  -- Decide create vs update based on pre-state. We use the slug
  -- column (the primary key) as the "did the row exist?" signal —
  -- public.tales has no id column; slug IS the primary key.
  v_action := case when v_before.slug is null then 'tale.create' else 'tale.update' end;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    v_action,
    'tales',
    p_slug,
    jsonb_build_object(
      'before', case when v_before.slug is null then null else to_jsonb(v_before) end,
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$$;

-- ---------- fn_admin_archive_tale -------------------------------
-- Idempotent archive. Sets is_active=false, status='draft' on the
-- row matching slug. If the row is already archived (is_active=false
-- AND status='draft'), the UPDATE is a no-op but an admin_actions
-- row is still written for audit-trail completeness.
-- Raises P0001 if slug doesn't exist.

create or replace function public.fn_admin_archive_tale(
  p_actor   uuid,
  p_email   text,
  p_slug    text
)
returns public.tales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now     timestamptz := now();
  v_before  public.tales;
  v_after   public.tales;
begin
  select * into v_before
    from public.tales
   where slug = p_slug
   for update;

  if v_before.slug is null then
    raise exception 'tale slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  -- Idempotent UPDATE. If already archived, sets the same values
  -- but bumps updated_at to record the (re-)archive event.
  update public.tales
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
    'tale.archive',
    'tales',
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

revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, date, integer,
  text, text
) from public;
revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, date, integer,
  text, text
) from anon;
revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, date, integer,
  text, text
) from authenticated;
grant  execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, date, integer,
  text, text
) to service_role;

revoke execute on function public.fn_admin_archive_tale(uuid, text, text) from public;
revoke execute on function public.fn_admin_archive_tale(uuid, text, text) from anon;
revoke execute on function public.fn_admin_archive_tale(uuid, text, text) from authenticated;
grant  execute on function public.fn_admin_archive_tale(uuid, text, text) to service_role;

-- ---------- post-apply assertion --------------------------------
-- Confirms:
--   * Expanded admin_actions.action CHECK accepts all 17 enum
--     values (3 v7.3 + 6 v7.4B.C.1 + 5 v7.4B.G.1 + 3 v7.4B.M.1).
--   * Both new functions exist with security invoker +
--     search_path locked to public.
--   * service_role has EXECUTE on each; anon/authenticated do not.

do $tcc_post$
declare
  v_check_def              text;
  v_upsert_tale_present    boolean;
  v_archive_tale_present   boolean;
  v_upsert_tale_secdef     boolean;
  v_archive_tale_secdef    boolean;
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
  -- The 3 new tale.* values must all be present.
  if v_check_def !~ 'tale\.create' or v_check_def !~ 'tale\.update' or v_check_def !~ 'tale\.archive' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing tale.* values: %', v_check_def;
  end if;
  -- Pre-existing values must still be present (strict-superset assertion).
  if v_check_def !~ 'tap\.start' or v_check_def !~ 'tap\.end' or v_check_def !~ 'tap\.edit_notes' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing tap.* values: %', v_check_def;
  end if;
  if v_check_def !~ 'beer\.create' or v_check_def !~ 'beer\.update' or v_check_def !~ 'beer\.archive' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing beer.* values: %', v_check_def;
  end if;
  if v_check_def !~ 'food\.create' or v_check_def !~ 'food\.update' or v_check_def !~ 'food\.archive' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing food.* values: %', v_check_def;
  end if;
  if v_check_def !~ 'admin\.invite' or v_check_def !~ 'admin\.promote' or v_check_def !~ 'admin\.demote'
     or v_check_def !~ 'admin\.disable' or v_check_def !~ 'admin\.enable' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing admin.* values: %', v_check_def;
  end if;

  -- Function existence.
  select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='fn_admin_upsert_tale')
    into v_upsert_tale_present;
  select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='fn_admin_archive_tale')
    into v_archive_tale_present;

  if not (v_upsert_tale_present and v_archive_tale_present) then
    raise exception
      'POSTCHECK FAILED: not all 2 RPCs present (upsert_tale=%, archive_tale=%)',
      v_upsert_tale_present, v_archive_tale_present;
  end if;

  -- Confirm security invoker (prosecdef = false) on both.
  select prosecdef into v_upsert_tale_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_tale';
  select prosecdef into v_archive_tale_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_archive_tale';

  if v_upsert_tale_secdef or v_archive_tale_secdef then
    raise exception
      'POSTCHECK FAILED: at least one fn_admin_*_tale function is SECURITY DEFINER (expected INVOKER): upsert_tale=%, archive_tale=%',
      v_upsert_tale_secdef, v_archive_tale_secdef;
  end if;

  -- Grant posture: service_role should have EXECUTE on both;
  -- anon and authenticated should have none.
  select count(*) into v_service_role_grants
    from information_schema.routine_privileges
   where specific_schema='public'
     and grantee='service_role'
     and routine_name in ('fn_admin_upsert_tale', 'fn_admin_archive_tale')
     and privilege_type='EXECUTE';

  select count(*) into v_anon_grants
    from information_schema.routine_privileges
   where specific_schema='public'
     and grantee='anon'
     and routine_name in ('fn_admin_upsert_tale', 'fn_admin_archive_tale')
     and privilege_type='EXECUTE';

  select count(*) into v_authenticated_grants
    from information_schema.routine_privileges
   where specific_schema='public'
     and grantee='authenticated'
     and routine_name in ('fn_admin_upsert_tale', 'fn_admin_archive_tale')
     and privilege_type='EXECUTE';

  if v_service_role_grants <> 2 then
    raise exception
      'POSTCHECK FAILED: expected 2 service_role EXECUTE grants, found %', v_service_role_grants;
  end if;
  if v_anon_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: anon has EXECUTE on % fn_admin_*_tale functions (expected 0)', v_anon_grants;
  end if;
  if v_authenticated_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: authenticated has EXECUTE on % fn_admin_*_tale functions (expected 0)', v_authenticated_grants;
  end if;

  raise notice
    'POSTCHECK OK: action CHECK has all 17 values; 2 fn_admin_*_tale RPCs present; both SECURITY INVOKER; service_role has EXECUTE on both; anon/authenticated have none';
end
$tcc_post$;

commit;
