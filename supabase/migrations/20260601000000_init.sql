-- ============================================================
-- Trackside Tales — initial production schema
--
-- Designed to mirror the canonical Vite app's `Tale`, `Beer`,
-- and `FoodItem` shapes from src/app/types.ts. Column choices
-- below preserve every contract the public app already relies on:
--
--   * `tales.slug` matches Tale.id verbatim — these values are
--     embedded in QR codes, badge keys, story routes (#/story/<id>),
--     and localStorage state. They MUST NOT change.
--   * `abv` and `ibu` are text, not numeric — the Vite app stores
--     them as display strings ("4.8%", "<0.5%", "18").
--   * `tap_status` accepts 'on-tap' | 'retired' | 'coming-soon' to
--     match the Tale interface.
--   * Lifecycle: `is_active` (admin soft-delete) + `status` (draft/
--     published). Defaults keep all existing rows visible to public
--     reads. The public read query filter on status='published' is
--     wired in v6.4.
--
-- Tables:
--   tales, beers, food, media_assets, qr_codes, tap_list,
--   guest_profiles, user_badges, unlock_events, game_events,
--   badge_events, reward_tiers
--
-- Guest IDs are TEXT because src/services/guestPersistence.ts
-- generates them as 'g_<rand>_<ts>' strings, not UUIDs. Changing
-- to UUID would invalidate every existing localStorage tb_guest_id.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- content: tales ----------
create table public.tales (
  slug              text primary key,
  name              text not null,
  abbr              text,
  abv               text,                       -- "4.8%" / "<0.5%" / "5.1%"
  ibu               text,                       -- "18" / "32"
  style             text,
  tagline           text,
  icon              text,
  unlock_seal       text,
  chapter           text,
  year              text,
  title             text not null,
  -- All rich content lives in jsonb to mirror the typed objects in
  -- src/data/tales.ts. Admin will edit these as structured forms.
  story             jsonb not null default '[]'::jsonb,
  pins              jsonb not null default '[]'::jsonb,        -- MapPin[]
  timeline          jsonb not null default '[]'::jsonb,        -- TimelineEvent[]
  scan_badge        jsonb,                                     -- Badge
  game_badge        jsonb,                                     -- Badge
  game              jsonb,                                     -- GameConfig
  bar_summary       jsonb,                                     -- BarSummary
  still_here        jsonb not null default '[]'::jsonb,        -- StillHere[]
  person            jsonb,                                     -- PersonInfo
  person_bio        text,
  map_title         text,
  hero_image_url    text,                                      -- public CDN URL of primary hero
  can_image_url     text,                                      -- public CDN URL of primary can
  tap_status        text not null default 'on-tap'
                      check (tap_status in ('on-tap', 'retired', 'coming-soon')),
  retired_date      date,
  is_active         boolean not null default true,
  status            text not null default 'published'
                      check (status in ('draft', 'published')),
  display_order     int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index tales_active_published_order_idx
  on public.tales (display_order)
  where is_active and status = 'published';

-- ---------- content: beers ----------
-- The Vite app currently keys beers by name (no slug column). This
-- schema introduces stable slugs for admin / QR / analytics use,
-- without changing how the public app renders the row.
create table public.beers (
  slug              text primary key,
  name              text not null,
  abbr              text,
  category          text not null check (category in ('regular', 'non-alc')),
  style             text,
  abv               text,
  ibu               text,
  tasting           text,
  can_image_url     text,
  is_active         boolean not null default true,
  status            text not null default 'published'
                      check (status in ('draft', 'published')),
  display_order     int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index beers_active_published_category_idx
  on public.beers (category, display_order)
  where is_active and status = 'published';

-- ---------- content: food ----------
-- `slug` is the stable admin/seed identifier — it lets the seed
-- be idempotent and gives the future admin app a non-display key
-- to edit by. `id` (uuid) stays as the PK so any future event /
-- audit table that references food has a stable opaque key even
-- if the human-facing slug ever changes.
create table public.food (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  description       text,
  is_active         boolean not null default true,
  status            text not null default 'published'
                      check (status in ('draft', 'published')),
  display_order     int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index food_active_published_order_idx
  on public.food (display_order)
  where is_active and status = 'published';

-- ---------- content: reward_tiers ----------
-- Placeholder for v6.8. Public-readable for the Passport "what's next"
-- progress bar. No reward_grants table yet — that arrives with the
-- admin tier editor.
create table public.reward_tiers (
  id                int primary key,
  name              text not null,
  stamps_required   int not null check (stamps_required >= 0),
  perks             jsonb not null default '[]'::jsonb,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ---------- media_assets (polymorphic owner) ----------
-- Service-role-only. The public app reads the resolved URL from
-- tales.hero_image_url / tales.can_image_url / beers.can_image_url;
-- this table is the admin history + primary-asset registry.
--
-- Cross-table FK isn't expressible because owner_kind is a discriminator;
-- a constraint trigger validates owner_slug against the matching parent.
create table public.media_assets (
  id                uuid primary key default gen_random_uuid(),
  owner_kind        text not null check (owner_kind in ('tale', 'beer')),
  owner_slug        text not null,
  kind              text not null check (kind in ('can', 'hero', 'portrait', 'gallery')),
  storage_path      text not null,
  width             int,
  height            int,
  bytes             int,
  mime_type         text,
  is_primary        boolean not null default false,
  display_order     int not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null
);

create index media_assets_owner_idx
  on public.media_assets (owner_kind, owner_slug);

-- Exactly one primary per (owner, kind).
create unique index media_assets_one_primary_idx
  on public.media_assets (owner_kind, owner_slug, kind)
  where is_primary;

-- Polymorphic owner validation. Fires on insert and on any change
-- to (owner_kind, owner_slug).
create or replace function public.media_assets_validate_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_kind = 'tale' then
    if not exists (select 1 from public.tales where slug = new.owner_slug) then
      raise exception 'media_assets.owner_slug % does not exist in tales', new.owner_slug;
    end if;
  elsif new.owner_kind = 'beer' then
    if not exists (select 1 from public.beers where slug = new.owner_slug) then
      raise exception 'media_assets.owner_slug % does not exist in beers', new.owner_slug;
    end if;
  else
    raise exception 'media_assets.owner_kind must be tale or beer, got %', new.owner_kind;
  end if;
  return new;
end;
$$;

create trigger media_assets_validate_owner_trg
  before insert or update of owner_kind, owner_slug on public.media_assets
  for each row execute function public.media_assets_validate_owner();

-- ---------- qr_codes ----------
-- Service-role only. Public app must NOT read this table directly —
-- v6.5 will introduce a validate-qr edge function for resolution.
-- The current public-app helper lookupQRCodeRemote is dormant
-- (USE_REMOTE_CONTENT is off in production builds).
create table public.qr_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  tale_slug         text not null references public.tales (slug) on delete restrict,
  redirect_to       text,                                      -- when set, edge fn resolves to this slug
  purpose           text check (purpose is null or purpose in ('can', 'poster', 'table_tent', 'staff', 'test')),
  location_label    text,
  is_active         boolean not null default true,
  rotated_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index qr_codes_active_tale_idx
  on public.qr_codes (tale_slug)
  where is_active;
create index qr_codes_redirect_to_idx
  on public.qr_codes (redirect_to)
  where redirect_to is not null;

-- redirect_to → tales.slug validation (CHECK can't subquery).
create or replace function public.qr_codes_validate_redirect()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.redirect_to is not null
     and not exists (select 1 from public.tales where slug = new.redirect_to)
  then
    raise exception 'qr_codes.redirect_to references unknown tale slug: %', new.redirect_to;
  end if;
  return new;
end;
$$;

create trigger qr_codes_validate_redirect_trg
  before insert or update of redirect_to on public.qr_codes
  for each row execute function public.qr_codes_validate_redirect();

-- ---------- tap_list ----------
-- "What's pouring right now," decoupled from beers.is_active.
-- A live row has ended_at = NULL. Multiple live rows for the same
-- beer are allowed (busy nights may pour the same beer from two
-- handles); a single tap_number is exclusive.
create table public.tap_list (
  beer_slug    text not null references public.beers (slug) on delete cascade,
  tap_number   int,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  notes        text,
  created_at   timestamptz not null default now(),
  primary key (beer_slug, started_at)
);

create index tap_list_live_idx
  on public.tap_list (started_at desc)
  where ended_at is null;

-- One tap_number can host only ONE live beer at a time. Two beers
-- on the same physical handle is a data-entry mistake. tap_number
-- is nullable (cask, casual handpump) and the constraint only
-- applies when set.
create unique index tap_list_one_live_per_tap_idx
  on public.tap_list (tap_number)
  where ended_at is null and tap_number is not null;

-- Helper for "is this beer pouring anywhere?" — non-unique on
-- purpose so the same beer can occupy two handles during high
-- volume.
create index tap_list_live_by_beer_idx
  on public.tap_list (beer_slug)
  where ended_at is null;

-- ---------- guest_profiles ----------
-- Mirrors the existing public-app contract in
-- src/services/guestPersistence.ts: guest_id is the localStorage
-- 'tb_guest_id' value, formatted as 'g_<rand>_<ts>' (TEXT, not UUID).
-- The optional auth_user_id link supports a future "claim your
-- progress" sign-in without invalidating anonymous IDs.
create table public.guest_profiles (
  guest_id          text primary key,
  auth_user_id      uuid unique references auth.users (id) on delete set null,
  display_name      text,
  email             text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now()
);

create index guest_profiles_auth_user_idx
  on public.guest_profiles (auth_user_id)
  where auth_user_id is not null;

-- ---------- user_badges ----------
-- Compatibility table for the existing recordBadgeRemote /
-- hydrateGuestProgressFromRemote helpers in src/services. The new
-- badge_events table (below) is the long-term home; user_badges is
-- maintained here so the dormant remote sync helpers continue to
-- target a real table when we eventually flip USE_REMOTE_CONTENT on.
create table public.user_badges (
  guest_id          text not null,
  tale_id           text not null,                              -- intentionally NOT FK'd:
                                                                -- preserves history if a tale is removed,
                                                                -- and tolerates client-side races.
  badge_type        text not null check (badge_type in ('scan', 'game')),
  awarded_at        timestamptz not null default now(),
  primary key (guest_id, tale_id, badge_type)
);

create index user_badges_guest_idx on public.user_badges (guest_id);
create index user_badges_tale_idx  on public.user_badges (tale_id);

-- ---------- event tables ----------
-- Append-only logs. Wired by edge functions in v6.5; no client
-- inserts even after RLS is on. guest_id is TEXT to match
-- guest_profiles.

-- One row per unlock attempt that resolved successfully.
create table public.unlock_events (
  id              bigserial primary key,
  guest_id        text not null,
  tale_slug       text references public.tales (slug) on delete set null,
  source          text not null check (source in ('scan', 'direct', 'admin', 'share')),
  qr_code_id      uuid references public.qr_codes (id) on delete set null,
  user_agent      text,
  ip_hash         text,                                          -- daily-rotated salt, never raw IP
  created_at      timestamptz not null default now()
);

create index unlock_events_guest_idx on public.unlock_events (guest_id, created_at desc);
create index unlock_events_tale_idx  on public.unlock_events (tale_slug, created_at desc) where tale_slug is not null;
create index unlock_events_recent_idx on public.unlock_events (created_at desc);

-- Mini-game funnel.
create table public.game_events (
  id              bigserial primary key,
  guest_id        text not null,
  tale_slug       text references public.tales (slug) on delete set null,
  game_type       text not null,                                  -- matches GameConfig.type
  phase           text not null check (phase in ('started', 'completed', 'failed', 'abandoned')),
  attempts        int,
  duration_ms     int,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index game_events_guest_idx     on public.game_events (guest_id, created_at desc);
create index game_events_tale_phase_idx on public.game_events (tale_slug, phase, created_at desc);
create index game_events_recent_idx    on public.game_events (created_at desc);

-- Append-only badge stream parallel to user_badges.
create table public.badge_events (
  id              bigserial primary key,
  guest_id        text not null,
  badge_key       text not null,                                  -- 'wa-lager' | 'game:wa-lager' | …
  awarded_via     text check (awarded_via is null or awarded_via in ('scan', 'game', 'admin')),
  tale_slug       text references public.tales (slug) on delete set null,
  created_at      timestamptz not null default now()
);

create index badge_events_guest_idx  on public.badge_events (guest_id, created_at desc);
create index badge_events_badge_idx  on public.badge_events (badge_key, created_at desc);
create index badge_events_recent_idx on public.badge_events (created_at desc);

-- ---------- helpers ----------

-- Touch updated_at on UPDATE for content tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tales_set_updated_at
  before update on public.tales
  for each row execute function public.set_updated_at();
create trigger beers_set_updated_at
  before update on public.beers
  for each row execute function public.set_updated_at();
create trigger food_set_updated_at
  before update on public.food
  for each row execute function public.set_updated_at();
