-- ============================================================
-- Trackside Tales · v4.4 Content Admin Workflow
-- ============================================================
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor).
-- All statements are idempotent — safe to re-run.
--
-- What this file adds:
--   1. Defensive indexes for content and interaction tables
--   2. Admin overview views for dashboard inspection
--   3. Missing-content check view
--
-- These views are for Supabase dashboard / operator use only.
-- The public app does NOT query these views.
-- No new public anon policies are created here.
-- ============================================================


-- ============================================================
-- SECTION 1 — INDEXES
-- ============================================================
-- All created with IF NOT EXISTS. Safe to run on tables that
-- already have some indexes.

-- ── beers ────────────────────────────────────────────────────
create index if not exists idx_beers_slug
  on public.beers (slug) where slug is not null;

create index if not exists idx_beers_name
  on public.beers (name);

create index if not exists idx_beers_category
  on public.beers (category) where category is not null;

create index if not exists idx_beers_is_active
  on public.beers (is_active);

create index if not exists idx_beers_sort_order
  on public.beers (sort_order);

-- ── tales ────────────────────────────────────────────────────
create index if not exists idx_tales_slug
  on public.tales (slug) where slug is not null;

create index if not exists idx_tales_beer_id
  on public.tales (beer_id) where beer_id is not null;

create index if not exists idx_tales_is_active
  on public.tales (is_active);

create index if not exists idx_tales_sort_order
  on public.tales (sort_order);

-- ── food_items ───────────────────────────────────────────────
create index if not exists idx_food_items_category
  on public.food_items (category) where category is not null;

create index if not exists idx_food_items_is_active
  on public.food_items (is_active);

create index if not exists idx_food_items_sort_order
  on public.food_items (sort_order);

-- ── reward_tiers ─────────────────────────────────────────────
create index if not exists idx_reward_tiers_sort_order
  on public.reward_tiers (sort_order);

-- ── coming_next_tales ────────────────────────────────────────
create index if not exists idx_coming_next_tales_sort_order
  on public.coming_next_tales (sort_order);

-- ── qr_codes ─────────────────────────────────────────────────
create index if not exists idx_qr_codes_code
  on public.qr_codes (code);

create index if not exists idx_qr_codes_tale_slug
  on public.qr_codes (tale_slug) where tale_slug is not null;

create index if not exists idx_qr_codes_is_active
  on public.qr_codes (is_active);

create index if not exists idx_qr_codes_campaign_key
  on public.qr_codes (campaign_key) where campaign_key is not null;

-- ── guest_unlocks ─────────────────────────────────────────────
create index if not exists idx_guest_unlocks_guest_id
  on public.guest_unlocks (guest_id);

create index if not exists idx_guest_unlocks_tale_slug
  on public.guest_unlocks (tale_slug);

-- ── guest_badges ─────────────────────────────────────────────
create index if not exists idx_guest_badges_guest_id
  on public.guest_badges (guest_id);

create index if not exists idx_guest_badges_badge_key
  on public.guest_badges (badge_key);

-- ── guest_scan_events ────────────────────────────────────────
create index if not exists idx_guest_scan_events_guest_id
  on public.guest_scan_events (guest_id);

create index if not exists idx_guest_scan_events_created_at
  on public.guest_scan_events (created_at desc);


-- ============================================================
-- SECTION 2 — ADMIN VIEWS
-- ============================================================
-- These views are for operator/admin use in the Supabase
-- dashboard only. The public app never queries them.
-- All use CREATE OR REPLACE VIEW — safe to re-run.


-- ── admin_content_overview ───────────────────────────────────
-- Single-row dashboard summary of all content counts.

create or replace view public.admin_content_overview as
select
  (select count(*) from public.beers      where is_active = true)  as active_beers,
  (select count(*) from public.tales      where is_active = true)  as active_tales,
  (select count(*) from public.food_items where is_active = true)  as active_food_items,
  (select count(*) from public.reward_tiers)                       as reward_tiers,
  (select count(*) from public.coming_next_tales)                  as coming_next_count,
  (select count(*) from public.qr_codes   where is_active = true)  as active_qr_codes,
  (select count(*) from public.qr_codes   where is_active = false) as inactive_qr_codes,
  (select count(*) from public.guest_profiles)                     as total_guests,
  (select count(*) from public.guest_unlocks)                      as total_unlocks,
  (select count(*) from public.guest_badges)                       as total_badges,
  (select count(*) from public.guest_scan_events)                  as total_scan_events;


-- ── admin_tales_status ────────────────────────────────────────
-- One row per Tale with beer info, QR code status, and unlock count.

create or replace view public.admin_tales_status as
select
  t.id                                                    as tale_id,
  t.slug                                                  as tale_slug,
  t.title                                                 as tale_title,
  t.is_active,
  t.sort_order,
  t.year,
  b.name                                                  as beer_name,
  b.style                                                 as beer_style,
  b.abv                                                   as beer_abv,
  b.is_active                                             as beer_is_active,
  -- QR presence
  (select count(*)
   from   public.qr_codes q
   where  q.tale_slug = t.slug)                          as total_qr_codes,
  (select count(*)
   from   public.qr_codes q
   where  q.tale_slug = t.slug
   and    q.is_active = true)                            as active_qr_codes,
  -- Unlock count from guest_unlocks (tale_slug matches)
  (select count(*)
   from   public.guest_unlocks u
   where  u.tale_slug = t.slug)                          as unlock_count
