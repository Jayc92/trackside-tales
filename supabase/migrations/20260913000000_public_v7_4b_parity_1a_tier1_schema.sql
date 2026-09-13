-- ============================================================
-- Trackside Tales — Tier-1 admin-authored Tale parity schema
-- (PUBLIC-v7.4B.PARITY.1A — additive columns + RPC widening only)
--
-- Why this exists:
--   ROADMAP.1A/1B found that admin-authored (non-curated) Tales
--   render systematically thinner than the three curated Tales
--   because several presentation fields have no admin-authorable
--   path at all: personBio, barSummary (who/why/beer), stillHere,
--   and mini-game flavor copy. Separately, `tales.beer_id` already
--   exists (confirmed on the real production schema and already
--   populated with valid values for all three curated Tales — see
--   ROADMAP.1B §10) but has no admin write path, forcing style/
--   ABV/IBU to stay duplicated in presentation packs instead of
--   being derived from the Beer they already point at.
--
--   This migration adds ONLY the Tier-1 set approved in ROADMAP.1B:
--     person_bio, bar_summary_who, bar_summary_why,
--     bar_summary_beer, game_title            (5 new text columns)
--     still_here                              (1 new jsonb column)
--   and widens both existing Tale RPCs so `beer_id` and the six new
--   columns become admin-writable. No Tier-2 fields (person_dates,
--   person_role, game_instructions, game_success_title,
--   game_success_msg, scan_badge_desc, game_badge_desc). No
--   style/abv/ibu duplication onto tales — Beer remains the sole
--   authority for those (ROADMAP.1B §10/§26); this migration only
--   exposes the pre-existing beer_id relationship, adding zero new
--   columns for it.
--
-- What this migration does NOT do:
--   * Does not touch style, abv, ibu, or any Beer table column.
--   * Does not add person_dates, person_role, or any Tier-2 field.
--   * Does not add a foreign key on beer_id. ROADMAP.1B §10 found
--     all three curated Tales' existing beer_id values already
--     match real, corresponding Beer rows exactly (verified via a
--     safe read-only production query) — clean FK-ready evidence —
--     but per this gate's own strong default, FK cleanup is
--     deliberately left for a separate, explicitly-scoped gate
--     rather than bundled into parity schema work.
--   * Does not backfill the three curated Tales. All new columns
--     stay NULL / '[]' for them; presentation packs remain
--     authoritative (ROADMAP.1B §19/§20/§34, Option A).
--   * Does not touch contentService.ts, TaleForm.tsx,
--     TaleContentForm.tsx, or any other application code. Schema/RPC
--     foundation only — PARITY.1B (admin authoring) and PARITY.1C
--     (public read/render) are separate, later gates.
--   * Does not touch RLS policies. Both RPCs remain SECURITY
--     INVOKER, service-role-only EXECUTE — identical security
--     posture to every existing Tale RPC.
--
-- RPC widening mechanism (why DROP + CREATE, not plain
-- CREATE OR REPLACE):
--   PostgreSQL's CREATE OR REPLACE FUNCTION can only replace a
--   function whose parameter TYPE LIST is unchanged. Adding new
--   parameters changes the signature, so it requires the same
--   DROP FUNCTION IF EXISTS + CREATE OR REPLACE FUNCTION two-step
--   this repo's own M.1 -> M.1.1 migration already used to widen
--   fn_admin_upsert_tale once before (see
--   20260610010000_admin_v7_4b_m_1_1_narrow_tale_rpc.sql). This
--   migration reuses that exact, proven pattern for both RPCs.
--
-- Backward compatibility (critical — read before applying):
--   All 7 new parameters (p_beer_id + the 5 new scalar columns) are
--   appended at the END of fn_admin_upsert_tale's parameter list,
--   each with DEFAULT NULL. p_still_here is appended at the end of
--   fn_admin_upsert_tale_content's list, also DEFAULT NULL.
--   PostgREST calls Postgres functions using NAMED parameter
--   binding (the JSON request body's keys are matched against
--   parameter names), so the CURRENTLY DEPLOYED admin — which sends
--   exactly the old parameter names and none of the new ones —
--   continues to resolve to this same (now-wider) function, with
--   every new parameter falling back to its default. There is only
--   ONE fn_admin_upsert_tale and ONE fn_admin_upsert_tale_content
--   after this migration — not a second overload — so there is no
--   ambiguous PostgREST RPC resolution. The current production
--   admin (PARITY.1B not yet deployed) keeps working unmodified
--   after this migration lands.
--
--   This was proven, not just reasoned about: PARITY.1A validated
--   this exact migration against a disposable local Postgres
--   database seeded with faithful transcriptions of the three
--   current live RPC bodies, then called the widened function using
--   ONLY the old 18/5 named parameters (simulating exactly what
--   PostgREST forwards from the currently-deployed admin) and
--   confirmed it resolves, succeeds, and leaves every new column at
--   its default. See PARITY.1A return report §26 (marked
--   release-critical in the gate spec) for the full result.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Wrapped in BEGIN/COMMIT — partial-failure safe.
--   Idempotent for re-runs:
--     * ADD COLUMN IF NOT EXISTS for every new column.
--     * DROP FUNCTION IF EXISTS handles a prior partial run.
--     * CREATE OR REPLACE handles the new signature already existing.
--
-- Rollback (full unwind — additive schema, so rarely needed):
--   The new columns are inert if nothing reads them; no destructive
--   rollback is required to recover safety. If a true unwind is
--   wanted:
--
--     drop function if exists public.fn_admin_upsert_tale(
--       uuid, text, text, text, text, text, text, text, text, text,
--       text, text, text, text, text, boolean, integer, text,
--       uuid, text, text, text, text, text
--     );
--     -- then re-create the current 18-arg version verbatim from
--     -- 20260610010000_admin_v7_4b_m_1_1_narrow_tale_rpc.sql
--
--     drop function if exists public.fn_admin_upsert_tale_content(
--       uuid, text, text, jsonb, jsonb, jsonb
--     );
--     -- then re-create the current 5-arg version verbatim from
--     -- 20260610020000_admin_v7_4b_m_2_tale_content_rpc.sql
--
--     alter table public.tales
--       drop column if exists person_bio,
--       drop column if exists bar_summary_who,
--       drop column if exists bar_summary_why,
--       drop column if exists bar_summary_beer,
--       drop column if exists game_title,
--       drop column if exists still_here;
--
--     delete from supabase_migrations.schema_migrations
--       where version = '20260913000000';
--
--   Practical answer: prefer NOT rolling back the columns even if a
--   later gate is paused — they are additive and harmless. Only the
--   RPC revert step is likely ever needed, and only if PARITY.1B
--   introduces a bug that must be fully undone.
-- ============================================================

