-- ============================================================
-- Trackside Tales — Tale content RPC
-- (ADMIN-v7.4B.M.2 — Structured editors for timeline + map_points
-- via a NEW service-role-only RPC, leaving M.1.1's
-- fn_admin_upsert_tale unchanged)
--
-- Why this exists:
--   M.1.1 narrowed fn_admin_upsert_tale to a 16-column scalar-only
--   write surface and explicitly preserved the 2 production jsonb
--   columns (timeline, map_points) verbatim on UPDATE — they're
--   absent from the ON CONFLICT DO UPDATE SET list.
--
--   M.2 introduces structured editors for those two jsonb columns
--   on /admin/tales/[slug]/edit. Rather than widen
--   fn_admin_upsert_tale a third time (M.1 → M.1.1 → M.2), this
--   migration adds a SEPARATE function that ONLY touches:
--     * timeline   (jsonb)
--     * map_points (jsonb)
--     * updated_at (system)
--   Smaller blast radius. Easier to reason about. Audit-trail-clean
--   (every save writes one tale.update row with full-row
--   before/after payload, same as the scalar upsert).
--
--   The admin /edit page renders TWO independent forms — the
--   M.1.1 scalar form and the new M.2 content form — each
--   posting to its own Server Action and its own RPC. This keeps
--   the two write paths atomically separable: a scalar save and a
--   content save are distinct admin_actions rows, distinct
--   updated_at bumps, and either can fail without affecting the
--   other.
--
-- Hard guarantees (preserved from M.1.1):
--   * Service-role-only EXECUTE. anon/authenticated/public cannot
--     call this RPC via PostgREST.
--   * SECURITY INVOKER + locked search_path = public.
--   * Atomic: tales row UPDATE + admin_actions INSERT happen in
--     the same transaction. No code path updates content without
--     writing an audit row.
--   * Slug-keyed lookup. Raises P0001 if slug doesn't exist —
--     same posture as fn_admin_archive_tale.
--   * REPLACE semantics (not merge). The admin form sends the
--     complete intended timeline + map_points arrays each save;
--     the RPC overwrites the columns. Removed rows are removed.
--     Added rows are added. Any unknown extra fields on existing
--     rows would be stripped, but the diagnostic confirmed
--     production content matches the documented shape.
--   * NULL inputs are normalized to '[]'::jsonb. The admin's Zod
--     layer always sends arrays (possibly empty), but COALESCE
--     here is belt-and-suspenders.
--   * Defensive jsonb_typeof check rejects non-array payloads
--     (P0002). Zod enforces this client-side; the RPC re-checks
--     because PL/pgSQL doesn't validate body params.
--
-- Identity-stability invariant:
--   Slug is the lookup key. There is no slug-rename path here —
--   the function only writes to (timeline, map_points,
--   updated_at). Production tales (wa-lager, packer-pilsner,
--   wooden-match-amber) cannot have their slug, scalar fields,
--   or any other column changed via this function.
--
-- What this migration does NOT change:
--   * fn_admin_upsert_tale (M.1.1 18-arg signature) — untouched.
--   * fn_admin_archive_tale (M.1 3-arg signature) — untouched.
--   * admin_actions_action_check — untouched. Uses the existing
--     'tale.update' value added by M.1.
--   * tales table schema — untouched. timeline + map_points
--     already exist on production (jsonb, nullable).
--   * RLS policies — untouched. Service-role bypasses RLS via
--     its own privileges; SECURITY INVOKER preserves that.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Wrapped in BEGIN/COMMIT — partial-failure safe.
--   Idempotent: CREATE OR REPLACE; preflight tolerates re-runs.
--
-- Rollback (full unwind):
--   The forward-fix posture from M.1.1 still applies — the
--   function is CREATE OR REPLACE-able, and the function has no
--   public-app dependency (the public app's contentService.ts
--   queries canonical column names that don't map to production
--   anyway, so M.2 writes are dormant until a future M.5
--   reconciles that). If a true rollback is required:
--
--     DROP FUNCTION IF EXISTS public.fn_admin_upsert_tale_content(
--       uuid, text, text, jsonb, jsonb
--     );
--     DELETE FROM supabase_migrations.schema_migrations
--       WHERE version='20260610020000';
--
--   Caveat: any admin_actions rows already written by this
--   function would remain. They use the existing 'tale.update'
--   action value already in the M.1 enum, so they don't block
--   rollback. The audit trail keeps them. None will exist before
--   this migration applies.
--
-- Errcodes raised by the new function (sanitized in admin code):
--   * P0001 — slug not found. Mapped to "That tale has been
--             removed. Refresh the page."
--   * P0002 — payload not a JSON array (defensive; Zod catches
--             first). Mapped to generic "Could not save change."
--   * 23514 — CHECK violation. None of the touched columns
--             carry CHECK constraints, so this is unreachable
--             from this function's UPDATE. Reserved.
--   * other — generic "Could not save change."
-- ============================================================

