-- ============================================================
-- Trackside Tales — still_here RPC rollout-safety correction
-- (PUBLIC-v7.4B.PARITY.1A.3 — function-body semantics only)
--
-- Why this exists:
--   PARITY.1B review caught a rollout-safety defect in the
--   fn_admin_upsert_tale_content signature PARITY.1A shipped
--   (20260913000000_public_v7_4b_parity_1a_tier1_schema.sql).
--   That function's UPDATE used:
--
--     still_here = coalesce(p_still_here, '[]'::jsonb)
--
--   identical to the existing timeline/map_points lines. For
--   timeline/map_points this is correct and long-established
--   REPLACE semantics: the admin always sends its full intended
--   array on every save, so "no value sent" already only happens
--   when the caller genuinely means "empty."
--
--   p_still_here is different: it is a BRAND NEW parameter added
--   in the same migration that widened the function. During the
--   transitional window before PARITY.1B's admin UI ships — and
--   during any rolling deploy, or from a stale already-open
--   browser tab, even after it ships — a caller can legitimately
--   omit p_still_here while intending "I don't know about this
--   field, leave it alone," not "clear it." Because Postgres
--   resolves an omitted named RPC parameter to its SQL NULL
--   default, the old coalesce(...,'[]'::jsonb) could not tell
--   those two intents apart — it always cleared. Reproduced and
--   confirmed on a disposable database seeded with a non-empty
--   still_here: an old 5-named-arg call (p_still_here never sent)
--   wiped it to '[]', with no way for that caller to have
--   prevented it.
--
--   This migration corrects ONLY that one line, changing the
--   fallback from the literal '[]'::jsonb to the column's own
--   current value (still_here), so the three states become
--   distinguishable:
--
--     p_still_here IS NULL (omitted or explicit null)
--       -> PRESERVE the existing tales.still_here value untouched.
--     p_still_here = '[]'::jsonb (explicit empty array)
--       -> SET still_here to '[]' (the operator's clear action).
--     p_still_here = <non-empty array>
--       -> SET still_here to that exact array (replace).
--
--   timeline and map_points are explicitly NOT touched by this
--   migration — they are established, currently-in-use parameters
--   with no equivalent "caller doesn't know about this field"
--   transitional risk, and changing their semantics was neither
--   asked for nor needed.
--
--   Verified against the admin repo's reviewed (uncommitted)
--   PARITY.1B changes: its content-save action always sends a
--   concrete stillHere array — including [] when every row is
--   cleared — never omits the parameter. Omission is therefore
--   only ever reachable from the OLD (pre-PARITY.1B) admin build,
--   exactly the case this migration exists to make safe.
--
-- What this migration does NOT do:
--   * Does not add, drop, or alter any column. person_bio,
--     bar_summary_*, game_title, still_here, beer_id are all
--     unchanged — this is a function-body-only correction.
--   * Does not change fn_admin_upsert_tale (the scalar RPC) at all.
--   * Does not change the INSERT path for new Tales — new rows are
--     created exclusively by fn_admin_upsert_tale, which never
--     writes still_here; the column's own
--     `not null default '[]'::jsonb` already guarantees a fresh
--     row starts at '[]'. fn_admin_upsert_tale_content itself has
--     no insert path (it raises P0001 — "tale slug % not found" —
--     for a slug that doesn't already exist), so there is no
--     reachable "insert" case inside THIS function to special-case.
--   * Does not widen the function signature. Still exactly 6
--     parameters: p_actor, p_email, p_slug, p_timeline,
--     p_map_points, p_still_here. No new parameter, no overload.
--   * Does not change security posture: still SECURITY INVOKER,
--     still `set search_path = public`, still service-role-only
--     EXECUTE (revoked from public/anon/authenticated). Does not
--     touch admin_actions audit behavior (before/after payload
--     shape is unchanged) or any RLS policy.
--   * Does not touch fn_admin_upsert_tale or fn_admin_archive_tale.
--   * Does not repair the Supabase CLI migration-history ledger for
--     20260913000000 (still tracked separately, per that gate's own
--     note — an operator DB-password-gated action, out of scope
--     here).
--   * Does not mutate any Tale content. Function-definition change
--     only; no UPDATE of any row runs as part of this migration
--     (the one `update public.tales` in this file is the RPC body
--     definition itself, not a statement this migration executes).
--
-- Why DROP + CREATE rather than a plain CREATE OR REPLACE:
--   Not required this time — the parameter list is byte-identical
--   (still 6 args, same names, same types, same defaults), and
--   CREATE OR REPLACE FUNCTION is sufficient (and used) when only
--   the body changes. The DROP FUNCTION step is still included
--   below, immediately before the CREATE OR REPLACE, purely as an
--   explicit "this exact signature is confirmed to already exist"
--   assertion consistent with the DROP+CREATE pattern used
--   throughout this project for RPC changes — DROP FUNCTION IF
--   EXISTS on the wrong signature is a silent no-op, so it costs
--   nothing and keeps every RPC migration in this repo following
--   one recognizable shape.
--
-- Apply path:
--   Paste this entire file into Supabase Dashboard SQL Editor.
--   Wrapped in BEGIN/COMMIT — partial-failure safe.
--   Idempotent for re-runs: DROP FUNCTION IF EXISTS + CREATE OR
--   REPLACE both tolerate being run again.
--
-- Rollback:
--   If ever needed, DROP FUNCTION IF EXISTS this exact 6-arg
--   signature, then CREATE OR REPLACE the body verbatim from
--   20260913000000_public_v7_4b_parity_1a_tier1_schema.sql. Given
--   this migration only makes the function MORE conservative
--   (preserve-by-default instead of clear-by-default), a rollback
--   would reintroduce the rollout-safety defect — prefer not to,
--   except to revert a genuine regression this migration itself
--   caused.
-- ============================================================

begin;

-- ---------- preflight (hard guard) -------------------------------

do $parity1a3_pre$
declare
  v_content_6_present  boolean;
  v_current_body        text;
  v_has_old_coalesce     boolean;
begin
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs = 6
  ) into v_content_6_present;

  if not v_content_6_present then
    raise exception 'PREFLIGHT FAILED: current 6-arg fn_admin_upsert_tale_content not found — this migration corrects a specific known body, not a guess';
  end if;

  select pg_get_functiondef(p.oid) into v_current_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs = 6;

  v_has_old_coalesce := v_current_body like '%still_here = coalesce(p_still_here, ''[]''::jsonb)%';

  if not v_has_old_coalesce then
    raise notice 'PREFLIGHT NOTE: the installed function does not contain the exact defective coalesce(...,''[]''::jsonb) expression for still_here — it may already be corrected. Proceeding idempotently (CREATE OR REPLACE will simply reapply the corrected body).';
  end if;

  raise notice 'PREFLIGHT OK: current 6-arg fn_admin_upsert_tale_content confirmed present';
end
$parity1a3_pre$;

-- ---------- correct fn_admin_upsert_tale_content body -------------
-- Signature is byte-identical to the current function. Only the
-- still_here line in the UPDATE changes: coalesce(...,'[]'::jsonb)
-- -> coalesce(...,still_here) so an omitted/NULL p_still_here
-- preserves the row's current value instead of clearing it.

drop function if exists public.fn_admin_upsert_tale_content(
  uuid, text, text, jsonb, jsonb, jsonb
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
         -- PARITY.1A.3 correction: fall back to the row's OWN current
         -- still_here value, not a literal '[]'. NULL/omitted now
         -- preserves; explicit '[]' still clears; explicit non-empty
         -- array still replaces. timeline/map_points intentionally
         -- keep the original '[]'::jsonb fallback — see file header.
         still_here = coalesce(p_still_here, still_here),
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

do $parity1a3_post$
declare
  v_content_6_present    boolean;
  v_content_secdef       boolean;
  v_new_body              text;
  v_has_new_coalesce      boolean;
  v_has_old_coalesce      boolean;
  v_service_role_grants   int;
  v_anon_grants           int;
  v_authenticated_grants  int;
begin
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs = 6
  ) into v_content_6_present;
  if not v_content_6_present then
    raise exception 'POSTCHECK FAILED: 6-arg fn_admin_upsert_tale_content missing after correction';
  end if;

  select prosecdef into v_content_secdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs=6;
  if v_content_secdef then
    raise exception 'POSTCHECK FAILED: fn_admin_upsert_tale_content is SECURITY DEFINER (expected INVOKER)';
  end if;

  select pg_get_functiondef(p.oid) into v_new_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='fn_admin_upsert_tale_content' and p.pronargs = 6;

  v_has_new_coalesce := v_new_body like '%still_here = coalesce(p_still_here, still_here)%';
  v_has_old_coalesce := v_new_body like '%still_here = coalesce(p_still_here, ''[]''::jsonb)%';

  if not v_has_new_coalesce then
    raise exception 'POSTCHECK FAILED: corrected coalesce(p_still_here, still_here) expression not found in the installed function body';
  end if;
  if v_has_old_coalesce then
    raise exception 'POSTCHECK FAILED: the old, defective coalesce(p_still_here, ''[]''::jsonb) expression is still present';
  end if;
  if v_new_body not like '%timeline   = coalesce(p_timeline,   ''[]''::jsonb)%'
     and v_new_body not like '%timeline = coalesce(p_timeline, ''[]''::jsonb)%' then
    raise exception 'POSTCHECK FAILED: timeline''s coalesce-to-[] fallback appears to have changed (it must not)';
  end if;
  if v_new_body not like '%map_points = coalesce(p_map_points, ''[]''::jsonb)%' then
    raise exception 'POSTCHECK FAILED: map_points''s coalesce-to-[] fallback appears to have changed (it must not)';
  end if;

  select count(*) into v_service_role_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r on r.specific_name = rp.specific_name and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public' and rp.grantee='service_role'
     and r.routine_name='fn_admin_upsert_tale_content' and rp.privilege_type='EXECUTE';
  select count(*) into v_anon_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r on r.specific_name = rp.specific_name and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public' and rp.grantee='anon'
     and r.routine_name='fn_admin_upsert_tale_content' and rp.privilege_type='EXECUTE';
  select count(*) into v_authenticated_grants
    from information_schema.routine_privileges rp
    join information_schema.routines r on r.specific_name = rp.specific_name and r.specific_schema = rp.specific_schema
   where rp.specific_schema='public' and rp.grantee='authenticated'
     and r.routine_name='fn_admin_upsert_tale_content' and rp.privilege_type='EXECUTE';

  if v_service_role_grants <> 1 then
    raise exception 'POSTCHECK FAILED: expected 1 service_role EXECUTE grant, found %', v_service_role_grants;
  end if;
  if v_anon_grants <> 0 then
    raise exception 'POSTCHECK FAILED: anon has EXECUTE on fn_admin_upsert_tale_content (expected 0)';
  end if;
  if v_authenticated_grants <> 0 then
    raise exception 'POSTCHECK FAILED: authenticated has EXECUTE on fn_admin_upsert_tale_content (expected 0)';
  end if;

  raise notice 'POSTCHECK OK: fn_admin_upsert_tale_content is still 6-arg, SECURITY INVOKER, service_role-only EXECUTE; still_here now preserves on NULL while timeline/map_points still coalesce to [] unchanged';
end
$parity1a3_post$;

commit;