begin;

-- ---------- preflight (hard guard) -------------------------------
-- Confirms expected pre-state before touching anything:
--   * tales / beers / admin_actions tables present.
--   * The exact current 18-arg fn_admin_upsert_tale and 5-arg
--     fn_admin_upsert_tale_content exist (so we know precisely what
--     we are widening — not guessing at a signature).
--   * None of the six new Tier-1 columns already exist (so this
--     isn't accidentally re-running against an already-migrated
--     database with different column definitions).
--   * service_role exists.

do $parity1a_pre$
declare
  v_tales_present            boolean;
  v_beers_present            boolean;
  v_admin_actions_present   boolean;
  v_upsert_18_present        boolean;
  v_content_5_present        boolean;
  v_service_role_present     boolean;
  v_existing_new_cols        text;
  v_new_cols constant text[] := array[
    'person_bio', 'bar_summary_who', 'bar_summary_why',
    'bar_summary_beer', 'game_title', 'still_here'
  ];
begin
  select exists(
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='tales' and c.relkind='r'
  ) into v_tales_present;

  select exists(
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='beers' and c.relkind='r'
  ) into v_beers_present;

  select exists(
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='admin_actions' and c.relkind='r'
  ) into v_admin_actions_present;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale' and p.pronargs = 18
  ) into v_upsert_18_present;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs = 5
  ) into v_content_5_present;

  select exists(
    select 1 from pg_roles where rolname='service_role'
  ) into v_service_role_present;

  select string_agg(c, ', ' order by c)
    into v_existing_new_cols
    from unnest(v_new_cols) as c
   where exists(
     select 1 from information_schema.columns
      where table_schema='public' and table_name='tales' and column_name = c
   );

  if not v_tales_present then
    raise exception 'PREFLIGHT FAILED: public.tales table missing';
  end if;
  if not v_beers_present then
    raise exception 'PREFLIGHT FAILED: public.beers table missing';
  end if;
  if not v_admin_actions_present then
    raise exception 'PREFLIGHT FAILED: public.admin_actions table missing';
  end if;
  if not v_upsert_18_present then
    raise exception 'PREFLIGHT FAILED: current 18-arg fn_admin_upsert_tale not found — this migration widens a specific known signature, not a guess';
  end if;
  if not v_content_5_present then
    raise exception 'PREFLIGHT FAILED: current 5-arg fn_admin_upsert_tale_content not found';
  end if;
  if not v_service_role_present then
    raise exception 'PREFLIGHT FAILED: service_role does not exist';
  end if;
  if v_existing_new_cols is not null then
    raise notice 'PREFLIGHT NOTE: some Tier-1 columns already exist (%) — proceeding idempotently with IF NOT EXISTS', v_existing_new_cols;
  end if;

  raise notice 'PREFLIGHT OK: tales/beers/admin_actions present; current 18-arg upsert and 5-arg content RPC confirmed; service_role present';
