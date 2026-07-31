-- ============================================================
-- Trackside Tales — Tale CRUD RPC narrowing
-- (ADMIN-v7.4B.M.1.1 — Re-shape fn_admin_upsert_tale to match
-- production's actual public.tales schema)
--
-- Why this exists:
--   ADMIN-v7.4B.M.1 deployed fn_admin_upsert_tale with a 21-argument
--   signature derived from the canonical v6.3 init.sql column list
--   (slug, title, name, abbr, year, chapter, tagline, style, abv,
--   ibu, icon, unlock_seal, tap_status, status, is_active,
--   retired_date, display_order, hero_image_url, can_image_url).
--
--   That assumption was wrong. Production's public.tales table was
--   bootstrapped from a legacy/demo schema, not canonical v6.3.
--   v7.4B.A.3 added only THREE columns (name, tap_status, status)
--   as a thin compatibility layer. The wide canonical column set
--   (abbr, tagline, style, abv, ibu, icon, unlock_seal,
--   retired_date, display_order, hero_image_url, can_image_url)
--   never existed on production.
--
--   The diagnostic SELECTs run during M.1.1 planning confirmed:
--
--     1. information_schema.columns enumerated 23 production
--        columns. The 11 canonical fields above are absent. Three
--        canonical names exist under different production names:
--          chapter        →  chapter_label
--          display_order  →  sort_order
--          hero_image_url →  intro_asset_url   (public app's "intro"
--                                              media slot)
--          can_image_url  →  stamp_image_url   (public app's "stamp"
--                                              badge slot)
--        Five additional production scalar columns (subtitle,
--        person_or_place, story_body, intro_type, mini_game_type)
--        were not in the canonical M.1 surface but are usable today.
--
--     2. pg_constraint confirmed slug carries `tales_slug_key
--        UNIQUE (slug)`, so ON CONFLICT (slug) is safe and uses the
--        existing supporting index (tales_slug_key, indisunique=true).
--
--     3. Production CHECK constraints already enforce:
--          tales_intro_type_check     ('css_animation','video','none')
--          tales_mini_game_type_check ('grid','spike','match')
--          tales_tap_status_check     ('on-tap','retired','coming-soon')
--          tales_status_check         ('draft','published')
--        (Plus near-duplicate _canonical_check pairs — defensible
--        no-ops, identical predicates. Cleanup deferred.)
--
--   The deployed M.1 function has never been called successfully:
--   the broken /admin/tales LIST page (selecting the same missing
--   columns) blocked every user-flow that would have triggered an
--   upsert, and the slug-format Zod validator caught the only
--   submission attempt before it reached the RPC. No Tale rows have
--   been mutated. No tale.* admin_actions rows have been written.
--
--   This migration narrows the function to the production-aligned
--   16-column write surface (Option B from M.1.1 planning, approved
--   by user). The 11 canonical-only columns are dropped from the
--   signature; 5 production-only scalar columns are added. The
--   ON CONFLICT pattern is preserved.
--
-- What this migration does:
--   * DROP the broken 21-arg fn_admin_upsert_tale signature.
--   * CREATE OR REPLACE fn_admin_upsert_tale with the
--     production-aligned 18-arg signature
--     (p_actor + p_email + 16 scalar columns).
--   * Re-establish service_role-only EXECUTE on the new signature.
--   * Leave fn_admin_archive_tale unchanged (its body only references
--     slug, is_active, status, updated_at — all confirmed present).
--   * Leave admin_actions_action_check unchanged (M.1 already added
--     the 3 tale.* values).
--
-- Hard guarantees (preserved from M.1):
--   * No hard delete. Archive (separate function) handled by
--     fn_admin_archive_tale, unchanged.
--   * Slug-keyed upserts. Slug remains identity-stable. ON CONFLICT
--     (slug) finds tales_slug_key automatically; no rename path.
--     Production tales (wa-lager, packer-pils, wooden-match) cannot
--     have their slug changed via this function.
--   * SCALAR-ONLY scope. The 2 jsonb columns on production
--     (timeline, map_points), the 2 relational columns (beer_id,
--     venue_id), and the system-managed columns (id, created_at)
--     remain OUTSIDE the function signature:
--       - timeline / map_points: preserved verbatim on UPDATE (the
--         ON CONFLICT DO UPDATE SET list does not touch them).
--         Defaulted to NULL on INSERT.
--       - beer_id / venue_id: relational, deferred to a future
--         phase that will add a beer/venue picker UI. Preserved on
--         UPDATE; default NULL on INSERT.
--       - id: PRIMARY KEY uuid, gen_random_uuid() default. Auto-
--         assigned on INSERT, preserved on UPDATE.
--       - created_at: now() default on INSERT, preserved on UPDATE.
--   * actor_id MUST come from requireAdmin() server-side. The RPC
--     accepts p_actor + p_email as parameters; admin code passes
--     them, but never accepts them from a form field.
--   * security invoker on the new function. Service-role caller
--     bypasses RLS via its own privileges, not the function's.
--   * search_path locked to public on the new function.
--   * EXECUTE on the new function is REVOKED from public/anon/
--     authenticated and GRANTED to service_role only.
--
-- Identity-stability invariant:
--   PRE-state existence is detected via `v_before.id IS NULL`
--   instead of M.1's `v_before.slug IS NULL`. Production's tales
--   table has `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` and
--   `slug text NOT NULL UNIQUE`. Both work as existence signals,
--   but using `id` matches the real PK and is unambiguous if
--   future migrations ever rebase the table.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Wrapped in BEGIN/COMMIT — partial-failure safe.
--   Idempotent for re-runs:
--     * DROP FUNCTION IF EXISTS handles the case where the M.1
--       function was already dropped by a prior partial run.
--     * CREATE OR REPLACE handles the case where this migration's
--       new function was already created.
--     * Preflight tolerates the M.1 function being absent (it
--       checks AND_NOTICEs rather than aborting), so a re-run after
--       successful apply is safe.
--
-- Rollback (full unwind):
--   The forward-fix posture from M.1 still applies — both functions
--   are CREATE OR REPLACE-able, and the M.1 function was never
--   called. There is no production data to preserve. If a true
--   rollback is required:
--
--     DROP FUNCTION IF EXISTS public.fn_admin_upsert_tale(
--       uuid, text, text, text, text, text, text, text, text, text,
--       text, text, text, text, text, boolean, integer, text
--     );
--
--   Then re-create the M.1 21-arg function from migration
--   20260610000000_admin_v7_4b_m_1_tales_crud_rpcs.sql verbatim,
--   accepting that it will fail on first call. Then:
--
--     DELETE FROM supabase_migrations.schema_migrations
--       WHERE version='20260610010000';
--
--   Caveat: any admin_actions rows already written by the new
--   18-arg function would remain. They use the same action values
--   (tale.create / tale.update) which are already in the CHECK enum,
--   so they don't block rollback. The audit trail keeps them.
--
--   Practical answer: don't roll back. If the production schema
--   ever gains the canonical columns, write a forward migration that
--   re-widens the function. This migration is the long-tail steady
--   state for production-as-it-actually-is.
--
-- Errcodes raised by the new function (sanitized in admin code):
--   * 23505  — slug UNIQUE violation on upsert (race: two clients
--              tried to create the same slug between page render
--              and submit). Mapped to "Slug already in use."
--   * 23514  — CHECK violation. Production has CHECKs on:
--                tales_intro_type_check
--                tales_mini_game_type_check
--                tales_tap_status_check / tales_tap_status_canonical_check
--                tales_status_check / tales_status_canonical_check
--              Mapped to "Invalid status or tap status value."
--   * 23502  — NOT NULL violation. tales.title is NOT NULL — Zod
--              catches this first, but defensive copy here too.
--   * 23503  — FK violation (would only fire if we ever add beer_id
--              or venue_id to the signature). Reserved.
--   * P0001  — slug not found on archive (raised by
--              fn_admin_archive_tale, not this function).
--   * other  — generic "Could not save change."
-- ============================================================

begin;

-- ---------- preflight (hard guard) -------------------------------
-- Confirms expected pre-state:
--   * admin_actions table + CHECK constraint present (from v7.3 + M.1).
--   * tales table present.
--   * All 16 production columns we'll write to are present.
--   * tales_slug_key UNIQUE constraint OR a unique index on (slug)
--     is present (so ON CONFLICT (slug) works).
--   * service_role role exists.
--   * The M.1 21-arg function may or may not exist (idempotent: log
--     a NOTICE either way; do not abort if absent).

do $tcn_pre$
declare
  v_admin_actions_present     boolean;
  v_action_check_present      boolean;
  v_tales_present             boolean;
  v_missing_cols              text;
  v_slug_unique_present       boolean;
  v_service_role_present      boolean;
  v_m1_function_present       boolean;
  v_required_cols constant text[] := array[
    'id', 'slug', 'title', 'name', 'year', 'chapter_label',
    'subtitle', 'person_or_place', 'story_body', 'intro_type',
    'intro_asset_url', 'stamp_image_url', 'tap_status', 'status',
    'is_active', 'sort_order', 'mini_game_type', 'updated_at'
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

  -- Slug must support ON CONFLICT. Either a UNIQUE constraint OR a
  -- unique index on exactly {slug} is sufficient.
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

  -- M.1 21-arg function: may be present (first apply) or absent
  -- (re-run after successful apply). NOTICE either way; do not abort.
  select exists(
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname='fn_admin_upsert_tale'
       and p.pronargs = 21
  ) into v_m1_function_present;

  if not v_admin_actions_present then
    raise exception 'PREFLIGHT FAILED: public.admin_actions table missing';
  end if;
  if not v_action_check_present then
    raise exception 'PREFLIGHT FAILED: admin_actions_action_check constraint missing';
  end if;
  if not v_tales_present then
    raise exception 'PREFLIGHT FAILED: public.tales table missing';
  end if;
  if v_missing_cols is not null then
    raise exception
      'PREFLIGHT FAILED: public.tales is missing required production-aligned columns: %',
      v_missing_cols;
  end if;
  if not v_slug_unique_present then
    raise exception
      'PREFLIGHT FAILED: public.tales has no UNIQUE constraint or unique index on (slug); ON CONFLICT (slug) would fail';
  end if;
  if not v_service_role_present then
    raise exception 'PREFLIGHT FAILED: service_role does not exist';
  end if;

  if v_m1_function_present then
    raise notice 'PREFLIGHT OK (M.1 21-arg fn_admin_upsert_tale present; will be DROPped)';
  else
    raise notice 'PREFLIGHT OK (M.1 21-arg fn_admin_upsert_tale already absent; re-run scenario)';
  end if;
end
$tcn_pre$;

-- ---------- DROP the broken M.1 21-arg signature ----------------
-- Idempotent. If the M.1 function is already absent (re-run case),
-- this is a no-op.

drop function if exists public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, boolean, date, integer,
  text, text
);

-- ---------- CREATE OR REPLACE the production-aligned function ----
-- Production-aligned 18-arg signature:
--   p_actor + p_email + 16 scalar column writes.
--
-- Identity-stability change vs M.1:
--   The pre-state existence test reads `v_before.id IS NULL`
--   (production's PK) instead of M.1's `v_before.slug IS NULL`.
--   Both work; `id` is the unambiguous PK signal.

create or replace function public.fn_admin_upsert_tale(
  p_actor             uuid,
  p_email             text,
  p_slug              text,
  p_title             text,
  p_name              text,
  p_year              text,
  p_chapter_label     text,
  p_subtitle          text,
  p_person_or_place   text,
  p_story_body        text,
  p_intro_type        text,
  p_intro_asset_url   text,
  p_stamp_image_url   text,
  p_tap_status        text,
  p_status            text,
  p_is_active         boolean,
  p_sort_order        integer,
  p_mini_game_type    text
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
    year,
    chapter_label,
    subtitle,
    person_or_place,
    story_body,
    intro_type,
    intro_asset_url,
    stamp_image_url,
    tap_status,
    status,
    is_active,
    sort_order,
    mini_game_type,
    updated_at
  ) values (
    p_slug,
    p_title,
    p_name,
    p_year,
    p_chapter_label,
    p_subtitle,
    p_person_or_place,
    p_story_body,
    p_intro_type,
    p_intro_asset_url,
    p_stamp_image_url,
    p_tap_status,
    coalesce(p_status, 'draft'),
    coalesce(p_is_active, true),
    coalesce(p_sort_order, 0),
    p_mini_game_type,
    v_now
  )
  on conflict (slug) do update
     set title           = excluded.title,
         name            = excluded.name,
         year            = excluded.year,
         chapter_label   = excluded.chapter_label,
         subtitle        = excluded.subtitle,
         person_or_place = excluded.person_or_place,
         story_body      = excluded.story_body,
         intro_type      = excluded.intro_type,
         intro_asset_url = excluded.intro_asset_url,
         stamp_image_url = excluded.stamp_image_url,
         tap_status      = excluded.tap_status,
         status          = excluded.status,
         is_active       = excluded.is_active,
         sort_order      = excluded.sort_order,
         mini_game_type  = excluded.mini_game_type,
         updated_at      = v_now
         -- Explicitly NOT updated:
         --   id          (PK; system-managed; never touched)
         --   beer_id     (relational; deferred to a future phase)
         --   venue_id    (relational; deferred to a future phase)
         --   timeline    (jsonb; deferred to M.2 structured editor)
         --   map_points  (jsonb; deferred to M.2 structured editor)
         --   created_at  (system-managed)
  returning * into v_after;

  -- Decide create vs update based on pre-state. Use the PK column
  -- (id) as the existence signal.
  v_action := case when v_before.id is null then 'tale.create' else 'tale.update' end;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    v_action,
    'tales',
    p_slug,
    jsonb_build_object(
      'before', case when v_before.id is null then null else to_jsonb(v_before) end,
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$$;

-- ---------- service_role-only EXECUTE grants on new signature ---
-- Defense in depth: revoke EXECUTE from public/anon/authenticated
-- on the new 18-arg function, then grant only to service_role.
-- The grants on the old 21-arg signature were dropped automatically
-- when the function was DROPped above.

revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text
) from public;
revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text
) from anon;
revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text
) from authenticated;
grant  execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text
) to service_role;

