-- ============================================================
-- OPERATOR-ONLY — DO NOT APPLY DURING NORMAL MIGRATION REPLAY
-- ============================================================
-- P.25 rollback: restores the EXACT pre-P.25 production posture
-- captured read-only from production on 2026-08-05 (P.25 §2).
-- Apply via the Supabase SQL Editor only, only to roll back
-- 20260805000000_harden_legacy_rls_and_tap_grants.sql, and only
-- after deciding the hardening must be reverted. No data is touched.

begin;

-- restore the four demo policies exactly as they existed
create policy demo_guest_badges_all on public.guest_badges
  as permissive for all to anon using (true) with check (true);
create policy demo_guest_profiles_upsert on public.guest_profiles
  as permissive for all to anon using (true) with check (true);
create policy demo_guest_scan_events_insert on public.guest_scan_events
  as permissive for insert to anon with check (true);
create policy demo_guest_unlocks_all on public.guest_unlocks
  as permissive for all to anon using (true) with check (true);

-- restore the original single-predicate read policies
drop policy if exists "Public read active tales" on public.tales;
create policy "Public read active tales" on public.tales
  for select to public using (is_active = true);
drop policy if exists "Public read active beers" on public.beers;
create policy "Public read active beers" on public.beers
  for select to public using (is_active = true);
drop policy if exists "Public read active food items" on public.food_items;
create policy "Public read active food items" on public.food_items
  for select to public using (is_active = true);

-- restore the original fn_tap ACL: {=X, postgres=X, anon=X, authenticated=X, service_role=X}
grant execute on function public.fn_tap_start(uuid,text,text,integer,text)      to public, anon, authenticated, service_role;
grant execute on function public.fn_tap_end(uuid,text,text,timestamptz)         to public, anon, authenticated, service_role;
grant execute on function public.fn_tap_edit_notes(uuid,text,text,timestamptz,text) to public, anon, authenticated, service_role;

commit;