begin;

-- ---------- preflight (hard guard) -------------------------------
-- Confirms expected pre-state:
--   * admin_actions table + CHECK constraint present.
--   * admin_actions_action_check already accepts 'tale.update'
--     (added by M.1; defensive re-check).
--   * tales table present with the columns this function will
--     read/write: id, slug, timeline, map_points, updated_at.
--   * tales_slug_key UNIQUE constraint or unique index on (slug)
--     is present (so the FOR UPDATE lookup is correct under
--     concurrent edits).
--   * service_role role exists.

do $tcc2_pre$
declare
  v_admin_actions_present     boolean;
  v_action_check_present      boolean;
  v_action_check_def          text;
  v_tales_present             boolean;
  v_missing_cols              text;
  v_slug_unique_present       boolean;
  v_service_role_present      boolean;
  v_required_cols constant text[] := array[
    'id', 'slug', 'timeline', 'map_points', 'updated_at'
  ];
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

  select pg_get_constraintdef(oid) into v_action_check_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;

  select exists(
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='tales'
       and c.relkind='r'
  ) into v_tales_present;

  -- Compute the set of required columns that are NOT present.
  select string_agg(req, ', ' order by req)
    into v_missing_cols
    from unnest(v_required_cols) as req
   where not exists(
     select 1 from information_schema.columns
      where table_schema='public' and table_name='tales'
        and column_name = req
   );

  -- Slug must support FOR UPDATE row lookup. Either a UNIQUE
  -- constraint OR a unique index on exactly {slug} is sufficient.
  select exists(
    select 1
      from pg_index ix
      join pg_class i  on i.oid = ix.indexrelid
      join pg_class t  on t.oid = ix.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = ix.indkey[0]
     where n.nspname='public'
       and t.relname='tales'
       and ix.indisunique
       and array_length(ix.indkey, 1) = 1
       and a.attname = 'slug'
  ) into v_slug_unique_present;

  select exists(
    select 1 from pg_roles where rolname='service_role'
  ) into v_service_role_present;

  if not v_admin_actions_present then
    raise exception 'PREFLIGHT FAILED: public.admin_actions table missing';
  end if;
  if not v_action_check_present then
    raise exception 'PREFLIGHT FAILED: admin_actions_action_check constraint missing';
  end if;
  if v_action_check_def is null or v_action_check_def !~ 'tale\.update' then
    raise exception
      'PREFLIGHT FAILED: admin_actions_action_check missing tale.update value (M.1 not applied?): %',
      v_action_check_def;
  end if;
  if not v_tales_present then
    raise exception 'PREFLIGHT FAILED: public.tales table missing';
  end if;
  if v_missing_cols is not null then
    raise exception
      'PREFLIGHT FAILED: public.tales is missing required columns for content RPC: %',
      v_missing_cols;
  end if;
  if not v_slug_unique_present then
    raise exception
      'PREFLIGHT FAILED: public.tales has no UNIQUE constraint or unique index on (slug); FOR UPDATE lookup would not be uniquely identified';
  end if;
  if not v_service_role_present then
    raise exception 'PREFLIGHT FAILED: service_role does not exist';
  end if;

  raise notice
    'PREFLIGHT OK: admin_actions present with tale.update enum value; tales present with timeline/map_points/updated_at columns; slug uniqueness present; service_role present';