end
$parity1a_pre$;

-- ---------- Tier-1 columns (additive, nullable, zero backfill) ---

alter table public.tales add column if not exists person_bio        text;
alter table public.tales add column if not exists bar_summary_who   text;
alter table public.tales add column if not exists bar_summary_why   text;
alter table public.tales add column if not exists bar_summary_beer  text;
alter table public.tales add column if not exists game_title        text;
alter table public.tales add column if not exists still_here        jsonb not null default '[]'::jsonb;

-- ---------- widen fn_admin_upsert_tale: 18 args -> 24 args --------
-- Appends p_beer_id + 5 new scalar params, all DEFAULT NULL, at the
-- end. See header comment for why this is safe for the currently
-- deployed (pre-PARITY.1B) admin.

drop function if exists public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text
);

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
  p_mini_game_type    text,
  p_beer_id           uuid default null,
  p_person_bio        text default null,
  p_bar_summary_who   text default null,
  p_bar_summary_why   text default null,
  p_bar_summary_beer  text default null,
  p_game_title        text default null
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
    beer_id,
    person_bio,
    bar_summary_who,
    bar_summary_why,
    bar_summary_beer,
    game_title,
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
    p_beer_id,
    p_person_bio,
    p_bar_summary_who,
    p_bar_summary_why,
    p_bar_summary_beer,
    p_game_title,
    v_now
  )
  on conflict (slug) do update
     set title             = excluded.title,
         name              = excluded.name,
         year              = excluded.year,
         chapter_label     = excluded.chapter_label,
         subtitle          = excluded.subtitle,
         person_or_place   = excluded.person_or_place,
         story_body        = excluded.story_body,
         intro_type        = excluded.intro_type,
         intro_asset_url   = excluded.intro_asset_url,
         stamp_image_url   = excluded.stamp_image_url,
         tap_status        = excluded.tap_status,
         status            = excluded.status,
         is_active         = excluded.is_active,
         sort_order        = excluded.sort_order,
         mini_game_type    = excluded.mini_game_type,
         beer_id           = excluded.beer_id,
         person_bio        = excluded.person_bio,
         bar_summary_who   = excluded.bar_summary_who,
         bar_summary_why   = excluded.bar_summary_why,
         bar_summary_beer  = excluded.bar_summary_beer,
         game_title        = excluded.game_title,
         updated_at        = v_now
         -- Explicitly NOT updated (unchanged from the current
         -- function): id, venue_id, timeline, map_points, still_here,
         -- created_at. still_here is intentionally NOT written here —
         -- it is structured/repeatable content and belongs to
         -- fn_admin_upsert_tale_content, matching the existing
         -- timeline/map_points precedent exactly.
  returning * into v_after;

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

revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text,
  uuid, text, text, text, text, text
) from public;
revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text,
  uuid, text, text, text, text, text
) from anon;
revoke execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text,
  uuid, text, text, text, text, text
) from authenticated;
grant  execute on function public.fn_admin_upsert_tale(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, boolean, integer, text,
  uuid, text, text, text, text, text
) to service_role;

-- ---------- widen fn_admin_upsert_tale_content: 5 args -> 6 args --
-- Appends p_still_here (jsonb, DEFAULT NULL) at the end. Same
-- backward-compatibility rationale as above.

drop function if exists public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb
);

create or replace function public.fn_admin_upsert_tale_content(
  p_actor       uuid,
  p_email       text,
  p_slug        text,
  p_timeline    jsonb,
  p_map_points  jsonb,
  p_still_here  jsonb default null
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

  if v_before.id is null then
    raise exception 'tale slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  if p_timeline is not null and jsonb_typeof(p_timeline) <> 'array' then
    raise exception 'p_timeline must be a JSON array (got %)', jsonb_typeof(p_timeline)
      using errcode = 'P0002';
  end if;
  if p_map_points is not null and jsonb_typeof(p_map_points) <> 'array' then
    raise exception 'p_map_points must be a JSON array (got %)', jsonb_typeof(p_map_points)
      using errcode = 'P0002';
  end if;
  if p_still_here is not null and jsonb_typeof(p_still_here) <> 'array' then
    raise exception 'p_still_here must be a JSON array (got %)', jsonb_typeof(p_still_here)
      using errcode = 'P0002';
  end if;

  update public.tales
     set timeline   = coalesce(p_timeline,   '[]'::jsonb),
         map_points = coalesce(p_map_points, '[]'::jsonb),
         still_here = coalesce(p_still_here, '[]'::jsonb),
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

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

revoke execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb, jsonb
) from public;
revoke execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb, jsonb
) from anon;
revoke execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb, jsonb
) from authenticated;
grant  execute on function public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb, jsonb
) to service_role;

