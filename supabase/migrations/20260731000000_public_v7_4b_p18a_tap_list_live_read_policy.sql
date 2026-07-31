-- ========= PUBLIC-v7.4B.P.18a — tap_list live-row anon read policy =========
--
-- P.18 shipped public ON TAP badges reading live tap_list rows
-- (ended_at IS NULL) with the anon key, on the assumption that the
-- canonical "tap_list: public read live" policy (rls.sql, greenfield
-- schema) existed in production. It does NOT: production's tap_list
-- was created by 20260601500000_prod_catchup_tap_list.sql, which
-- deliberately enabled RLS with ZERO policies (service-role-only
-- posture for the v7.3 admin). Anon reads therefore return 200 with
-- an empty array — proven against production on 2026-07-31:
--
--     GET /rest/v1/beers?select=slug&limit=1        → 200 [ {…} ]
--     GET /rest/v1/tap_list?select=beer_slug
--         &ended_at=is.null                          → 200 []
--
-- (empty-not-denied = table SELECT grant exists; RLS filters all
-- rows). The public badge design fails safe, so customers simply saw
-- no badges.
--
-- This migration creates exactly the policy the canonical schema
-- always intended: anon/authenticated may SELECT ONLY rows that are
-- currently live (ended_at IS NULL). Ended pours — the operational
-- history with notes — remain service-role-only. No grants change
-- (the table grant is proven present), no rows change, nothing else
-- is touched.
--
-- Explicit begin/commit (P.13b.1 precedent). Idempotent: skips
-- itself if the policy already exists. APPLY: operator-gated via
-- SQL Editor.

begin;

-- ---- prechecks -------------------------------------------------------------
do $p18a_pre$
declare
  v_rls boolean;
begin
  if to_regclass('public.tap_list') is null then
    raise exception 'P.18a precheck: public.tap_list does not exist';
  end if;

  select relrowsecurity into v_rls
    from pg_class where oid = 'public.tap_list'::regclass;
  if v_rls is distinct from true then
    raise exception 'P.18a precheck: RLS is not enabled on public.tap_list — investigate before applying (expected enabled since the v7.3 catchup)';
  end if;

  raise notice 'P.18a PRECHECK OK';
end
$p18a_pre$;

-- ---- create the live-row read policy (idempotent) ---------------------------
do $p18a_policy$
begin
  if exists (
    select 1 from pg_policy
     where polrelid = 'public.tap_list'::regclass
       and polname = 'tap_list: public read live'
  ) then
    raise notice 'P.18a: policy already exists — skipping';
    return;
  end if;

  execute 'create policy "tap_list: public read live" on public.tap_list '
       || 'for select using (ended_at is null)';

  raise notice 'P.18a: created "tap_list: public read live" (SELECT, ended_at IS NULL)';
end
$p18a_policy$;

-- ---- postchecks ------------------------------------------------------------
do $p18a_post$
declare
  v_qual text;
  v_cmd  char;
begin
  select pg_get_expr(polqual, polrelid), polcmd
    into v_qual, v_cmd
    from pg_policy
   where polrelid = 'public.tap_list'::regclass
     and polname = 'tap_list: public read live';
  if v_qual is null then
    raise exception 'P.18a postcheck: policy missing after create';
  end if;
  if v_cmd <> 'r' then
    raise exception 'P.18a postcheck: policy is not SELECT-only (polcmd=%)', v_cmd;
  end if;
  -- Predicate must be exactly the live-row condition — ended pours
  -- (operational history + notes) stay unreadable to client roles.
  if v_qual !~* 'ended_at\s+is\s+null' then
    raise exception 'P.18a postcheck: unexpected policy predicate: %', v_qual;
  end if;

  -- RLS must still be enabled, and qr_codes must remain untouched
  -- (zero policies — the P.13b lockdown posture).
  if (select relrowsecurity from pg_class where oid = 'public.tap_list'::regclass) is distinct from true then
    raise exception 'P.18a postcheck: RLS no longer enabled on tap_list';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.qr_codes'::regclass) then
    raise exception 'P.18a postcheck: qr_codes unexpectedly has policies — investigate';
  end if;

  raise notice 'P.18a POSTCHECK OK: live-row-only SELECT policy in place; ended pours remain service-role-only; qr_codes lockdown intact';
end
$p18a_post$;

commit;