end
$tcc2_pre$;

-- ---------- CREATE OR REPLACE fn_admin_upsert_tale_content -----
-- Service-role-only RPC for writing tales.timeline and
-- tales.map_points jsonb columns. Slug-keyed; full-row before/after
-- audit payload; REPLACE semantics on both arrays.

create or replace function public.fn_admin_upsert_tale_content(
  p_actor       uuid,
  p_email       text,
  p_slug        text,
  p_timeline    jsonb,
  p_map_points  jsonb
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
  -- Capture pre-state. FOR UPDATE so a concurrent scalar edit
  -- (via fn_admin_upsert_tale) can't interleave between SELECT
  -- and UPDATE.
  select * into v_before
    from public.tales
   where slug = p_slug
   for update;

  if v_before.id is null then
    raise exception 'tale slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  -- Defensive shape check. The admin's Zod layer enforces this,
  -- but PL/pgSQL doesn't validate body params, so we re-check.
  -- A non-array payload (object, string, number) gets rejected
  -- before the UPDATE runs.
  if p_timeline is not null and jsonb_typeof(p_timeline) <> 'array' then
    raise exception 'p_timeline must be a JSON array (got %)', jsonb_typeof(p_timeline)
      using errcode = 'P0002';
  end if;
  if p_map_points is not null and jsonb_typeof(p_map_points) <> 'array' then
    raise exception 'p_map_points must be a JSON array (got %)', jsonb_typeof(p_map_points)
      using errcode = 'P0002';
  end if;

  -- REPLACE semantics. Whatever the admin form sends is the new
  -- value of the column, regardless of what was there before.
  -- NULL inputs are normalized to '[]'::jsonb so the columns
  -- always carry an array (matches the canonical TS reader's
  -- expectations and avoids null-vs-empty-array ambiguity).
  --
  -- Explicitly NOT updated:
  --   id           (PK; system-managed)
  --   slug         (lookup key; immutable from this function)
  --   title, name, year, chapter_label, subtitle,
  --   person_or_place, story_body, intro_type, intro_asset_url,
  --   stamp_image_url, tap_status, status, is_active, sort_order,
  --   mini_game_type   — all M.1.1 scalar columns; preserved
  --   verbatim because this function only writes the two jsonb
  --   columns. The scalar columns are managed by
  --   fn_admin_upsert_tale (M.1.1 18-arg signature).
  --   beer_id, venue_id   — relational; deferred.
  --   created_at          — system-managed.
  update public.tales
     set timeline   = coalesce(p_timeline,   '[]'::jsonb),
         map_points = coalesce(p_map_points, '[]'::jsonb),
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

  -- Single audit row per save. Action is always 'tale.update'
  -- (the function only ever updates an existing row; creation
  -- of new tales goes through fn_admin_upsert_tale). Payload
  -- includes full-row before/after for symmetry with M.1's
  -- scalar audit format — operators reading /admin/audit can
  -- diff the timeline / map_points fields directly.
  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'tale.update',
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

-- ---------- service_role-only EXECUTE grants ---------------------
-- Defense in depth: revoke EXECUTE from public/anon/authenticated
-- on the new function, then grant only to service_role. Prevents
-- PostgREST from exposing this RPC to anon/authed clients even if
-- Supabase's default GRANTs would otherwise allow it.

revoke execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb
) from public;
revoke execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb
) from anon;
revoke execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb
) from authenticated;
grant  execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb
) to service_role;

-- ---------- post-apply assertions --------------------------------
-- Confirms the migration end-state:
--   * fn_admin_upsert_tale_content exists with the exact 5-arg sig.
--   * It is SECURITY INVOKER (prosecdef = false).
--   * service_role has 1 EXECUTE grant on the new function.
--   * anon / authenticated have 0 EXECUTE grants.
--   * fn_admin_upsert_tale (M.1.1 18-arg) is still present.
--   * fn_admin_archive_tale (M.1 3-arg) is still present.
--   * admin_actions_action_check still has 'tale.update'.