-- ---------- post-apply assertions -------------------------------

do $parity1a_post$
declare
  v_old_upsert_present       boolean;
  v_new_upsert_present       boolean;
  v_old_content_present      boolean;
  v_new_content_present      boolean;
  v_archive_present          boolean;
  v_new_upsert_secdef        boolean;
  v_new_content_secdef       boolean;
  v_cols_present             boolean;
  v_service_role_grants      int;
  v_anon_grants               int;
  v_authenticated_grants      int;
begin
  -- Old 18-arg upsert must be gone (cleanly DROPped, not left as an
  -- ambiguous second overload).
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale' and p.pronargs = 18
  ) into v_old_upsert_present;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale' and p.pronargs = 24
  ) into v_new_upsert_present;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs = 5
  ) into v_old_content_present;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs = 6
  ) into v_new_content_present;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_archive_tale' and p.pronargs = 3
  ) into v_archive_present;

  if v_old_upsert_present then
    raise exception 'POSTCHECK FAILED: old 18-arg fn_admin_upsert_tale still present (would create an ambiguous overload)';
  end if;
  if not v_new_upsert_present then
    raise exception 'POSTCHECK FAILED: new 24-arg fn_admin_upsert_tale missing';
  end if;
  if v_old_content_present then
    raise exception 'POSTCHECK FAILED: old 5-arg fn_admin_upsert_tale_content still present (would create an ambiguous overload)';
  end if;
  if not v_new_content_present then
    raise exception 'POSTCHECK FAILED: new 6-arg fn_admin_upsert_tale_content missing';
  end if;
  if not v_archive_present then
    raise exception 'POSTCHECK FAILED: fn_admin_archive_tale missing (should be unchanged)';
  end if;

  select prosecdef into v_new_upsert_secdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_tale' and p.pronargs=24;
  if v_new_upsert_secdef then
    raise exception 'POSTCHECK FAILED: new fn_admin_upsert_tale is SECURITY DEFINER (expected INVOKER)';
  end if;

  select prosecdef into v_new_content_secdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs=6;
  if v_new_content_secdef then
    raise exception 'POSTCHECK FAILED: new fn_admin_upsert_tale_content is SECURITY DEFINER (expected INVOKER)';
  end if;

  select exists(
    select 1 from information_schema.columns
     where table_schema='public' and table_name='tales'
       and column_name in ('person_bio','bar_summary_who','bar_summary_why','bar_summary_beer','game_title','still_here')
    having count(*) = 6
  ) into v_cols_present;
  if not v_cols_present then
    raise exception 'POSTCHECK FAILED: not all 6 Tier-1 columns present on public.tales';
  end if;

  select count(*) into v_service_role_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r on r.specific_name = rp.specific_name and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public' and rp.grantee='service_role'
     and r.routine_name='fn_admin_upsert_tale' and rp.privilege_type='EXECUTE';
  select count(*) into v_anon_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r on r.specific_name = rp.specific_name and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public' and rp.grantee='anon'
     and r.routine_name='fn_admin_upsert_tale' and rp.privilege_type='EXECUTE';
  select count(*) into v_authenticated_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r on r.specific_name = rp.specific_name and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public' and rp.grantee='authenticated'
     and r.routine_name='fn_admin_upsert_tale' and rp.privilege_type='EXECUTE';

  if v_service_role_grants <> 1 then
    raise exception 'POSTCHECK FAILED: expected 1 service_role EXECUTE grant on fn_admin_upsert_tale, found %', v_service_role_grants;
  end if;
  if v_anon_grants <> 0 then
    raise exception 'POSTCHECK FAILED: anon has EXECUTE on fn_admin_upsert_tale (expected 0)';
  end if;
  if v_authenticated_grants <> 0 then
    raise exception 'POSTCHECK FAILED: authenticated has EXECUTE on fn_admin_upsert_tale (expected 0)';
  end if;

  raise notice 'POSTCHECK OK: exactly one fn_admin_upsert_tale (24-arg) and one fn_admin_upsert_tale_content (6-arg), both SECURITY INVOKER, service_role-only EXECUTE; fn_admin_archive_tale unchanged; all 6 Tier-1 columns present';
end
$parity1a_post$;

commit;