from
  public.tales  t
  left join public.beers b on b.id = t.beer_id
order by
  t.sort_order nulls last, t.slug;


-- ── admin_qr_code_status ──────────────────────────────────────
-- One row per QR code with derived status label and usage counts.

create or replace view public.admin_qr_code_status as
select
  q.id,
  q.code,
  q.tale_slug,
  q.campaign_key,
  q.batch_key,
  q.is_active,
  q.valid_from,
  q.valid_until,
  q.max_uses,
  q.created_at,
  -- Scan count
  (select count(*)
   from   public.guest_scan_events e
   where  e.code_value = q.code)                        as scan_count,
  -- Unlock count
  (select count(*)
   from   public.guest_unlocks u
   where  u.qr_code = q.code)                           as unlock_count,
  -- Derived status label
  case
    when q.is_active = false
      then 'inactive'
    when q.valid_until is not null and q.valid_until < now()
      then 'expired'
    when q.valid_from  is not null and q.valid_from  > now()
      then 'not_yet_valid'
    when q.tale_slug is null
      then 'active_no_tale'
    else 'active_ready'
  end                                                    as status_label
from
  public.qr_codes q
order by
  q.is_active desc, q.created_at desc;


-- ── admin_guest_activity_summary ──────────────────────────────
-- One row per guest with aggregated activity metrics.

create or replace view public.admin_guest_activity_summary as
select
  gp.guest_id,
  gp.nickname,
  gp.created_at                                           as guest_created_at,
  -- Unlock metrics
  (select count(*)
   from   public.guest_unlocks u
   where  u.guest_id = gp.guest_id)                     as unlock_count,
  (select max(u.unlocked_at)
   from   public.guest_unlocks u
   where  u.guest_id = gp.guest_id)                     as last_unlock_at,
  -- Badge metrics
  (select count(*)
   from   public.guest_badges bd
   where  bd.guest_id = gp.guest_id)                    as badge_count,
  -- Scan event metrics
  (select count(*)
   from   public.guest_scan_events e
   where  e.guest_id = gp.guest_id)                     as scan_event_count,
  (select max(e.created_at)
   from   public.guest_scan_events e
   where  e.guest_id = gp.guest_id)                     as last_scan_at
from
  public.guest_profiles gp
order by
  last_unlock_at desc nulls last;


-- ── admin_missing_content_checks ─────────────────────────────
-- Surfaces content problems. Returns one row per issue found.
-- Run periodically before events or launches.

create or replace view public.admin_missing_content_checks as

-- Active Tale with no active QR code
select
  'active_tale_no_active_qr'    as check_type,
  t.slug                        as reference_id,
  t.title                       as detail
from
  public.tales t
where
  t.is_active = true
  and not exists (
    select 1 from public.qr_codes q
    where  q.tale_slug = t.slug and q.is_active = true
  )

union all

-- Active QR code with no matching Tale
select
  'active_qr_no_tale'           as check_type,
  q.code                        as reference_id,
  coalesce(q.tale_slug, '(null)')  as detail
from
  public.qr_codes q
where
  q.is_active = true
  and (
    q.tale_slug is null
    or not exists (
      select 1 from public.tales t where t.slug = q.tale_slug
    )
  )

union all

-- Active Tale missing title
select
  'tale_missing_title'          as check_type,
  t.slug                        as reference_id,
  '(no title)'                  as detail
from
  public.tales t
where
  t.is_active = true
  and (t.title is null or t.title = '')

union all

-- Active Tale linked to inactive beer
select
  'tale_linked_to_inactive_beer' as check_type,
  t.slug                         as reference_id,
  b.name                         as detail
from
  public.tales t
  join public.beers b on b.id = t.beer_id
where
  t.is_active = true
  and b.is_active = false

union all

-- Beer missing name
select
  'beer_missing_name'           as check_type,
  coalesce(cast(b.id as text), '(no id)') as reference_id,
  '(no name)'                   as detail
from
  public.beers b
where
  b.is_active = true
  and (b.name is null or b.name = '')

union all

-- Expired QR code that is still marked active
select
  'expired_qr_still_active'     as check_type,
  q.code                        as reference_id,
  cast(q.valid_until as text)   as detail
from
  public.qr_codes q
where
  q.is_active = true
  and q.valid_until is not null
  and q.valid_until < now()

order by
  check_type, reference_id;


-- ============================================================
-- SECTION 3 — NOTES
-- ============================================================
-- After running:
--   1. Open Supabase Table Editor and verify indexes exist.
--   2. Run in SQL Editor:
--        select * from admin_content_overview;
--        select * from admin_tales_status;
--        select * from admin_qr_code_status;
--        select * from admin_missing_content_checks;
--        select * from admin_guest_activity_summary;
--   3. admin_missing_content_checks rows = content issues to fix.
--      No rows = all checks passed.
-- ============================================================
