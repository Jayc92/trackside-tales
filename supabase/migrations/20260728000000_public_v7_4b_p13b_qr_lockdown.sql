-- ============== SUPABASE-v7.4B.P.13b — qr_codes exposure lockdown ==============
--
-- Browser clients must not be able to enumerate active QR codes: a raw
-- code IS the unlock secret, so an anon-readable qr_codes row set makes
-- every printed can code public. Production drifted from this repo's
-- documented posture (20260601000100_rls.sql: "qr_codes: RLS enabled
-- with NO policies — service role only"): a policy named
-- `demo_qr_codes_select` USING (is_active = true) exists in production
-- and exposes every active row (including its `code` value) to the
-- anon key.
--
-- This migration:
--   * verifies public.qr_codes exists (fails loudly otherwise),
--   * ensures RLS is enabled (idempotent),
--   * drops the anon-readable policy,
--   * revokes direct table privileges from `anon` and `authenticated`
--     (belt-and-suspenders under PostgREST's default schema grants),
--   * post-checks the final state and RAISES if anything still exposes
--     the table.
--
-- SUPABASE-v7.4B.P.13b.1: the whole file is EXPLICITLY wrapped in
-- begin/commit so atomicity does not depend on how it is applied.
-- Whether run via `supabase db push` or pasted into the Supabase SQL
-- Editor, a failed postcheck (or any earlier error) aborts the
-- transaction and rolls back every change — the migration can never
-- partially apply.
--
-- It does NOT touch rows, code values, foreign keys, or any other
-- table, and it does not mint/revoke/rotate anything. `service_role`
-- bypasses RLS and keeps its default grants, so the admin app's
-- read-only /admin/qr listing and the validate-qr Edge Function are
-- unaffected. The public app stops querying qr_codes directly in the
-- same gate (the dormant PostgREST lookup helper is removed), so no
-- client regresses.
--
-- APPLY: operator-gated (supabase db push / SQL editor) — apply BEFORE
-- or together with deploying the validate-qr Edge Function; order vs.
-- the public app deploy does not matter because the shipped app no
-- longer reads the table.

begin;

-- ---- precheck: the table must exist --------------------------------------
do $$
begin
  if to_regclass('public.qr_codes') is null then
    raise exception 'P.13b lockdown: public.qr_codes does not exist — refusing to continue';
  end if;
end
$$;

-- ---- enforce RLS (idempotent) ---------------------------------------------
alter table public.qr_codes enable row level security;

-- ---- remove the anon-readable policy --------------------------------------
-- Restores the documented "no policies" posture. service_role does not
-- need a policy (it bypasses RLS).
drop policy if exists demo_qr_codes_select on public.qr_codes;

-- ---- revoke direct client-role privileges ---------------------------------
-- With RLS enabled and zero policies, anon/authenticated reads already
-- return no rows — but revoking the underlying grants means even a
-- future accidentally-created permissive policy cannot expose the
-- table through PostgREST without an explicit re-grant.
revoke select, insert, update, delete on table public.qr_codes from anon;
revoke select, insert, update, delete on table public.qr_codes from authenticated;

-- ---- fail-closed postchecks -------------------------------------------------
-- Any RAISE below aborts the open transaction, rolling back the policy
-- drop and the revokes above.
do $$
declare
  rls_enabled       boolean;
  remaining_policies integer;
begin
  select relrowsecurity into rls_enabled
  from pg_class
  where oid = 'public.qr_codes'::regclass;
  if rls_enabled is distinct from true then
    raise exception 'P.13b lockdown postcheck failed: RLS is not enabled on public.qr_codes';
  end if;

  select count(*) into remaining_policies
  from pg_policy
  where polrelid = 'public.qr_codes'::regclass;
  if remaining_policies > 0 then
    raise exception 'P.13b lockdown postcheck failed: % policy/policies still present on public.qr_codes — expected zero', remaining_policies;
  end if;

  if has_table_privilege('anon', 'public.qr_codes', 'select') then
    raise exception 'P.13b lockdown postcheck failed: anon still holds SELECT on public.qr_codes';
  end if;
  if has_table_privilege('authenticated', 'public.qr_codes', 'select') then
    raise exception 'P.13b lockdown postcheck failed: authenticated still holds SELECT on public.qr_codes';
  end if;
end
$$;

commit;
