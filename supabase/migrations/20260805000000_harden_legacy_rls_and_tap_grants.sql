-- ============================================================
-- PUBLIC/SUPABASE-v7.4B.P.25 — legacy RLS and grant hardening
-- ============================================================
-- Scope (deliberately narrow):
--   1. Drop the four v6-era demo policies that let `anon` WRITE to
--      the guest tables (guest_badges, guest_profiles,
--      guest_scan_events, guest_unlocks). No application path writes
--      these tables today (the public app is localStorage-only for
--      guest progress; the only code referencing them server-side is
--      the undeployed log-events function, which runs service-role).
--      No replacement policy: with RLS enabled and zero policies the
--      tables become service-role-only — the same posture as every
--      other non-public table in this schema.
--   2. Tighten the three public content READ policies from
--      `is_active = true` to `is_active AND status = 'published'`.
--      Every public query already applies exactly this filter
--      (contentService PUBLISHED_FILTER), the draft-preview and QR
--      paths run service-role (BYPASSRLS), and at authoring time no
--      production row changes visibility (all is_active rows are
--      status='published'; zero NULL statuses — NULL would be
--      excluded by the strict equality, which is the intended
--      fail-closed behavior for any future NULL).
--   3. Remove PUBLIC/anon/authenticated EXECUTE on the three
--      fn_tap_* mutation RPCs. Their only caller is the admin app's
--      server actions via the service-role client. They are SECURITY
--      INVOKER, so anon execution was already blocked at the RLS
--      layer when writing tap_list — this closes the outer layer too.
--
-- Explicitly OUT of scope: table-level default privileges (Supabase
-- platform defaults), other read policies (venues, reward_tiers,
-- coming_next_tales, tap_list), qr_codes (locked since P.13b), and
-- any data change. No rows are touched.
--
-- Idempotent: drop policy if exists / create policy after drop /
-- revoke+grant are all safe to re-run.
-- Rollback: supabase/operator-sql/P25-rollback-legacy-rls-and-grants.sql
--           (OPERATOR-ONLY; restores the exact pre-P.25 posture).

begin;

-- ---------- prechecks (fail closed on unexpected schema) ----------
do $pre$
begin
  if to_regclass('public.guest_badges') is null
     or to_regclass('public.tales') is null
     or to_regprocedure('public.fn_tap_start(uuid,text,text,integer,text)') is null
     or to_regprocedure('public.fn_tap_end(uuid,text,text,timestamptz)') is null
     or to_regprocedure('public.fn_tap_edit_notes(uuid,text,text,timestamptz,text)') is null then
    raise exception 'P.25 precheck: expected table or fn_tap signature missing';
  end if;
end
$pre$;

-- ---------- 1. drop legacy demo anonymous-write policies ----------
drop policy if exists demo_guest_badges_all       on public.guest_badges;
drop policy if exists demo_guest_profiles_upsert  on public.guest_profiles;
drop policy if exists demo_guest_scan_events_insert on public.guest_scan_events;
drop policy if exists demo_guest_unlocks_all      on public.guest_unlocks;

-- ---------- 2. tighten public content read policies ----------
-- Same policy names as production; predicate now matches the public
-- app's own filter exactly. SELECT-only, PERMISSIVE, role public
-- (read applies to anon + authenticated; service_role bypasses RLS).
drop policy if exists "Public read active tales" on public.tales;
create policy "Public read active tales" on public.tales
  for select to public
  using (is_active = true and status = 'published');

drop policy if exists "Public read active beers" on public.beers;
create policy "Public read active beers" on public.beers
  for select to public
  using (is_active = true and status = 'published');

drop policy if exists "Public read active food items" on public.food_items;
create policy "Public read active food items" on public.food_items
  for select to public
  using (is_active = true and status = 'published');

-- ---------- 3. lock fn_tap_* execution to service_role ----------
revoke execute on function public.fn_tap_start(uuid,text,text,integer,text)
  from public, anon, authenticated;
revoke execute on function public.fn_tap_end(uuid,text,text,timestamptz)
  from public, anon, authenticated;
revoke execute on function public.fn_tap_edit_notes(uuid,text,text,timestamptz,text)
  from public, anon, authenticated;

grant execute on function public.fn_tap_start(uuid,text,text,integer,text)      to service_role;
grant execute on function public.fn_tap_end(uuid,text,text,timestamptz)         to service_role;
grant execute on function public.fn_tap_edit_notes(uuid,text,text,timestamptz,text) to service_role;

-- ---------- postchecks (raise -> rollback the whole transaction) ----------
do $post$
declare
  v_demo int;
  v_pol  int;
  v_bad  int;
begin
  select count(*) into v_demo from pg_policies
   where schemaname='public' and policyname like 'demo\_%';
  if v_demo <> 0 then
    raise exception 'P.25 postcheck: % demo policy(ies) still present', v_demo;
  end if;

  select count(*) into v_pol from pg_policies
   where schemaname='public'
     and policyname in ('Public read active tales','Public read active beers','Public read active food items')
     and qual like '%is_active%' and qual like '%published%' and cmd = 'SELECT';
  if v_pol <> 3 then
    raise exception 'P.25 postcheck: tightened read policies found %, expected 3', v_pol;
  end if;

  select count(*) into v_bad from pg_proc p
   where p.pronamespace='public'::regnamespace and p.proname like 'fn_tap%'
     and ( has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE') );
  if v_bad <> 0 then
    raise exception 'P.25 postcheck: % fn_tap function(s) still executable by anon/authenticated', v_bad;
  end if;

  select count(*) into v_bad from pg_proc p
   where p.pronamespace='public'::regnamespace and p.proname like 'fn_tap%'
     and not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_bad <> 0 then
    raise exception 'P.25 postcheck: % fn_tap function(s) NOT executable by service_role', v_bad;
  end if;

  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relkind='r'
                and c.relname in ('guest_badges','guest_profiles','guest_scan_events','guest_unlocks','tales','beers','food_items')
                and not c.relrowsecurity) then
    raise exception 'P.25 postcheck: RLS unexpectedly disabled on an affected table';
  end if;

  raise notice 'P.25 postchecks OK: demo policies removed, read policies tightened, fn_tap locked to service_role';
end
$post$;

commit;
