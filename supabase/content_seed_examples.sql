-- ============================================================
-- Trackside Tales · Content Seed Examples
-- ============================================================
-- This file contains EXAMPLE INSERT/UPSERT statements only.
-- All examples are clearly labeled.
-- Do NOT run this file blindly — review each example and
-- adapt slugs, IDs, and values to your actual content.
--
-- Safe to run: all examples use ON CONFLICT DO NOTHING or
-- are wrapped in comments. Nothing here overwrites existing
-- working content unless you explicitly uncomment and adapt.
-- ============================================================


-- ============================================================
-- EXAMPLE 1 — Add a new Trackside Tale beer
-- ============================================================
-- Step 1: Insert the beer into `beers`

/*
insert into public.beers (
  name,
  style,
  abv,
  ibu,
  description,
  category,
  is_active,
  sort_order,
  slug
)
values (
  'Iron Furnace Porter',                          -- display name
  'Robust Porter',                                 -- style
  5.8,                                             -- ABV (decimal, not string)
  32,                                              -- IBU
  'Dark and smoky with notes of roasted malt and a hint of iron.',
  'resident',                                      -- category for tap beers
  true,                                            -- visible in app
  40,                                              -- sort order (higher = later in list)
  'iron-furnace-porter'                            -- slug — must be unique
)
on conflict (slug) do nothing;
*/

-- Step 2: After inserting, copy the UUID from the `beers` table.
-- Then insert the Tale using that UUID as beer_id.

/*
insert into public.tales (
  slug,
  title,
  beer_id,                       -- paste the UUID of the beer row above
  is_active,
  sort_order,
  year,
  chapter_label
)
values (
  'iron-furnace-porter',         -- must match beers.slug and qr_codes.tale_slug
  'The Furnace That Built a City',
  'PASTE_BEER_UUID_HERE',        -- replace with actual beer UUID
  true,
  40,
  '1873',
  'Steel & Fire Era'
)
on conflict (slug) do nothing;
*/


-- ============================================================
-- EXAMPLE 2 — Add a regular resident beer (no Tale)
-- ============================================================

/*
insert into public.beers (
  name,
  style,
  abv,
  ibu,
  description,
  category,
  is_active,
  sort_order
)
values (
  'Platform 9 IPA',
  'West Coast IPA',
  6.5,
  55,
  'Bright and resinous with citrus and pine. Named for the departure track at the old CNJ station.',
  'resident',
  true,
  30
)
on conflict do nothing;
*/


-- ============================================================
-- EXAMPLE 3 — Add a food item
-- ============================================================

/*
insert into public.food_items (
  name,
  description,
  category,
  is_active,
  sort_order
)
values (
  'The Spike Driver',
  'House-smoked brisket sliders with rail-side pickles and ember aioli.',
  'featured',
  true,
  20
)
on conflict do nothing;
*/


-- ============================================================
-- EXAMPLE 4 — Add a reward tier
-- ============================================================
-- stamps_required should match the number of Tales a guest
-- must unlock to earn this reward.

/*
insert into public.reward_tiers (
  name,
  stamps_required,
  is_live,
  sort_order
)
values (
  'Brakeman''s Badge',    -- 1 stamp
  1,
  true,
  10
),
(
  'Conductor''s Pin',     -- 3 stamps (all Tales unlocked)
  3,
  true,
  20
)
on conflict do nothing;
*/


-- ============================================================
-- EXAMPLE 5 — Add a coming-next Tale teaser
-- ============================================================

/*
insert into public.coming_next_tales (
  name,
  teaser,
  status,
  sort_order
)
values (
  'The Furnace Era',
  'A dark porter rooted in the iron age that forged the Lehigh Valley.',
  'coming_soon',
  10
)
on conflict do nothing;
*/


-- ============================================================
-- EXAMPLE 6 — Add a QR code token
-- ============================================================
-- Use a random token. Never encode the beer name as proof of unlock.
-- The token maps to a Tale server-side.
--
-- Recommended format:
--   Demo:       ts_demo_[BEER_ABBR]_[RANDOM]
--   Production: ts_live_[RANDOM_ONLY]
--
-- URL to print on can (or use as a direct QR target):
--   https://jayc92.github.io/trackside-tales/?code=ts_live_PQ7X2N9M4K1R8T5V3B6W0

/*
insert into public.qr_codes (
  code,
  tale_slug,
  is_active,
  campaign_key,
  batch_key
)
values (
  'ts_live_PQ7X2N9M4K1R8T5V3B6W0',   -- random token
  'iron-furnace-porter',               -- must match tales.slug exactly
  true,
  'launch-spring-2025',               -- campaign label for tracking
  'print-run-001'                      -- optional print run label
)
on conflict (code) do nothing;
*/


-- ============================================================
-- QUICK ADMIN VALIDATION QUERIES
-- ============================================================
-- Run these after inserting content to confirm everything is wired up.

-- Full content overview:
-- select * from admin_content_overview;

-- All Tales with QR status and unlock counts:
-- select * from admin_tales_status order by sort_order;

-- All QR codes with derived status:
-- select * from admin_qr_code_status;

-- Content problems (no rows = all clear):
-- select * from admin_missing_content_checks;

-- Guest activity:
-- select * from admin_guest_activity_summary limit 20;