-- ---------- post-apply assertions -------------------------------
-- Confirms the migration end-state:
--   * The M.1 21-arg function does NOT exist (cleanly DROPped).
--   * The new 18-arg function exists.
--   * fn_admin_archive_tale still exists unchanged.
--   * New function is SECURITY INVOKER (prosecdef = false).
--   * service_role has EXECUTE on the new function.
--   * anon / authenticated do not have EXECUTE on the new function.
--   * admin_actions_action_check still has all 17 values from M.1.

do $tcn_post$
declare
  v_check_def              text;
  v_old_present            boolean;
  v_new_present            boolean;
  v_archive_present        boolean;
  v_new_secdef             boolean;
  v_service_role_grants    int;
  v_anon_grants            int;
  v_authenticated_grants   int;
begin
  -- Old 21-arg signature must be gone.
  select exists(
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname='fn_admin_upsert_tale'
       and p.pronargs = 21
  ) into v_old_present;

  -- New 18-arg signature must exist.
  select exists(
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname='fn_admin_upsert_tale'
       and p.pronargs = 18
  ) into v_new_present;

  -- Archive function (unchanged) must still exist.
  select exists(
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and p.proname='fn_admin_archive_tale'
       and p.pronargs = 3
  ) into v_archive_present;

  if v_old_present then
    raise exception 'POSTCHECK FAILED: M.1 21-arg fn_admin_upsert_tale still present (DROP did not take)';
  end if;
  if not v_new_present then
    raise exception 'POSTCHECK FAILED: new 18-arg fn_admin_upsert_tale missing';
  end if;
  if not v_archive_present then
    raise exception 'POSTCHECK FAILED: fn_admin_archive_tale missing (should be unchanged from M.1)';
  end if;

  -- New function must be SECURITY INVOKER.
  select prosecdef into v_new_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='fn_admin_upsert_tale'
     and p.pronargs = 18;

  if v_new_secdef then
    raise exception
      'POSTCHECK FAILED: new fn_admin_upsert_tale is SECURITY DEFINER (expected INVOKER)';
  end if;

  -- Grant posture on the new signature.
  select count(*) into v_service_role_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r
      on r.specific_name = rp.specific_name
     and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public'
     and rp.grantee='service_role'
     and r.routine_name='fn_admin_upsert_tale'
     and rp.privilege_type='EXECUTE';

  select count(*) into v_anon_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r
      on r.specific_name = rp.specific_name
     and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public'
     and rp.grantee='anon'
     and r.routine_name='fn_admin_upsert_tale'
     and rp.privilege_type='EXECUTE';

  select count(*) into v_authenticated_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r
      on r.specific_name = rp.specific_name
     and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public'
     and rp.grantee='authenticated'
     and r.routine_name='fn_admin_upsert_tale'
     and rp.privilege_type='EXECUTE';

  -- After this migration there should be exactly ONE
  -- fn_admin_upsert_tale (the new 18-arg) so service_role count is 1,
  -- not 2 like the M.1 postcheck (which counted upsert+archive).
  if v_service_role_grants <> 1 then
    raise exception
      'POSTCHECK FAILED: expected 1 service_role EXECUTE grant on fn_admin_upsert_tale, found %',
      v_service_role_grants;
  end if;
  if v_anon_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: anon has EXECUTE on % fn_admin_upsert_tale variants (expected 0)',
      v_anon_grants;
  end if;
  if v_authenticated_grants <> 0 then
    raise exception
      'POSTCHECK FAILED: authenticated has EXECUTE on % fn_admin_upsert_tale variants (expected 0)',
      v_authenticated_grants;
  end if;

  -- admin_actions_action_check unchanged from M.1 (17 values total).
  select pg_get_constraintdef(oid) into v_check_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;

  if v_check_def is null then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check vanished';
  end if;
  if v_check_def !~ 'tale\.create' or v_check_def !~ 'tale\.update' or v_check_def !~ 'tale\.archive' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing tale.* values: %', v_check_def;
  end if;

  raise notice
    'POSTCHECK OK: M.1 21-arg fn_admin_upsert_tale dropped; new 18-arg present and SECURITY INVOKER; fn_admin_archive_tale unchanged; service_role has 1 EXECUTE grant; anon/authenticated have none; admin_actions tale.* values intact';
end
$tcn_post$;

commit;
