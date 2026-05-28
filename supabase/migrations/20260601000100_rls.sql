-- ============================================================
-- Row-Level Security
--
-- Posture:
--   * Content tables (tales, beers, food, reward_tiers) are
--     world-readable for active + published rows only. Public app
--     uses the anon key. Drafts and inactive rows are invisible to
--     anon/authenticated.
--   * tap_list: world-readable, but only rows currently live
--     (ended_at IS NULL).
--   * qr_codes: RLS enabled with NO policies — service role only.
--     Public app must never read this table directly. Resolution
--     goes through the validate-qr edge function (v6.5).
--   * media_assets: service role only.
--   * Guest progress (guest_profiles, user_badges) and event tables
--     (unlock_events, game_events, badge_events): RLS enabled, NO
--     anon/authenticated INSERT/UPDATE/DELETE policies. Reads are
--     scoped by guest identity; writes go through edge functions.
--
-- A SQL-level helper for "is this row mine?" can't use auth.uid()
-- here because guest_id is TEXT (not the auth user UUID). For now
-- there are no anon-readable policies on guest tables — the dormant
-- recordBadgeRemote / hydrateGuestProgressFromRemote helpers in the
-- canonical Vite app are NOT yet enabled (USE_REMOTE_CONTENT is off
-- in production), so locking them out is safe. v6.5 will introduce
-- an edge function that issues a short-lived signed token bound to
-- a guest_id, at which point we can add per-guest read policies
-- keyed off that token. Until then: writes server-side, reads
-- server-side, full stop.
-- ============================================================

-- ---------- content tables ----------
alter table public.tales        enable row level security;
alter table public.beers        enable row level security;
alter table public.food         enable row level security;
alter table public.reward_tiers enable row level security;

create policy "tales: public read published active" on public.tales
  for select using (is_active and status = 'published');

create policy "beers: public read published active" on public.beers
  for select using (is_active and status = 'published');

create policy "food: public read published active" on public.food
  for select using (is_active and status = 'published');

create policy "reward_tiers: public read active" on public.reward_tiers
  for select using (is_active);

-- ---------- tap_list ----------
alter table public.tap_list enable row level security;

create policy "tap_list: public read live" on public.tap_list
  for select using (ended_at is null);

-- ---------- qr_codes (no client access) ----------
alter table public.qr_codes enable row level security;
-- Intentionally no policies. Service role only. The validate-qr
-- edge function performs all resolution.

-- ---------- media_assets (service role only) ----------
alter table public.media_assets enable row level security;
-- Intentionally no policies. Public app reads URLs from
-- tales.hero_image_url / beers.can_image_url instead of joining
-- this table.

-- ---------- guest_profiles ----------
alter table public.guest_profiles enable row level security;
-- No anon/authed policies. Edge functions write; admin reads via
-- service role. See header note about future signed-token reads.

-- ---------- user_badges ----------
alter table public.user_badges enable row level security;
-- No anon/authed policies. The dormant client-side helper
-- recordBadgeRemote in src/services/badgeService.ts is NOT yet
-- pointed at this table in production; v6.5 will move it behind
-- an edge function before flipping USE_REMOTE_CONTENT on.

-- ---------- unlock_events / game_events / badge_events ----------
alter table public.unlock_events enable row level security;
alter table public.game_events   enable row level security;
alter table public.badge_events  enable row level security;
-- All inserts via edge functions (service role). No client
-- read/write policies; admin reads via service role.