do $tcc2_post$
declare
  v_check_def              text;
  v_content_present        boolean;
  v_content_secdef         boolean;
  v_upsert_present         boolean;
  v_archive_present        boolean;
  v_service_role_grants    int;
  v_anon_grants            int;
  v_authenticated_grants   int;
begin
  -- New content function must exist with exactly 5 args.
  select exists(
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname='fn_admin_upsert_tale_content'
       and p.pronargs = 5
  ) into v_content_present;

  if not v_content_present then
    raise exception 'POSTCHECK FAILED: fn_admin_upsert_tale_content (5-arg) missing';
  end if;

  -- Confirm SECURITY INVOKER (prosecdef = false).
  select prosecdef into v_content_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='fn_admin_upsert_tale_content'
     and p.pronargs = 5;

  if v_content_secdef then
    raise exception
      'POSTCHECK FAILED: fn_admin_upsert_tale_content is SECURITY DEFINER (expected INVOKER)';
  end if;

  -- M.1.1 18-arg upsert must still exist (we did not touch it).
  select exists(
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname='fn_admin_upsert_tale'
       and p.pronargs = 18
  ) into v_upsert_present;

  if not v_upsert_present then
    raise exception 'POSTCHECK FAILED: M.1.1 fn_admin_upsert_tale (18-arg) missing — should be unchanged';
  end if;

  -- M.1 3-arg archive must still exist (we did not touch it).
  select exists(
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname='fn_admin_archive_tale'
       and p.pronargs = 3
  ) into v_archive_present;

  if not v_archive_present then
    raise exception 'POSTCHECK FAILED: fn_admin_archive_tale (3-arg) missing — should be unchanged';
  end if;

  -- Grant posture on the new content function.
  select count(*) into v_service_role_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r
      on r.specific_name = rp.specific_name
     and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public'
     and rp.grantee='service_role'
     and r.routine_name='fn_admin_upsert_tale_content'
     and rp.privilege_type='EXECUTE';

  select count(*) into v_anon_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r
      on r.specific_name = rp.specific_name
     and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public'
     and rp.grantee='anon'
     and r.routine_name='fn_admin_upsert_tale_content'
     and rp.privilege_type='EXECUTE';

  select count(*) into v_authenticated_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r
      on r.specific_name = rp.specific_name
     and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public'
     and rp.grantee='authenticated'
     and r.routine_name='fn_admin_upsert_tale_content'
     and rp.privilege_type='EXECUTE';

  if v_service_role_grants <> 1 then
    raise exception
      'POSTCHECK FAILED: expected 1 service_role EXECUTE grant on fn_admin_upsert_tale_content, found %',
      v_service_role_grants;
  end if;
  if v_anon_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: anon has EXECUTE on % fn_admin_upsert_tale_content variants (expected 0)',
      v_anon_grants;
  end if;
  if v_authenticated_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: authenticated has EXECUTE on % fn_admin_upsert_tale_content variants (expected 0)',
      v_authenticated_grants;
  end if;

  -- admin_actions_action_check must still contain tale.update
  -- (defensive — we did not touch this constraint, but if a
  -- separate operator dropped tale.update between M.1 and M.2,
  -- this RPC would fail at first call with a 23514 violation).
  select pg_get_constraintdef(oid) into v_check_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;

  if v_check_def is null then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check vanished';
  end if;
  if v_check_def !~ 'tale\.update' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing tale.update value: %', v_check_def;
  end if;

  raise notice
    'POSTCHECK OK: fn_admin_upsert_tale_content (5-arg) present and SECURITY INVOKER; fn_admin_upsert_tale (18-arg) and fn_admin_archive_tale (3-arg) unchanged; service_role has 1 EXECUTE grant on the new function; anon/authenticated have none; admin_actions tale.update value intact';
end
$tcc2_post$;

commit;
