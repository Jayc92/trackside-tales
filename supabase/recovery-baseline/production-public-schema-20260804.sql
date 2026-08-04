-- ============================================================================
-- TRACKSIDE — CANONICAL RECOVERY BASELINE (public schema, SCHEMA-ONLY)
-- ============================================================================
-- Snapshot of the PRODUCTION public schema, captured 2026-08-04 via
-- read-only Management-API catalog queries (ADMIN/SUPABASE-v7.4B.P.24a).
--
--  *** NEVER APPLY THIS FILE TO THE EXISTING PRODUCTION PROJECT ***
--  *** (uuuugwfkequtgytwuuat). IT IS FOR BLANK RECOVERY TARGETS ***
--  *** (a fresh Supabase project or disposable local stack) ONLY. ***
--
-- Cutoff: this baseline supersedes EVERY migration file dated
-- 20260731000000 or earlier (all 28 historical files across both repos
-- are already reflected in this snapshot — see migration-manifest.json).
-- Only migrations dated AFTER 2026-08-04 may be applied on top.
--
-- Contains: tables, columns, defaults, constraints, sequences, views
-- (incl. security_invoker), functions/RPCs (verbatim, incl. SECURITY
-- and search_path posture), indexes, RLS enablement, policies, role
-- grants for anon/authenticated/service_role, and table comments.
--
-- Excludes (recover separately): all data rows, Auth users/MFA,
-- Storage buckets/objects (the `media` bucket is dashboard-created:
-- public, 5 MiB limit), Edge Functions (deploy from git), secrets,
-- SMTP/DNS, realtime publication config, platform-managed schemas,
-- and platform-default extensions (pg_stat_statements, supabase_vault).
--
-- Secret-free review completed in P.24a (zero credentials, tokens,
-- emails, QR values, or UUID literals). Transformations from the raw
-- capture are logged in README.md alongside this file.
-- ============================================================================

begin;

-- ---------- extensions (app-required; platform defaults excluded) ----------
create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "uuid-ossp" with schema "extensions";

-- ---------- sequences ----------
create sequence public.admin_actions_id_seq;

-- ---------- tables (columns + defaults; constraints follow) ----------
create table public.admin_actions (
  id bigint default nextval('admin_actions_id_seq'::regclass) not null,
  actor_id uuid not null,
  actor_email text not null,
  action text not null,
  target_kind text not null,
  target_key text not null,
  payload jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null
);
create table public.beers (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  style text,
  abv numeric(4,1),
  ibu integer,
  category text not null,
  short_description text,
  description text,
  can_image_url text,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  status text
);
create table public.coming_next_tales (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  teaser text,
  status text default 'coming_soon'::text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.food_items (
  id uuid default gen_random_uuid() not null,
  venue_id uuid,
  name text not null,
  description text,
  category text,
  is_featured boolean default false not null,
  sort_order integer default 0 not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  slug text,
  status text,
  image_url text,
  price_cents integer
);
create table public.guest_badges (
  id uuid default gen_random_uuid() not null,
  guest_id text not null,
  tale_slug text,
  badge_key text not null,
  badge_label text,
  earned_at timestamp with time zone default now()
);
create table public.guest_profiles (
  guest_id text not null,
  nickname text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
create table public.guest_scan_events (
  id uuid default gen_random_uuid() not null,
  guest_id text not null,
  code_value text,
  resolved_tale_slug text,
  scan_status text,
  created_at timestamp with time zone default now()
);
create table public.guest_unlocks (
  id uuid default gen_random_uuid() not null,
  guest_id text not null,
  tale_slug text not null,
  beer_id text,
  qr_code text,
  source text default 'demo'::text,
  unlocked_at timestamp with time zone default now()
);
create table public.guests (
  id uuid default gen_random_uuid() not null,
  display_name text,
  email text,
  created_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone
);
create table public.media_assets (
  id uuid default gen_random_uuid() not null,
  bucket text not null,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  original_filename text,
  alt_text text,
  uploaded_by uuid not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.qr_codes (
  id uuid default gen_random_uuid() not null,
  code text not null,
  venue_id uuid,
  tale_id uuid,
  beer_id uuid,
  status text default 'active'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_active boolean default true,
  tale_slug text,
  campaign_key text,
  batch_key text,
  valid_from timestamp with time zone,
  valid_until timestamp with time zone,
  max_uses integer
);
create table public.reward_tiers (
  id uuid default gen_random_uuid() not null,
  venue_id uuid,
  name text not null,
  stamps_required integer not null,
  description text,
  is_live boolean default false not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
create table public.scan_events (
  id uuid default gen_random_uuid() not null,
  guest_id uuid,
  qr_code_id uuid,
  tale_id uuid,
  venue_id uuid,
  scanned_at timestamp with time zone default now() not null,
  user_agent text
);
create table public.tales (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  beer_id uuid,
  venue_id uuid,
  title text not null,
  subtitle text,
  person_or_place text,
  year text,
  chapter_label text,
  story_body text,
  timeline jsonb,
  map_points jsonb,
  intro_type text,
  intro_asset_url text,
  stamp_image_url text,
  mini_game_type text,
  is_active boolean default true not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  name text,
  tap_status text,
  status text
);
create table public.tap_list (
  beer_slug text not null,
  tap_number integer,
  started_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now() not null
);
create table public.user_badges (
  id uuid default gen_random_uuid() not null,
  guest_id uuid not null,
  tale_id uuid not null,
  badge_type text not null,
  earned_at timestamp with time zone default now() not null
);
create table public.user_tale_unlocks (
  id uuid default gen_random_uuid() not null,
  guest_id uuid not null,
  tale_id uuid not null,
  venue_id uuid,
  unlocked_at timestamp with time zone default now() not null
);
create table public.venues (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  city text,
  state text,
  description text,
  hero_title text,
  hero_subtitle text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- ---------- primary key / unique / check constraints ----------
alter table public.admin_actions add constraint admin_actions_action_check CHECK ((action = ANY (ARRAY['tale.preview.create'::text, 'qr.download'::text, 'qr.create'::text, 'qr.rotate'::text, 'qr.revoke'::text, 'tap.start'::text, 'tap.end'::text, 'tap.edit_notes'::text, 'beer.create'::text, 'beer.update'::text, 'beer.archive'::text, 'food.create'::text, 'food.update'::text, 'food.archive'::text, 'admin.invite'::text, 'admin.promote'::text, 'admin.demote'::text, 'admin.disable'::text, 'admin.enable'::text, 'admin.mfa_reset'::text, 'tale.create'::text, 'tale.update'::text, 'tale.archive'::text, 'media.upload'::text, 'media.assign'::text, 'media.unassign'::text, 'media.delete'::text, 'media.delete.started'::text, 'media.delete.failed'::text])));
alter table public.admin_actions add constraint admin_actions_pkey PRIMARY KEY (id);
alter table public.beers add constraint beers_category_check CHECK ((category = ANY (ARRAY['tale'::text, 'resident'::text, 'na'::text, 'cider'::text])));
alter table public.beers add constraint beers_status_canonical_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['draft'::text, 'published'::text]))));
alter table public.beers add constraint beers_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['draft'::text, 'published'::text]))));
alter table public.beers add constraint beers_pkey PRIMARY KEY (id);
alter table public.beers add constraint beers_slug_key UNIQUE (slug);
alter table public.coming_next_tales add constraint coming_next_tales_status_check CHECK ((status = ANY (ARRAY['coming_soon'::text, 'in_development'::text, 'launching_soon'::text])));
alter table public.coming_next_tales add constraint coming_next_tales_pkey PRIMARY KEY (id);
alter table public.coming_next_tales add constraint coming_next_tales_slug_key UNIQUE (slug);
alter table public.food_items add constraint food_items_price_cents_nonneg CHECK (((price_cents IS NULL) OR (price_cents >= 0)));
alter table public.food_items add constraint food_items_status_canonical_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['draft'::text, 'published'::text]))));
alter table public.food_items add constraint food_items_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['draft'::text, 'published'::text]))));
alter table public.food_items add constraint food_items_pkey PRIMARY KEY (id);
alter table public.food_items add constraint food_items_slug_canonical_unique UNIQUE (slug);
alter table public.guest_badges add constraint guest_badges_pkey PRIMARY KEY (id);
alter table public.guest_badges add constraint guest_badges_guest_id_badge_key_key UNIQUE (guest_id, badge_key);
alter table public.guest_profiles add constraint guest_profiles_pkey PRIMARY KEY (guest_id);
alter table public.guest_scan_events add constraint guest_scan_events_pkey PRIMARY KEY (id);
alter table public.guest_unlocks add constraint guest_unlocks_pkey PRIMARY KEY (id);
alter table public.guest_unlocks add constraint guest_unlocks_guest_id_tale_slug_key UNIQUE (guest_id, tale_slug);
alter table public.guests add constraint guests_pkey PRIMARY KEY (id);
alter table public.guests add constraint guests_email_key UNIQUE (email);
alter table public.media_assets add constraint media_assets_byte_size_check CHECK ((byte_size > 0));
alter table public.media_assets add constraint media_assets_pkey PRIMARY KEY (id);
alter table public.media_assets add constraint media_assets_bucket_path_unique UNIQUE (bucket, storage_path);
alter table public.qr_codes add constraint qr_codes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'revoked'::text])));
alter table public.qr_codes add constraint qr_codes_pkey PRIMARY KEY (id);
alter table public.qr_codes add constraint qr_codes_code_key UNIQUE (code);
alter table public.reward_tiers add constraint reward_tiers_pkey PRIMARY KEY (id);
alter table public.scan_events add constraint scan_events_pkey PRIMARY KEY (id);
alter table public.tales add constraint tales_intro_type_check CHECK ((intro_type = ANY (ARRAY['css_animation'::text, 'video'::text, 'none'::text])));
alter table public.tales add constraint tales_mini_game_type_check CHECK ((mini_game_type = ANY (ARRAY['grid'::text, 'spike'::text, 'match'::text])));
alter table public.tales add constraint tales_status_canonical_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['draft'::text, 'published'::text]))));
alter table public.tales add constraint tales_status_check CHECK (((status IS NULL) OR (status = ANY (ARRAY['draft'::text, 'published'::text]))));
alter table public.tales add constraint tales_tap_status_canonical_check CHECK (((tap_status IS NULL) OR (tap_status = ANY (ARRAY['on-tap'::text, 'retired'::text, 'coming-soon'::text]))));
alter table public.tales add constraint tales_tap_status_check CHECK (((tap_status IS NULL) OR (tap_status = ANY (ARRAY['on-tap'::text, 'retired'::text, 'coming-soon'::text]))));
alter table public.tales add constraint tales_pkey PRIMARY KEY (id);
alter table public.tales add constraint tales_slug_key UNIQUE (slug);
alter table public.tap_list add constraint tap_list_pkey PRIMARY KEY (beer_slug, started_at);
alter table public.user_badges add constraint user_badges_badge_type_check CHECK ((badge_type = ANY (ARRAY['story'::text, 'mini_game'::text])));
alter table public.user_badges add constraint user_badges_pkey PRIMARY KEY (id);
alter table public.user_badges add constraint user_badges_guest_id_tale_id_badge_type_key UNIQUE (guest_id, tale_id, badge_type);
alter table public.user_tale_unlocks add constraint user_tale_unlocks_pkey PRIMARY KEY (id);
alter table public.user_tale_unlocks add constraint user_tale_unlocks_guest_id_tale_id_key UNIQUE (guest_id, tale_id);
alter table public.venues add constraint venues_pkey PRIMARY KEY (id);
alter table public.venues add constraint venues_slug_key UNIQUE (slug);

-- ---------- foreign keys ----------
alter table public.admin_actions add constraint admin_actions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public.food_items add constraint food_items_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.media_assets add constraint media_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public.qr_codes add constraint qr_codes_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES beers(id) ON DELETE SET NULL;
alter table public.qr_codes add constraint qr_codes_tale_id_fkey FOREIGN KEY (tale_id) REFERENCES tales(id) ON DELETE SET NULL;
alter table public.qr_codes add constraint qr_codes_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
alter table public.reward_tiers add constraint reward_tiers_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.scan_events add constraint scan_events_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL;
alter table public.scan_events add constraint scan_events_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id) ON DELETE SET NULL;
alter table public.scan_events add constraint scan_events_tale_id_fkey FOREIGN KEY (tale_id) REFERENCES tales(id) ON DELETE SET NULL;
alter table public.scan_events add constraint scan_events_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
alter table public.tales add constraint tales_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES beers(id) ON DELETE SET NULL;
alter table public.tales add constraint tales_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
alter table public.tap_list add constraint tap_list_beer_slug_fkey FOREIGN KEY (beer_slug) REFERENCES beers(slug) ON DELETE CASCADE;
alter table public.user_badges add constraint user_badges_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;
alter table public.user_badges add constraint user_badges_tale_id_fkey FOREIGN KEY (tale_id) REFERENCES tales(id) ON DELETE CASCADE;
alter table public.user_tale_unlocks add constraint user_tale_unlocks_guest_id_fkey FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE;
alter table public.user_tale_unlocks add constraint user_tale_unlocks_tale_id_fkey FOREIGN KEY (tale_id) REFERENCES tales(id) ON DELETE CASCADE;
alter table public.user_tale_unlocks add constraint user_tale_unlocks_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;

alter sequence public.admin_actions_id_seq owned by public.admin_actions.id;

-- ---------- views ----------
create or replace view public.admin_content_overview as
 SELECT ( SELECT count(*) AS count
           FROM beers
          WHERE (beers.is_active = true)) AS active_beers,
    ( SELECT count(*) AS count
           FROM tales
          WHERE (tales.is_active = true)) AS active_tales,
    ( SELECT count(*) AS count
           FROM food_items
          WHERE (food_items.is_active = true)) AS active_food_items,
    ( SELECT count(*) AS count
           FROM reward_tiers) AS reward_tiers,
    ( SELECT count(*) AS count
           FROM coming_next_tales) AS coming_next_count,
    ( SELECT count(*) AS count
           FROM qr_codes
          WHERE (qr_codes.is_active = true)) AS active_qr_codes,
    ( SELECT count(*) AS count
           FROM qr_codes
          WHERE (qr_codes.is_active = false)) AS inactive_qr_codes,
    ( SELECT count(*) AS count
           FROM guest_profiles) AS total_guests,
    ( SELECT count(*) AS count
           FROM guest_unlocks) AS total_unlocks,
    ( SELECT count(*) AS count
           FROM guest_badges) AS total_badges,
    ( SELECT count(*) AS count
           FROM guest_scan_events) AS total_scan_events;

create or replace view public.admin_guest_activity_summary as
 SELECT guest_id,
    nickname,
    created_at AS guest_created_at,
    ( SELECT count(*) AS count
           FROM guest_unlocks u
          WHERE (u.guest_id = gp.guest_id)) AS unlock_count,
    ( SELECT max(u.unlocked_at) AS max
           FROM guest_unlocks u
          WHERE (u.guest_id = gp.guest_id)) AS last_unlock_at,
    ( SELECT count(*) AS count
           FROM guest_badges bd
          WHERE (bd.guest_id = gp.guest_id)) AS badge_count,
    ( SELECT count(*) AS count
           FROM guest_scan_events e
          WHERE (e.guest_id = gp.guest_id)) AS scan_event_count,
    ( SELECT max(e.created_at) AS max
           FROM guest_scan_events e
          WHERE (e.guest_id = gp.guest_id)) AS last_scan_at
   FROM guest_profiles gp
  ORDER BY ( SELECT max(u.unlocked_at) AS max
           FROM guest_unlocks u
          WHERE (u.guest_id = gp.guest_id)) DESC NULLS LAST;

create or replace view public.admin_missing_content_checks as
 SELECT 'active_tale_no_active_qr'::text AS check_type,
    t.slug AS reference_id,
    t.title AS detail
   FROM tales t
  WHERE ((t.is_active = true) AND (NOT (EXISTS ( SELECT 1
           FROM qr_codes q
          WHERE ((q.tale_slug = t.slug) AND (q.is_active = true))))))
UNION ALL
 SELECT 'active_qr_no_tale'::text AS check_type,
    q.code AS reference_id,
    COALESCE(q.tale_slug, '(null)'::text) AS detail
   FROM qr_codes q
  WHERE ((q.is_active = true) AND ((q.tale_slug IS NULL) OR (NOT (EXISTS ( SELECT 1
           FROM tales t
          WHERE (t.slug = q.tale_slug))))))
UNION ALL
 SELECT 'tale_missing_title'::text AS check_type,
    t.slug AS reference_id,
    '(no title)'::text AS detail
   FROM tales t
  WHERE ((t.is_active = true) AND ((t.title IS NULL) OR (t.title = ''::text)))
UNION ALL
 SELECT 'tale_linked_to_inactive_beer'::text AS check_type,
    t.slug AS reference_id,
    b.name AS detail
   FROM (tales t
     JOIN beers b ON ((b.id = t.beer_id)))
  WHERE ((t.is_active = true) AND (b.is_active = false))
UNION ALL
 SELECT 'beer_missing_name'::text AS check_type,
    COALESCE((b.id)::text, '(no id)'::text) AS reference_id,
    '(no name)'::text AS detail
   FROM beers b
  WHERE ((b.is_active = true) AND ((b.name IS NULL) OR (b.name = ''::text)))
UNION ALL
 SELECT 'expired_qr_still_active'::text AS check_type,
    q.code AS reference_id,
    (q.valid_until)::text AS detail
   FROM qr_codes q
  WHERE ((q.is_active = true) AND (q.valid_until IS NOT NULL) AND (q.valid_until < now()))
  ORDER BY 1, 2;

create or replace view public.admin_qr_code_status as
 SELECT id,
    code,
    tale_slug,
    campaign_key,
    batch_key,
    is_active,
    valid_from,
    valid_until,
    max_uses,
    created_at,
    ( SELECT count(*) AS count
           FROM guest_scan_events e
          WHERE (e.code_value = q.code)) AS scan_count,
    ( SELECT count(*) AS count
           FROM guest_unlocks u
          WHERE (u.qr_code = q.code)) AS unlock_count,
        CASE
            WHEN (is_active = false) THEN 'inactive'::text
            WHEN ((valid_until IS NOT NULL) AND (valid_until < now())) THEN 'expired'::text
            WHEN ((valid_from IS NOT NULL) AND (valid_from > now())) THEN 'not_yet_valid'::text
            WHEN (tale_slug IS NULL) THEN 'active_no_tale'::text
            ELSE 'active_ready'::text
        END AS status_label
   FROM qr_codes q
  ORDER BY is_active DESC, created_at DESC;

create or replace view public.admin_tales_status as
 SELECT t.id AS tale_id,
    t.slug AS tale_slug,
    t.title AS tale_title,
    t.is_active,
    t.sort_order,
    t.year,
    b.name AS beer_name,
    b.style AS beer_style,
    b.abv AS beer_abv,
    b.is_active AS beer_is_active,
    ( SELECT count(*) AS count
           FROM qr_codes q
          WHERE (q.tale_slug = t.slug)) AS total_qr_codes,
    ( SELECT count(*) AS count
           FROM qr_codes q
          WHERE ((q.tale_slug = t.slug) AND (q.is_active = true))) AS active_qr_codes,
    ( SELECT count(*) AS count
           FROM guest_unlocks u
          WHERE (u.tale_slug = t.slug)) AS unlock_count
   FROM (tales t
     LEFT JOIN beers b ON ((b.id = t.beer_id)))
  ORDER BY t.sort_order, t.slug;

create or replace view public.badge_events with (security_invoker = true) as
 SELECT gb.id,
    gb.earned_at AS created_at,
    gb.guest_id,
    gb.tale_slug,
    gb.badge_key
   FROM guest_badges gb
UNION ALL
 SELECT ub.id,
    ub.earned_at AS created_at,
    (ub.guest_id)::text AS guest_id,
    t.slug AS tale_slug,
    ub.badge_type AS badge_key
   FROM (user_badges ub
     LEFT JOIN tales t ON ((t.id = ub.tale_id)));

create or replace view public.food with (security_invoker = true) as
 SELECT id,
    name,
    category,
    is_active,
    updated_at
   FROM food_items;

create or replace view public.game_events with (security_invoker = true) as
 SELECT NULL::uuid AS id,
    NULL::timestamp with time zone AS created_at,
    NULL::text AS guest_id,
    NULL::text AS tale_slug,
    NULL::text AS phase
  WHERE false;

create or replace view public.unlock_events with (security_invoker = true) as
 SELECT gu.id,
    gu.unlocked_at AS created_at,
    gu.guest_id,
    gu.tale_slug,
    gu.source
   FROM guest_unlocks gu
UNION ALL
 SELECT utu.id,
    utu.unlocked_at AS created_at,
    (utu.guest_id)::text AS guest_id,
    t.slug AS tale_slug,
    NULL::text AS source
   FROM (user_tale_unlocks utu
     LEFT JOIN tales t ON ((t.id = utu.tale_id)));

-- ---------- functions / RPCs (verbatim production definitions) ----------
CREATE OR REPLACE FUNCTION public.fn_admin_archive_beer(p_actor uuid, p_email text, p_slug text)
 RETURNS beers
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now     timestamptz := now();
  v_before  public.beers;
  v_after   public.beers;
begin
  select * into v_before
    from public.beers
   where slug = p_slug
   for update;

  if v_before.id is null then
    raise exception 'beer slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  -- Idempotent UPDATE. If already archived, sets the same values
  -- but bumps updated_at to record the (re-)archive event.
  update public.beers
     set is_active  = false,
         status     = 'draft',
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'beer.archive',
    'beers',
    p_slug,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_archive_food(p_actor uuid, p_email text, p_slug text)
 RETURNS food_items
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now     timestamptz := now();
  v_before  public.food_items;
  v_after   public.food_items;
begin
  select * into v_before
    from public.food_items
   where slug = p_slug
   for update;

  if v_before.id is null then
    raise exception 'food_items slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  update public.food_items
     set is_active  = false,
         status     = 'draft',
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'food.archive',
    'food_items',
    p_slug,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_archive_tale(p_actor uuid, p_email text, p_slug text)
 RETURNS tales
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now     timestamptz := now();
  v_before  public.tales;
  v_after   public.tales;
begin
  select * into v_before
    from public.tales
   where slug = p_slug
   for update;

  if v_before.slug is null then
    raise exception 'tale slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  -- Idempotent UPDATE. If already archived, sets the same values
  -- but bumps updated_at to record the (re-)archive event.
  update public.tales
     set is_active  = false,
         status     = 'draft',
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'tale.archive',
    'tales',
    p_slug,
    jsonb_build_object(
      'before', to_jsonb(v_before),
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_assert_media_storage_path_safe(p_scope text, p_asset_id uuid, p_path text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_seg1 text;
  v_seg2 text;
  v_seg3 text;
  v_seg4 text;
begin
  if p_path is null or length(trim(p_path)) = 0 then
    raise exception '%: asset % has blank storage_path', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if p_path <> trim(p_path) then
    raise exception '%: asset % storage_path has surrounding whitespace', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if p_path like '/%' then
    raise exception '%: asset % storage_path has leading slash', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if p_path like '%/' then
    raise exception '%: asset % storage_path has trailing slash', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if position('..' in p_path) > 0 then
    raise exception '%: asset % storage_path contains "..".', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if position(E'\\' in p_path) > 0 then
    raise exception '%: asset % storage_path contains backslash', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if position('?' in p_path) > 0 or position('#' in p_path) > 0 then
    raise exception '%: asset % storage_path contains query or fragment characters', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if position('://' in p_path) > 0 then
    raise exception '%: asset % storage_path looks like an absolute URL', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if position('//' in p_path) > 0 then
    raise exception '%: asset % storage_path contains empty segment', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  v_seg1 := split_part(p_path, '/', 1);
  v_seg2 := split_part(p_path, '/', 2);
  v_seg3 := split_part(p_path, '/', 3);
  v_seg4 := split_part(p_path, '/', 4);
  if v_seg1 not in ('tales', 'beers', 'food') then
    raise exception '%: asset % storage_path does not start with "tales/", "beers/", or "food/"', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if v_seg2 !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception '%: asset % storage_path second segment is not a uuid', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if length(coalesce(v_seg3, '')) = 0 then
    raise exception '%: asset % storage_path third segment is blank', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if length(coalesce(v_seg4, '')) = 0 then
    raise exception '%: asset % storage_path filename segment is blank', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if v_seg4 !~ '^[a-z0-9][a-z0-9.-]*\.(jpg|jpeg|png|webp|avif)$' then
    raise exception '%: asset % storage_path filename does not match the safe filename pattern', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
  if split_part(p_path, '/', 5) <> '' then
    raise exception '%: asset % storage_path has more than four segments', p_scope, p_asset_id
      using errcode = 'P0001';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_assign_beer_media(p_actor uuid, p_email text, p_slug text, p_asset_id uuid, p_public_url text)
 RETURNS beers
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_asset public.media_assets;
  v_before public.beers;
  v_after public.beers;
  v_previous_url text;
begin
  if p_actor is null or coalesce(trim(p_email),'')='' or coalesce(trim(p_slug),'')='' or p_asset_id is null or coalesce(trim(p_public_url),'')='' then raise exception 'invalid beer media assignment input' using errcode='P0002'; end if;
  select * into v_asset from public.media_assets where id=p_asset_id;
  if not found then raise exception 'media asset not found' using errcode='P0001'; end if;
  if v_asset.bucket<>'media' then raise exception 'media asset bucket is not media' using errcode='P0002'; end if;
  if position('/media/' in p_public_url)=0 or p_public_url not like ('%/media/'||v_asset.storage_path) then raise exception 'public URL does not match storage path' using errcode='P0002'; end if;
  select * into v_before from public.beers where slug=p_slug for update;
  if not found then raise exception 'beer not found' using errcode='P0001'; end if;
  if v_asset.storage_path not like ('beers/'||v_before.id::text||'/%') then raise exception 'asset does not belong to beer' using errcode='P0002'; end if;
  v_previous_url:=v_before.can_image_url;
  update public.beers set can_image_url=p_public_url, updated_at=now() where id=v_before.id returning * into v_after;
  insert into public.admin_actions(actor_id,actor_email,action,target_kind,target_key,payload)
  values(p_actor,p_email,'media.assign','beers',p_slug,
    jsonb_build_object('asset_id',v_asset.id,'beer_id',v_after.id,'beer_slug',p_slug,'field','can_image_url','public_url',p_public_url,'previous_url',v_previous_url,'bucket',v_asset.bucket,'storage_path',v_asset.storage_path,'mime_type',v_asset.mime_type,'byte_size',v_asset.byte_size));
  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_assign_food_media(p_actor uuid, p_email text, p_slug text, p_asset_id uuid, p_public_url text)
 RETURNS food_items
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_asset        public.media_assets;
  v_before       public.food_items;
  v_after        public.food_items;
  v_previous_url text;
begin
  if p_actor is null then
    raise exception 'fn_admin_assign_food_media: p_actor is required';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'fn_admin_assign_food_media: p_email is required';
  end if;
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'fn_admin_assign_food_media: p_slug is required'
      using errcode = 'P0002';
  end if;
  if p_asset_id is null then
    raise exception 'fn_admin_assign_food_media: p_asset_id is required'
      using errcode = 'P0002';
  end if;
  if coalesce(trim(p_public_url), '') = '' then
    raise exception 'fn_admin_assign_food_media: p_public_url is required'
      using errcode = 'P0002';
  end if;

  select *
    into v_asset
    from public.media_assets
   where id = p_asset_id;

  if not found then
    raise exception 'fn_admin_assign_food_media: media asset % not found', p_asset_id
      using errcode = 'P0001';
  end if;

  if v_asset.bucket <> 'media' then
    raise exception 'fn_admin_assign_food_media: media asset % is in bucket "%", expected "media"', p_asset_id, v_asset.bucket
      using errcode = 'P0002';
  end if;

  if position('/media/' in p_public_url) = 0 then
    raise exception 'fn_admin_assign_food_media: p_public_url does not contain the media bucket segment'
      using errcode = 'P0002';
  end if;
  if p_public_url not like ('%/media/' || v_asset.storage_path) then
    raise exception 'fn_admin_assign_food_media: p_public_url does not match the asset storage_path'
      using errcode = 'P0002';
  end if;

  -- Lock the target food row.
  select *
    into v_before
    from public.food_items
   where slug = p_slug
     for update;

  if not found then
    raise exception 'fn_admin_assign_food_media: food % not found', p_slug
      using errcode = 'P0001';
  end if;

  -- Food-asset path-membership check. The N.5 convention is:
  --   food/<food-uuid>/<asset-token>/<filename>
  -- Compare against the LOCKED food row's id (v_before.id) so a
  -- forged input cannot bypass the binding.
  if v_asset.storage_path not like ('food/' || v_before.id::text || '/%') then
    raise exception 'fn_admin_assign_food_media: asset % does not belong to food %', p_asset_id, v_before.id
      using errcode = 'P0002';
  end if;

  v_previous_url := v_before.image_url;

  update public.food_items
     set image_url  = p_public_url,
         updated_at = now()
   where id = v_before.id
returning * into v_after;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'media.assign',
    'food_items',
    p_slug,
    jsonb_build_object(
      'asset_id',     v_asset.id,
      'food_id',      v_after.id,
      'food_slug',    p_slug,
      'field',        'image_url',
      'public_url',   p_public_url,
      'previous_url', v_previous_url,
      'bucket',       v_asset.bucket,
      'storage_path', v_asset.storage_path,
      'mime_type',    v_asset.mime_type,
      'byte_size',    v_asset.byte_size
    )
  );

  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_assign_tale_media(p_actor uuid, p_email text, p_slug text, p_field text, p_asset_id uuid, p_public_url text)
 RETURNS tales
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_asset         public.media_assets;
  v_before        public.tales;
  v_after         public.tales;
  v_previous_url  text;
begin
  if p_actor is null then
    raise exception 'fn_admin_assign_tale_media: p_actor is required';
  end if;

  if coalesce(trim(p_email), '') = '' then
    raise exception 'fn_admin_assign_tale_media: p_email is required';
  end if;

  if coalesce(trim(p_slug), '') = '' then
    raise exception 'fn_admin_assign_tale_media: p_slug is required'
      using errcode = 'P0002';
  end if;

  if p_field not in ('intro_asset_url', 'stamp_image_url') then
    raise exception 'fn_admin_assign_tale_media: p_field must be intro_asset_url or stamp_image_url, got %', p_field
      using errcode = 'P0002';
  end if;

  if p_asset_id is null then
    raise exception 'fn_admin_assign_tale_media: p_asset_id is required'
      using errcode = 'P0002';
  end if;

  if coalesce(trim(p_public_url), '') = '' then
    raise exception 'fn_admin_assign_tale_media: p_public_url is required'
      using errcode = 'P0002';
  end if;

  select *
    into v_asset
    from public.media_assets
   where id = p_asset_id;

  if not found then
    raise exception 'fn_admin_assign_tale_media: media asset % not found', p_asset_id
      using errcode = 'P0001';
  end if;

  if v_asset.bucket <> 'media' then
    raise exception 'fn_admin_assign_tale_media: media asset % is in bucket "%", expected "media"', p_asset_id, v_asset.bucket
      using errcode = 'P0002';
  end if;

  if position('/media/' in p_public_url) = 0 then
    raise exception 'fn_admin_assign_tale_media: p_public_url does not contain the media bucket segment'
      using errcode = 'P0002';
  end if;

  if p_public_url not like ('%/media/' || v_asset.storage_path) then
    raise exception 'fn_admin_assign_tale_media: p_public_url does not match the asset storage_path'
      using errcode = 'P0002';
  end if;

  select *
    into v_before
    from public.tales
   where slug = p_slug
     for update;

  if not found then
    raise exception 'fn_admin_assign_tale_media: tale % not found', p_slug
      using errcode = 'P0001';
  end if;

  if v_asset.storage_path not like ('tales/' || v_before.id::text || '/%') then
    raise exception
      'fn_admin_assign_tale_media: asset % does not belong to tale %', p_asset_id, v_before.id
      using errcode = 'P0002';
  end if;

  if p_field = 'intro_asset_url' then
    v_previous_url := v_before.intro_asset_url;
    update public.tales
       set intro_asset_url = p_public_url,
           updated_at      = now()
     where id = v_before.id
   returning * into v_after;
  else
    v_previous_url := v_before.stamp_image_url;
    update public.tales
       set stamp_image_url = p_public_url,
           updated_at      = now()
     where id = v_before.id
   returning * into v_after;
  end if;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'media.assign',
    'tales',
    p_slug,
    jsonb_build_object(
      'asset_id',     v_asset.id,
      'tale_id',      v_after.id,
      'tale_slug',    p_slug,
      'field',        p_field,
      'public_url',   p_public_url,
      'previous_url', v_previous_url,
      'bucket',       v_asset.bucket,
      'storage_path', v_asset.storage_path,
      'mime_type',    v_asset.mime_type,
      'byte_size',    v_asset.byte_size
    )
  );

  return v_after;
end
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_count_admins()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'auth'
AS $function$
  select count(*)::integer
    from auth.users
   where raw_app_meta_data->>'role' = 'admin'
     and (banned_until is null or banned_until <= now());
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_create_qr(p_actor uuid, p_email text, p_tale_slug text, p_valid_from timestamp with time zone, p_valid_until timestamp with time zone, p_campaign_key text, p_batch_key text)
 RETURNS TABLE(qr_id uuid, code text, tale_slug text, valid_from timestamp with time zone, valid_until timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_tale_id    uuid;
  v_tale_slug  text;
  v_campaign   text := nullif(btrim(coalesce(p_campaign_key, '')), '');
  v_batch      text := nullif(btrim(coalesce(p_batch_key, '')), '');
  v_code       text;
  v_qr_id      uuid;
  v_attempt    int := 0;
begin
  -- Tale must exist and be publicly visible; the canonical slug from
  -- the tales row (not the caller's input) is what gets stored and
  -- returned.
  select t.id, t.slug into v_tale_id, v_tale_slug
    from public.tales t
   where t.slug = btrim(coalesce(p_tale_slug, ''))
     and t.status = 'published'
     and t.is_active = true;
  if v_tale_id is null then
    raise exception 'tale is not published/active or does not exist'
      using errcode = 'P0001';
  end if;

  if p_valid_from is not null
     and p_valid_until is not null
     and p_valid_from >= p_valid_until then
    raise exception 'valid_from must be earlier than valid_until'
      using errcode = 'P0005';
  end if;

  -- Mint with a bounded retry against the UNIQUE constraint. 160-bit
  -- collisions are astronomically unlikely; the loop is formality.
  loop
    v_attempt := v_attempt + 1;
    v_code := 'tsqr_' || encode(gen_random_bytes(20), 'hex');
    begin
      insert into public.qr_codes
        (code, tale_id, tale_slug, status, is_active,
         valid_from, valid_until, campaign_key, batch_key, max_uses)
      values
        (v_code, v_tale_id, v_tale_slug, 'active', true,
         p_valid_from, p_valid_until, v_campaign, v_batch, null)
      returning id into v_qr_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'could not mint a unique code after % attempts', v_attempt
          using errcode = 'P0006';
      end if;
    end;
  end loop;

  -- Audit in the SAME transaction. NEVER include the raw code.
  insert into public.admin_actions
    (actor_id, actor_email, action, target_kind, target_key, payload)
  values
    (p_actor, p_email, 'qr.create', 'qr_codes', v_qr_id::text,
     jsonb_build_object(
       'qr_id',        v_qr_id,
       'tale_id',      v_tale_id,
       'tale_slug',    v_tale_slug,
       'status',       'active',
       'valid_from',   p_valid_from,
       'valid_until',  p_valid_until,
       'campaign_key', v_campaign,
       'batch_key',    v_batch
     ));

  return query select v_qr_id, v_code, v_tale_slug, p_valid_from, p_valid_until;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_finalize_media_delete(p_actor uuid, p_email text, p_asset_id uuid, p_storage_path text, p_public_url_prefix text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_row    public.media_assets;
  v_url    text;
  v_count  integer;
begin
  if p_actor is null then
    raise exception 'fn_admin_finalize_media_delete: p_actor is required';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'fn_admin_finalize_media_delete: p_email is required';
  end if;
  if p_asset_id is null then
    raise exception 'fn_admin_finalize_media_delete: p_asset_id is required'
      using errcode = 'P0002';
  end if;
  if coalesce(trim(p_storage_path), '') = '' then
    raise exception 'fn_admin_finalize_media_delete: p_storage_path is required'
      using errcode = 'P0002';
  end if;
  if coalesce(trim(p_public_url_prefix), '') = '' then
    raise exception 'fn_admin_finalize_media_delete: p_public_url_prefix is required'
      using errcode = 'P0002';
  end if;
  if right(p_public_url_prefix, 1) <> '/' then
    raise exception 'fn_admin_finalize_media_delete: p_public_url_prefix must end with "/"'
      using errcode = 'P0002';
  end if;
  if p_public_url_prefix not like '%/media/' then
    raise exception 'fn_admin_finalize_media_delete: p_public_url_prefix must end with "/media/"'
      using errcode = 'P0002';
  end if;

  select *
    into v_row
    from public.media_assets
   where id = p_asset_id
     for update;

  if not found then
    raise exception 'fn_admin_finalize_media_delete: asset % not found', p_asset_id
      using errcode = 'P0001';
  end if;

  if v_row.bucket <> 'media' then
    raise exception 'fn_admin_finalize_media_delete: asset % bucket "%", expected "media"', p_asset_id, v_row.bucket
      using errcode = 'P0001';
  end if;

  if v_row.storage_path <> p_storage_path then
    raise exception 'fn_admin_finalize_media_delete: asset % storage_path changed since prepare', p_asset_id
      using errcode = 'P0005';
  end if;

  perform public.fn_admin_assert_media_storage_path_safe(
    'fn_admin_finalize_media_delete', p_asset_id, v_row.storage_path
  );

  if v_row.created_at is null then
    raise exception 'fn_admin_finalize_media_delete: asset % has null created_at', p_asset_id
      using errcode = 'P0001';
  end if;
  if v_row.created_at > now() - interval '24 hours' then
    raise exception 'fn_admin_finalize_media_delete: asset % is younger than 24 hours', p_asset_id
      using errcode = 'P0003';
  end if;

  v_url := p_public_url_prefix || v_row.storage_path;
  if exists (
    select 1
      from public.tales t
     where t.intro_asset_url = v_url
        or t.stamp_image_url = v_url
  ) or exists (
    select 1
      from public.beers b
     where b.can_image_url = v_url
  ) or exists (
    select 1
      from public.food_items f
     where f.image_url = v_url
  ) then
    raise exception 'fn_admin_finalize_media_delete: asset % is currently referenced', p_asset_id
      using errcode = 'P0004';
  end if;

  delete from public.media_assets
   where id = v_row.id;

  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'fn_admin_finalize_media_delete: expected 1 row deleted, got %', v_count
      using errcode = 'P0001';
  end if;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'media.delete',
    'media_assets',
    v_row.id::text,
    jsonb_build_object(
      'asset_id',          v_row.id,
      'bucket',            v_row.bucket,
      'storage_path',      v_row.storage_path,
      'public_url',        v_url,
      'mime_type',         v_row.mime_type,
      'byte_size',         v_row.byte_size,
      'original_filename', v_row.original_filename,
      'created_at',        v_row.created_at
    )
  );

  return v_row.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_get_active_qr_artwork_source(p_actor uuid, p_email text, p_qr_id uuid, p_reason text)
 RETURNS TABLE(qr_id uuid, code text, tale_slug text, valid_from timestamp with time zone, valid_until timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row        public.qr_codes;
  v_tale_id    uuid;
  v_tale_slug  text;
begin
  if v_reason is null then
    raise exception 'a download reason is required'
      using errcode = 'P0004';
  end if;

  -- Plain read — this function never mutates the row, so no lock is
  -- taken. A rotate/revoke racing this read is harmless: the returned
  -- code would simply stop validating, exactly as if it had been
  -- rotated a moment after the download.
  select q.* into v_row
    from public.qr_codes q
   where q.id = p_qr_id;
  if v_row.id is null then
    raise exception 'QR code not found'
      using errcode = 'P0002';
  end if;

  -- CURRENT-usability gates: identical posture to the public
  -- validator (validate-qr). Anything not presently scannable cannot
  -- be re-read — including the fail-closed max_uses rule.
  if v_row.status <> 'active' or v_row.is_active is distinct from true then
    raise exception 'only currently active QR codes can be re-downloaded'
      using errcode = 'P0003';
  end if;
  if v_row.valid_from is not null and v_row.valid_from > now() then
    raise exception 'only currently active QR codes can be re-downloaded'
      using errcode = 'P0003';
  end if;
  if v_row.valid_until is not null and v_row.valid_until <= now() then
    raise exception 'only currently active QR codes can be re-downloaded'
      using errcode = 'P0003';
  end if;
  if v_row.max_uses is not null then
    raise exception 'only currently active QR codes can be re-downloaded'
      using errcode = 'P0003';
  end if;

  -- Tale resolution, slug-first with legacy tale_id fallback
  -- (mirrors fn_admin_rotate_qr). Needed for the audit payload and
  -- the code-free artwork filename.
  if v_row.tale_slug is not null and btrim(v_row.tale_slug) <> '' then
    select t.id, t.slug into v_tale_id, v_tale_slug
      from public.tales t
     where t.slug = btrim(v_row.tale_slug);
  elsif v_row.tale_id is not null then
    select t.id, t.slug into v_tale_id, v_tale_slug
      from public.tales t
     where t.id = v_row.tale_id;
  end if;
  if v_tale_id is null then
    raise exception 'QR code has no resolvable tale association'
      using errcode = 'P0007';
  end if;

  -- qr.download audit row, same transaction as the read. NEVER the
  -- raw code.
  insert into public.admin_actions
    (actor_id, actor_email, action, target_kind, target_key, payload)
  values
    (p_actor, p_email, 'qr.download', 'qr_codes', v_row.id::text,
     jsonb_build_object(
       'qr_id',        v_row.id,
       'tale_id',      v_tale_id,
       'tale_slug',    v_tale_slug,
       'status',       v_row.status,
       'valid_from',   v_row.valid_from,
       'valid_until',  v_row.valid_until,
       'campaign_key', v_row.campaign_key,
       'batch_key',    v_row.batch_key,
       'reason',       v_reason
     ));

  return query select v_row.id, v_row.code, v_tale_slug,
                      v_row.valid_from, v_row.valid_until;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_list_orphan_media(p_public_url_prefix text)
 RETURNS TABLE(asset_id uuid, bucket text, storage_path text, public_url text, mime_type text, byte_size bigint, width integer, height integer, original_filename text, alt_text text, created_at timestamp with time zone, age_seconds bigint, is_referenced boolean, eligible_after timestamp with time zone, cleanup_eligible boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
begin
  if coalesce(trim(p_public_url_prefix), '') = '' then
    raise exception 'fn_admin_list_orphan_media: p_public_url_prefix is required';
  end if;
  if right(p_public_url_prefix, 1) <> '/' then
    raise exception 'fn_admin_list_orphan_media: p_public_url_prefix must end with "/"';
  end if;

  return query
  with referenced_urls as (
    select intro_asset_url as url
      from public.tales
     where intro_asset_url is not null
       and length(trim(intro_asset_url)) > 0
    union
    select stamp_image_url
      from public.tales
     where stamp_image_url is not null
       and length(trim(stamp_image_url)) > 0
    union
    select can_image_url
      from public.beers
     where can_image_url is not null
       and length(trim(can_image_url)) > 0
    union
    select image_url
      from public.food_items
     where image_url is not null
       and length(trim(image_url)) > 0
  )
  select
    ma.id                                                       as asset_id,
    ma.bucket                                                   as bucket,
    ma.storage_path                                             as storage_path,
    (p_public_url_prefix || ma.storage_path)                    as public_url,
    ma.mime_type                                                as mime_type,
    ma.byte_size                                                as byte_size,
    ma.width                                                    as width,
    ma.height                                                   as height,
    ma.original_filename                                        as original_filename,
    ma.alt_text                                                 as alt_text,
    ma.created_at                                               as created_at,
    greatest(0, extract(epoch from (v_now - ma.created_at)))::bigint as age_seconds,
    exists (
      select 1
        from referenced_urls r
       where r.url = (p_public_url_prefix || ma.storage_path)
    )                                                           as is_referenced,
    (ma.created_at + interval '24 hours')                       as eligible_after,
    (
      not exists (
        select 1
          from referenced_urls r
         where r.url = (p_public_url_prefix || ma.storage_path)
      )
      and ma.created_at <= v_now - interval '24 hours'
    )                                                           as cleanup_eligible
  from public.media_assets ma
  where ma.bucket = 'media'
    and ma.storage_path is not null
    and length(trim(ma.storage_path)) > 0
  order by ma.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_demote(p_actor uuid, p_email text, p_target_user_id uuid, p_target_email text, p_before_role text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'admin.demote',
    'auth.users',
    p_target_user_id::text,
    jsonb_build_object(
      'user_id', p_target_user_id,
      'email', p_target_email,
      'before_role', p_before_role,
      'after_role', null
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_disable(p_actor uuid, p_email text, p_target_user_id uuid, p_target_email text, p_reason text, p_ban_duration text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'admin.disable',
    'auth.users',
    p_target_user_id::text,
    jsonb_build_object(
      'user_id', p_target_user_id,
      'email', p_target_email,
      'reason', p_reason,
      'ban_duration', p_ban_duration
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_enable(p_actor uuid, p_email text, p_target_user_id uuid, p_target_email text, p_ban_duration_before text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'admin.enable',
    'auth.users',
    p_target_user_id::text,
    jsonb_build_object(
      'user_id', p_target_user_id,
      'email', p_target_email,
      'ban_duration_before', p_ban_duration_before
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_invite(p_actor uuid, p_email text, p_target_email text, p_invited_role text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'admin.invite',
    'auth.users',
    p_target_email,
    jsonb_build_object(
      'email', p_target_email,
      'invited_role', p_invited_role
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_media_delete_failed(p_actor uuid, p_email text, p_asset_id uuid, p_storage_path text, p_phase text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if p_actor is null or coalesce(trim(p_email),'')='' or p_asset_id is null then
    raise exception 'invalid failed-delete audit input';
  end if;
  if p_phase not in ('preparation','storage','metadata') then
    raise exception 'invalid failed-delete phase';
  end if;

  insert into public.admin_actions(actor_id,actor_email,action,target_kind,target_key,payload)
  values (p_actor,p_email,'media.delete.failed','media_assets',p_asset_id::text,
    jsonb_build_object('asset_id',p_asset_id,'storage_path',p_storage_path,'phase',p_phase,'reason',left(coalesce(p_reason,''),240)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_mfa_reset(p_actor uuid, p_email text, p_target_user_id uuid, p_target_email text, p_deleted_factor_count integer, p_deleted_verified_factor_count integer, p_outcome text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_actor is null then
    raise exception 'fn_admin_log_mfa_reset: p_actor is required';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'fn_admin_log_mfa_reset: p_email is required';
  end if;
  if p_target_user_id is null then
    raise exception 'fn_admin_log_mfa_reset: p_target_user_id is required';
  end if;
  if coalesce(trim(p_target_email), '') = '' then
    raise exception 'fn_admin_log_mfa_reset: p_target_email is required';
  end if;
  if p_outcome not in ('reset', 'no_factors') then
    raise exception 'fn_admin_log_mfa_reset: p_outcome must be reset or no_factors, got %', p_outcome;
  end if;
  -- Counts must be sane non-negative integers. Defensive: the app
  -- always passes >= 0, but reject nonsense so a bug cannot write a
  -- misleading audit row.
  if coalesce(p_deleted_factor_count, -1) < 0 then
    raise exception 'fn_admin_log_mfa_reset: p_deleted_factor_count must be >= 0';
  end if;
  if coalesce(p_deleted_verified_factor_count, -1) < 0 then
    raise exception 'fn_admin_log_mfa_reset: p_deleted_verified_factor_count must be >= 0';
  end if;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'admin.mfa_reset',
    'auth.users',
    p_target_user_id::text,
    jsonb_build_object(
      'user_id',                       p_target_user_id,
      'email',                         p_target_email,
      'outcome',                       p_outcome,
      'deleted_factor_count',          p_deleted_factor_count,
      'deleted_verified_factor_count', p_deleted_verified_factor_count,
      -- Explicit, honest posture markers mirroring the O.5A runbook
      -- language: session invalidation is a side effect of deleting a
      -- verified factor, not a general revoke-by-user-id capability.
      'mfa_factor_removed',            true,
      'session_invalidated_if_verified', (p_deleted_verified_factor_count > 0)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_promote(p_actor uuid, p_email text, p_target_user_id uuid, p_target_email text, p_before_role text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'admin.promote',
    'auth.users',
    p_target_user_id::text,
    jsonb_build_object(
      'user_id', p_target_user_id,
      'email', p_target_email,
      'before_role', p_before_role,
      'after_role', 'admin'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_log_tale_preview(p_actor uuid, p_email text, p_tale_id uuid, p_tale_slug text, p_expires_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if p_tale_id is null then
    raise exception 'tale id is required'
      using errcode = 'P0002';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'a future expiry is required'
      using errcode = 'P0005';
  end if;

  insert into public.admin_actions
    (actor_id, actor_email, action, target_kind, target_key, payload)
  values
    (p_actor, p_email, 'tale.preview.create', 'tales', p_tale_id::text,
     jsonb_build_object(
       'tale_id',    p_tale_id,
       'tale_slug',  p_tale_slug,
       'expires_at', p_expires_at,
       'mode',       'token'
     ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_prepare_media_delete(p_actor uuid, p_email text, p_asset_id uuid, p_public_url_prefix text)
 RETURNS TABLE(asset_id uuid, bucket text, storage_path text, public_url text, original_filename text, mime_type text, byte_size bigint, created_at timestamp with time zone, is_referenced boolean, cleanup_eligible boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_row        public.media_assets;
  v_path       text;
  v_now        timestamptz := now();
  v_url        text;
  v_referenced boolean;
begin
  if p_actor is null then
    raise exception 'fn_admin_prepare_media_delete: p_actor is required';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'fn_admin_prepare_media_delete: p_email is required';
  end if;
  if p_asset_id is null then
    raise exception 'fn_admin_prepare_media_delete: p_asset_id is required'
      using errcode = 'P0002';
  end if;
  if coalesce(trim(p_public_url_prefix), '') = '' then
    raise exception 'fn_admin_prepare_media_delete: p_public_url_prefix is required'
      using errcode = 'P0002';
  end if;
  if right(p_public_url_prefix, 1) <> '/' then
    raise exception 'fn_admin_prepare_media_delete: p_public_url_prefix must end with "/"'
      using errcode = 'P0002';
  end if;
  if p_public_url_prefix not like '%/media/' then
    raise exception 'fn_admin_prepare_media_delete: p_public_url_prefix must end with "/media/"'
      using errcode = 'P0002';
  end if;

  select *
    into v_row
    from public.media_assets
   where id = p_asset_id
     for update;

  if not found then
    raise exception 'fn_admin_prepare_media_delete: asset % not found', p_asset_id
      using errcode = 'P0001';
  end if;

  if v_row.bucket <> 'media' then
    raise exception 'fn_admin_prepare_media_delete: asset % bucket "%", expected "media"', p_asset_id, v_row.bucket
      using errcode = 'P0001';
  end if;

  v_path := v_row.storage_path;
  perform public.fn_admin_assert_media_storage_path_safe(
    'fn_admin_prepare_media_delete', p_asset_id, v_path
  );

  if v_row.created_at is null then
    raise exception 'fn_admin_prepare_media_delete: asset % has null created_at', p_asset_id
      using errcode = 'P0001';
  end if;
  if v_row.created_at > v_now - interval '24 hours' then
    raise exception 'fn_admin_prepare_media_delete: asset % is younger than 24 hours', p_asset_id
      using errcode = 'P0003';
  end if;

  v_url := p_public_url_prefix || v_path;

  v_referenced := exists (
    select 1
      from public.tales t
     where t.intro_asset_url = v_url
        or t.stamp_image_url = v_url
  ) or exists (
    select 1
      from public.beers b
     where b.can_image_url = v_url
  ) or exists (
    select 1
      from public.food_items f
     where f.image_url = v_url
  );
  if v_referenced then
    raise exception 'fn_admin_prepare_media_delete: asset % is currently referenced', p_asset_id
      using errcode = 'P0004';
  end if;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'media.delete.started',
    'media_assets',
    v_row.id::text,
    jsonb_build_object(
      'asset_id',          v_row.id,
      'bucket',            v_row.bucket,
      'storage_path',      v_row.storage_path,
      'public_url',        v_url,
      'mime_type',         v_row.mime_type,
      'byte_size',         v_row.byte_size,
      'original_filename', v_row.original_filename,
      'created_at',        v_row.created_at
    )
  );

  return query
    select
      v_row.id,
      v_row.bucket,
      v_row.storage_path,
      v_url,
      v_row.original_filename,
      v_row.mime_type,
      v_row.byte_size,
      v_row.created_at,
      false,
      true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_revoke_qr(p_actor uuid, p_email text, p_qr_id uuid, p_reason text)
 RETURNS TABLE(qr_id uuid, tale_slug text, prior_status text, new_status text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old        public.qr_codes;
  v_tale_id    uuid;
  v_tale_slug  text;
begin
  if v_reason is null then
    raise exception 'a revocation reason is required'
      using errcode = 'P0004';
  end if;

  select q.* into v_old
    from public.qr_codes q
   where q.id = p_qr_id
     for update;
  if v_old.id is null then
    raise exception 'QR code not found'
      using errcode = 'P0002';
  end if;
  if v_old.status <> 'active' or v_old.is_active is distinct from true then
    raise exception 'only active QR codes can be revoked'
      using errcode = 'P0003';
  end if;

  -- Best-effort tale resolution for the audit payload (revocation
  -- must succeed even for rows with a broken association).
  if v_old.tale_slug is not null and btrim(v_old.tale_slug) <> '' then
    select t.id, t.slug into v_tale_id, v_tale_slug
      from public.tales t
     where t.slug = btrim(v_old.tale_slug);
    v_tale_slug := coalesce(v_tale_slug, btrim(v_old.tale_slug));
  elsif v_old.tale_id is not null then
    select t.id, t.slug into v_tale_id, v_tale_slug
      from public.tales t
     where t.id = v_old.tale_id;
    v_tale_id := coalesce(v_tale_id, v_old.tale_id);
  end if;

  -- Terminal: status=revoked + is_active=false. The row is preserved
  -- forever (no DELETE path exists) and no function un-revokes it.
  update public.qr_codes q
     set status = 'revoked', is_active = false, updated_at = now()
   where q.id = v_old.id;

  insert into public.admin_actions
    (actor_id, actor_email, action, target_kind, target_key, payload)
  values
    (p_actor, p_email, 'qr.revoke', 'qr_codes', v_old.id::text,
     jsonb_build_object(
       'qr_id',        v_old.id,
       'tale_id',      v_tale_id,
       'tale_slug',    v_tale_slug,
       'prior_status', 'active',
       'new_status',   'revoked',
       'reason',       v_reason
     ));

  return query select v_old.id, v_tale_slug, 'active'::text, 'revoked'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_rotate_qr(p_actor uuid, p_email text, p_qr_id uuid, p_reason text)
 RETURNS TABLE(old_qr_id uuid, new_qr_id uuid, code text, tale_slug text, valid_from timestamp with time zone, valid_until timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old        public.qr_codes;
  v_tale_id    uuid;
  v_tale_slug  text;
  v_code       text;
  v_new_id     uuid;
  v_attempt    int := 0;
begin
  if v_reason is null then
    raise exception 'a rotation reason is required'
      using errcode = 'P0004';
  end if;

  -- Lock the target so concurrent rotate/revoke serialize.
  select q.* into v_old
    from public.qr_codes q
   where q.id = p_qr_id
     for update;
  if v_old.id is null then
    raise exception 'QR code not found'
      using errcode = 'P0002';
  end if;
  if v_old.status <> 'active' or v_old.is_active is distinct from true then
    raise exception 'only active QR codes can be rotated'
      using errcode = 'P0003';
  end if;

  -- Resolve the Tale association, normalizing the replacement to
  -- carry BOTH tale_slug and tale_id. Modern rows resolve by slug;
  -- legacy rows resolve by tale_id. The old row is NOT rewritten.
  -- Publication status is deliberately not re-checked here: rotating
  -- a code whose Tale is temporarily drafted mints an inert code
  -- (validate-qr fails closed on unpublished Tales) — safer than
  -- blocking the operator from killing a compromised code family.
  if v_old.tale_slug is not null and btrim(v_old.tale_slug) <> '' then
    select t.id, t.slug into v_tale_id, v_tale_slug
      from public.tales t
     where t.slug = btrim(v_old.tale_slug);
  elsif v_old.tale_id is not null then
    select t.id, t.slug into v_tale_id, v_tale_slug
      from public.tales t
     where t.id = v_old.tale_id;
  end if;
  if v_tale_id is null then
    raise exception 'QR code has no resolvable tale association — revoke it instead'
      using errcode = 'P0007';
  end if;

  -- 1. Terminal revoke of the old row (no dual-active window: both
  --    steps commit or neither does).
  update public.qr_codes q
     set status = 'revoked', is_active = false, updated_at = now()
   where q.id = v_old.id;

  -- 2. Mint the replacement, carrying window + campaign metadata.
  loop
    v_attempt := v_attempt + 1;
    v_code := 'tsqr_' || encode(gen_random_bytes(20), 'hex');
    begin
      insert into public.qr_codes
        (code, tale_id, tale_slug, status, is_active,
         valid_from, valid_until, campaign_key, batch_key, max_uses)
      values
        (v_code, v_tale_id, v_tale_slug, 'active', true,
         v_old.valid_from, v_old.valid_until,
         v_old.campaign_key, v_old.batch_key, null)
      returning id into v_new_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'could not mint a unique replacement code after % attempts', v_attempt
          using errcode = 'P0006';
      end if;
    end;
  end loop;

  -- One qr.rotate audit row carrying both sides. NEVER the raw code.
  -- P.14b key semantics: the old row transitions
  -- old_prior_status → old_resulting_status; the replacement row is
  -- created with replacement_status. (P.14a wrote the ambiguous
  -- old_status/new_status/new_qr_id keys; historical rows keep them.)
  insert into public.admin_actions
    (actor_id, actor_email, action, target_kind, target_key, payload)
  values
    (p_actor, p_email, 'qr.rotate', 'qr_codes', v_old.id::text,
     jsonb_build_object(
       'old_qr_id',            v_old.id,
       'replacement_qr_id',    v_new_id,
       'tale_id',              v_tale_id,
       'tale_slug',            v_tale_slug,
       'old_prior_status',     'active',
       'old_resulting_status', 'revoked',
       'replacement_status',   'active',
       'reason',               v_reason,
       'valid_from',           v_old.valid_from,
       'valid_until',          v_old.valid_until,
       'campaign_key',         v_old.campaign_key,
       'batch_key',            v_old.batch_key
     ));

  return query select v_old.id, v_new_id, v_code, v_tale_slug,
                      v_old.valid_from, v_old.valid_until;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_upsert_beer(p_actor uuid, p_email text, p_slug text, p_name text, p_category text, p_style text, p_abv numeric, p_ibu integer, p_short_description text, p_description text, p_can_image_url text, p_is_active boolean, p_status text, p_sort_order integer DEFAULT 0)
 RETURNS beers
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now     timestamptz := now();
  v_before  public.beers;
  v_after   public.beers;
  v_action  text;
begin
  select * into v_before
    from public.beers
   where slug = p_slug
   for update;

  insert into public.beers (
    slug, name, category, style, abv, ibu,
    short_description, description, can_image_url,
    is_active, status, sort_order, updated_at
  ) values (
    p_slug, p_name, p_category, p_style, p_abv, p_ibu,
    p_short_description, p_description, p_can_image_url,
    coalesce(p_is_active, true),
    coalesce(p_status, 'published'),
    coalesce(p_sort_order, 0),
    v_now
  )
  on conflict (slug) do update
     set name              = excluded.name,
         category          = excluded.category,
         style             = excluded.style,
         abv               = excluded.abv,
         ibu               = excluded.ibu,
         short_description = excluded.short_description,
         description       = excluded.description,
         can_image_url     = excluded.can_image_url,
         is_active         = excluded.is_active,
         status            = excluded.status,
         sort_order        = excluded.sort_order,
         updated_at        = v_now
  returning * into v_after;

  v_action := case when v_before.id is null then 'beer.create' else 'beer.update' end;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    v_action,
    'beers',
    p_slug,
    jsonb_build_object(
      'before', case when v_before.id is null then null else to_jsonb(v_before) end,
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_upsert_food(p_actor uuid, p_email text, p_slug text, p_name text, p_category text, p_description text, p_is_active boolean, p_status text, p_price_cents integer DEFAULT NULL::integer, p_sort_order integer DEFAULT 0, p_is_featured boolean DEFAULT false)
 RETURNS food_items
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now     timestamptz := now();
  v_before  public.food_items;
  v_after   public.food_items;
  v_action  text;
begin
  -- Defensive guard aligned with the admin form's price validation.
  if p_price_cents is not null and p_price_cents < 0 then
    raise exception 'price_cents must be non-negative';
  end if;

  select * into v_before
    from public.food_items
   where slug = p_slug
   for update;

  insert into public.food_items (
    slug, name, category, description, is_active, status,
    price_cents, sort_order, is_featured, updated_at
  ) values (
    p_slug, p_name, p_category, p_description,
    coalesce(p_is_active, true),
    coalesce(p_status, 'published'),
    p_price_cents,
    coalesce(p_sort_order, 0),
    coalesce(p_is_featured, false),
    v_now
  )
  on conflict (slug) do update
     set name        = excluded.name,
         category    = excluded.category,
         description = excluded.description,
         is_active   = excluded.is_active,
         status      = excluded.status,
         price_cents = excluded.price_cents,
         sort_order  = excluded.sort_order,
         is_featured = excluded.is_featured,
         updated_at  = v_now
  returning * into v_after;

  v_action := case when v_before.id is null then 'food.create' else 'food.update' end;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    v_action,
    'food_items',
    p_slug,
    jsonb_build_object(
      'before', case when v_before.id is null then null else to_jsonb(v_before) end,
      'after',  to_jsonb(v_after)
    )
  );

  return v_after;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_upsert_tale(p_actor uuid, p_email text, p_slug text, p_title text, p_name text, p_year text, p_chapter_label text, p_subtitle text, p_person_or_place text, p_story_body text, p_intro_type text, p_intro_asset_url text, p_stamp_image_url text, p_tap_status text, p_status text, p_is_active boolean, p_sort_order integer, p_mini_game_type text)
 RETURNS tales
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now     timestamptz := now();
  v_before  public.tales;
  v_after   public.tales;
  v_action  text;
begin
  -- Capture pre-state if a row with this slug exists (FOR UPDATE
  -- so a concurrent edit can't interleave between SELECT and
  -- INSERT...ON CONFLICT).
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
    v_now
  )
  on conflict (slug) do update
     set title           = excluded.title,
         name            = excluded.name,
         year            = excluded.year,
         chapter_label   = excluded.chapter_label,
         subtitle        = excluded.subtitle,
         person_or_place = excluded.person_or_place,
         story_body      = excluded.story_body,
         intro_type      = excluded.intro_type,
         intro_asset_url = excluded.intro_asset_url,
         stamp_image_url = excluded.stamp_image_url,
         tap_status      = excluded.tap_status,
         status          = excluded.status,
         is_active       = excluded.is_active,
         sort_order      = excluded.sort_order,
         mini_game_type  = excluded.mini_game_type,
         updated_at      = v_now
         -- Explicitly NOT updated:
         --   id          (PK; system-managed; never touched)
         --   beer_id     (relational; deferred to a future phase)
         --   venue_id    (relational; deferred to a future phase)
         --   timeline    (jsonb; deferred to M.2 structured editor)
         --   map_points  (jsonb; deferred to M.2 structured editor)
         --   created_at  (system-managed)
  returning * into v_after;

  -- Decide create vs update based on pre-state. Use the PK column
  -- (id) as the existence signal.
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_admin_upsert_tale_content(p_actor uuid, p_email text, p_slug text, p_timeline jsonb, p_map_points jsonb)
 RETURNS tales
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now     timestamptz := now();
  v_before  public.tales;
  v_after   public.tales;
begin
  -- Capture pre-state. FOR UPDATE so a concurrent scalar edit
  -- (via fn_admin_upsert_tale) can't interleave between SELECT
  -- and UPDATE.
  select * into v_before
    from public.tales
   where slug = p_slug
   for update;

  if v_before.id is null then
    raise exception 'tale slug % not found', p_slug
      using errcode = 'P0001';
  end if;

  -- Defensive shape check. The admin's Zod layer enforces this,
  -- but PL/pgSQL doesn't validate body params, so we re-check.
  -- A non-array payload (object, string, number) gets rejected
  -- before the UPDATE runs.
  if p_timeline is not null and jsonb_typeof(p_timeline) <> 'array' then
    raise exception 'p_timeline must be a JSON array (got %)', jsonb_typeof(p_timeline)
      using errcode = 'P0002';
  end if;
  if p_map_points is not null and jsonb_typeof(p_map_points) <> 'array' then
    raise exception 'p_map_points must be a JSON array (got %)', jsonb_typeof(p_map_points)
      using errcode = 'P0002';
  end if;

  -- REPLACE semantics. Whatever the admin form sends is the new
  -- value of the column, regardless of what was there before.
  -- NULL inputs are normalized to '[]'::jsonb so the columns
  -- always carry an array (matches the canonical TS reader's
  -- expectations and avoids null-vs-empty-array ambiguity).
  --
  -- Explicitly NOT updated:
  --   id           (PK; system-managed)
  --   slug         (lookup key; immutable from this function)
  --   title, name, year, chapter_label, subtitle,
  --   person_or_place, story_body, intro_type, intro_asset_url,
  --   stamp_image_url, tap_status, status, is_active, sort_order,
  --   mini_game_type   — all M.1.1 scalar columns; preserved
  --   verbatim because this function only writes the two jsonb
  --   columns. The scalar columns are managed by
  --   fn_admin_upsert_tale (M.1.1 18-arg signature).
  --   beer_id, venue_id   — relational; deferred.
  --   created_at          — system-managed.
  update public.tales
     set timeline   = coalesce(p_timeline,   '[]'::jsonb),
         map_points = coalesce(p_map_points, '[]'::jsonb),
         updated_at = v_now
   where slug = p_slug
  returning * into v_after;

  -- Single audit row per save. Action is always 'tale.update'
  -- (the function only ever updates an existing row; creation
  -- of new tales goes through fn_admin_upsert_tale). Payload
  -- includes full-row before/after for symmetry with M.1's
  -- scalar audit format — operators reading /admin/audit can
  -- diff the timeline / map_points fields directly.
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_media_upload(p_actor uuid, p_email text, p_bucket text, p_storage_path text, p_mime_type text, p_byte_size bigint, p_width integer, p_height integer, p_original_filename text, p_alt_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_actor is null then
    raise exception 'fn_media_upload: p_actor is required';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'fn_media_upload: p_email is required';
  end if;
  if coalesce(trim(p_bucket), '') = '' then
    raise exception 'fn_media_upload: p_bucket is required';
  end if;
  if coalesce(trim(p_storage_path), '') = '' then
    raise exception 'fn_media_upload: p_storage_path is required';
  end if;
  if coalesce(trim(p_mime_type), '') = '' then
    raise exception 'fn_media_upload: p_mime_type is required';
  end if;
  if p_byte_size is null or p_byte_size <= 0 then
    raise exception 'fn_media_upload: p_byte_size must be > 0';
  end if;

  insert into public.media_assets (
    bucket,
    storage_path,
    mime_type,
    byte_size,
    width,
    height,
    original_filename,
    alt_text,
    uploaded_by
  ) values (
    p_bucket,
    p_storage_path,
    p_mime_type,
    p_byte_size,
    p_width,
    p_height,
    p_original_filename,
    p_alt_text,
    p_actor
  )
  returning id into v_id;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'media.upload',
    'media_assets',
    v_id::text,
    jsonb_build_object(
      'asset_id',          v_id,
      'bucket',            p_bucket,
      'storage_path',      p_storage_path,
      'mime_type',         p_mime_type,
      'byte_size',         p_byte_size,
      'width',             p_width,
      'height',            p_height,
      'original_filename', p_original_filename,
      'alt_text',          p_alt_text
    )
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tap_edit_notes(p_actor uuid, p_email text, p_beer_slug text, p_started_at timestamp with time zone, p_notes text)
 RETURNS tap_list
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_before text;
  v_row    public.tap_list;
begin
  -- Capture the pre-edit notes value with FOR UPDATE so a concurrent
  -- editor cannot interleave between our SELECT and UPDATE. Without
  -- the lock, two simultaneous edits could each see the same "before"
  -- value and the audit log would show two redundant changes.
  select notes into v_before
    from public.tap_list
   where beer_slug  = p_beer_slug
     and started_at = p_started_at
     and ended_at is null
   for update;

  if not found then
    raise exception 'no live pour for % at %', p_beer_slug, p_started_at
      using errcode = 'P0002';
  end if;

  update public.tap_list
     set notes = p_notes
   where beer_slug  = p_beer_slug
     and started_at = p_started_at
     and ended_at is null
  returning * into v_row;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'tap.edit_notes',
    'tap_list',
    p_beer_slug || '@' || p_started_at::text,
    jsonb_build_object(
      'beer_slug',   p_beer_slug,
      'started_at',  p_started_at,
      'before',      v_before,
      'after',       p_notes
    )
  );

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tap_end(p_actor uuid, p_email text, p_beer_slug text, p_started_at timestamp with time zone)
 RETURNS tap_list
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_row public.tap_list;
begin
  update public.tap_list
     set ended_at = v_now
   where beer_slug  = p_beer_slug
     and started_at = p_started_at
     and ended_at is null
  returning * into v_row;

  if not found then
    raise exception 'no live pour for % at %', p_beer_slug, p_started_at
      using errcode = 'P0002';
  end if;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'tap.end',
    'tap_list',
    p_beer_slug || '@' || p_started_at::text,
    jsonb_build_object(
      'beer_slug',   p_beer_slug,
      'started_at',  p_started_at,
      'ended_at',    v_now
    )
  );

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tap_start(p_actor uuid, p_email text, p_beer_slug text, p_tap_number integer, p_notes text)
 RETURNS tap_list
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_row public.tap_list;
begin
  if not exists (
    select 1 from public.beers
     where slug = p_beer_slug
       and is_active
  ) then
    raise exception 'beer % is not active or does not exist', p_beer_slug
      using errcode = 'P0001';
  end if;

  insert into public.tap_list (beer_slug, tap_number, started_at, notes)
  values (p_beer_slug, p_tap_number, v_now, p_notes)
  returning * into v_row;

  insert into public.admin_actions (
    actor_id, actor_email, action, target_kind, target_key, payload
  ) values (
    p_actor,
    p_email,
    'tap.start',
    'tap_list',
    p_beer_slug || '@' || v_now::text,
    jsonb_build_object(
      'beer_slug',   p_beer_slug,
      'tap_number',  p_tap_number,
      'notes',       p_notes,
      'started_at',  v_now
    )
  );

  return v_row;
end;
$function$;

-- ---------- indexes (non-constraint) ----------
CREATE INDEX admin_actions_action_idx ON public.admin_actions USING btree (action, created_at DESC);
CREATE INDEX admin_actions_actor_idx ON public.admin_actions USING btree (actor_id, created_at DESC);
CREATE INDEX admin_actions_recent_idx ON public.admin_actions USING btree (created_at DESC);
CREATE INDEX idx_beers_category ON public.beers USING btree (category);
CREATE INDEX idx_beers_is_active ON public.beers USING btree (is_active);
CREATE INDEX idx_beers_name ON public.beers USING btree (name);
CREATE INDEX idx_beers_slug ON public.beers USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX idx_beers_sort ON public.beers USING btree (sort_order);
CREATE INDEX idx_beers_sort_order ON public.beers USING btree (sort_order);
CREATE INDEX idx_coming_next_sort ON public.coming_next_tales USING btree (sort_order);
CREATE INDEX idx_coming_next_tales_sort_order ON public.coming_next_tales USING btree (sort_order);
CREATE INDEX idx_food_items_category ON public.food_items USING btree (category) WHERE (category IS NOT NULL);
CREATE INDEX idx_food_items_is_active ON public.food_items USING btree (is_active);
CREATE INDEX idx_food_items_sort_order ON public.food_items USING btree (sort_order);
CREATE INDEX idx_food_sort ON public.food_items USING btree (sort_order);
CREATE INDEX idx_food_venue ON public.food_items USING btree (venue_id);
CREATE INDEX idx_guest_badges_badge_key ON public.guest_badges USING btree (badge_key);
CREATE INDEX idx_guest_badges_guest_id ON public.guest_badges USING btree (guest_id);
CREATE INDEX idx_guest_scan_events_created_at ON public.guest_scan_events USING btree (created_at DESC);
CREATE INDEX idx_guest_scan_events_guest_id ON public.guest_scan_events USING btree (guest_id);
CREATE INDEX idx_guest_unlocks_guest_id ON public.guest_unlocks USING btree (guest_id);
CREATE INDEX idx_guest_unlocks_tale_slug ON public.guest_unlocks USING btree (tale_slug);
CREATE INDEX media_assets_created_at_idx ON public.media_assets USING btree (created_at DESC);
CREATE INDEX media_assets_mime_idx ON public.media_assets USING btree (mime_type);
CREATE INDEX media_assets_uploaded_by_idx ON public.media_assets USING btree (uploaded_by);
CREATE INDEX idx_qr_codes_campaign_key ON public.qr_codes USING btree (campaign_key) WHERE (campaign_key IS NOT NULL);
CREATE INDEX idx_qr_codes_code ON public.qr_codes USING btree (code);
CREATE INDEX idx_qr_codes_is_active ON public.qr_codes USING btree (is_active);
CREATE INDEX idx_qr_codes_tale_id ON public.qr_codes USING btree (tale_id);
CREATE INDEX idx_qr_codes_tale_slug ON public.qr_codes USING btree (tale_slug) WHERE (tale_slug IS NOT NULL);
CREATE INDEX idx_reward_tiers_sort ON public.reward_tiers USING btree (stamps_required);
CREATE INDEX idx_reward_tiers_sort_order ON public.reward_tiers USING btree (sort_order);
CREATE INDEX idx_reward_tiers_venue ON public.reward_tiers USING btree (venue_id);
CREATE INDEX idx_scan_events_guest ON public.scan_events USING btree (guest_id);
CREATE INDEX idx_scan_events_scanned ON public.scan_events USING btree (scanned_at DESC);
CREATE INDEX idx_scan_events_tale ON public.scan_events USING btree (tale_id);
CREATE INDEX idx_tales_beer_id ON public.tales USING btree (beer_id);
CREATE INDEX idx_tales_is_active ON public.tales USING btree (is_active);
CREATE INDEX idx_tales_slug ON public.tales USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX idx_tales_sort ON public.tales USING btree (sort_order);
CREATE INDEX idx_tales_sort_order ON public.tales USING btree (sort_order);
CREATE INDEX idx_tales_venue_id ON public.tales USING btree (venue_id);
CREATE INDEX tap_list_live_by_beer_idx ON public.tap_list USING btree (beer_slug) WHERE (ended_at IS NULL);
CREATE INDEX tap_list_live_idx ON public.tap_list USING btree (started_at DESC) WHERE (ended_at IS NULL);
CREATE UNIQUE INDEX tap_list_one_live_per_tap_idx ON public.tap_list USING btree (tap_number) WHERE ((ended_at IS NULL) AND (tap_number IS NOT NULL));
CREATE INDEX idx_badges_guest ON public.user_badges USING btree (guest_id);
CREATE INDEX idx_badges_tale ON public.user_badges USING btree (tale_id);
CREATE INDEX idx_unlocks_guest ON public.user_tale_unlocks USING btree (guest_id);
CREATE INDEX idx_unlocks_tale ON public.user_tale_unlocks USING btree (tale_id);

-- ---------- row level security ----------
alter table public.admin_actions enable row level security;
alter table public.beers enable row level security;
alter table public.coming_next_tales enable row level security;
alter table public.food_items enable row level security;
alter table public.guest_badges enable row level security;
alter table public.guest_profiles enable row level security;
alter table public.guest_scan_events enable row level security;
alter table public.guest_unlocks enable row level security;
alter table public.guests enable row level security;
alter table public.media_assets enable row level security;
alter table public.qr_codes enable row level security;
alter table public.reward_tiers enable row level security;
alter table public.scan_events enable row level security;
alter table public.tales enable row level security;
alter table public.tap_list enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_tale_unlocks enable row level security;
alter table public.venues enable row level security;

-- ---------- policies (exact production set, incl. legacy demo policies
--            retained deliberately — flagged for a future removal gate) ----------
create policy "Public read active beers" on public.beers for select to public using ((is_active = true));
create policy "Public read coming next tales" on public.coming_next_tales for select to public using (true);
create policy "Public read active food items" on public.food_items for select to public using ((is_active = true));
create policy "demo_guest_badges_all" on public.guest_badges for all to anon using (true) with check (true);
create policy "demo_guest_profiles_upsert" on public.guest_profiles for all to anon using (true) with check (true);
create policy "demo_guest_scan_events_insert" on public.guest_scan_events for insert to anon with check (true);
create policy "demo_guest_unlocks_all" on public.guest_unlocks for all to anon using (true) with check (true);
create policy "Public read reward tiers" on public.reward_tiers for select to public using (true);
create policy "Public read active tales" on public.tales for select to public using ((is_active = true));
create policy "tap_list: public read live" on public.tap_list for select to public using ((ended_at IS NULL));
create policy "Public read active venues" on public.venues for select to public using ((is_active = true));

-- ---------- table grants (exact captured matrix for the three app roles) ----------
revoke all on table public.admin_actions from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_actions to anon;
revoke all on table public.admin_actions from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_actions to authenticated;
revoke all on table public.admin_actions from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_actions to service_role;
revoke all on table public.admin_content_overview from anon;
revoke all on table public.admin_content_overview from authenticated;
revoke all on table public.admin_content_overview from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_content_overview to service_role;
revoke all on table public.admin_guest_activity_summary from anon;
revoke all on table public.admin_guest_activity_summary from authenticated;
revoke all on table public.admin_guest_activity_summary from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_guest_activity_summary to service_role;
revoke all on table public.admin_missing_content_checks from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_missing_content_checks to anon;
revoke all on table public.admin_missing_content_checks from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_missing_content_checks to authenticated;
revoke all on table public.admin_missing_content_checks from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_missing_content_checks to service_role;
revoke all on table public.admin_qr_code_status from anon;
revoke all on table public.admin_qr_code_status from authenticated;
revoke all on table public.admin_qr_code_status from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_qr_code_status to service_role;
revoke all on table public.admin_tales_status from anon;
revoke all on table public.admin_tales_status from authenticated;
revoke all on table public.admin_tales_status from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.admin_tales_status to service_role;
revoke all on table public.badge_events from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.badge_events to anon;
revoke all on table public.badge_events from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.badge_events to authenticated;
revoke all on table public.badge_events from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.badge_events to service_role;
revoke all on table public.beers from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.beers to anon;
revoke all on table public.beers from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.beers to authenticated;
revoke all on table public.beers from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.beers to service_role;
revoke all on table public.coming_next_tales from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.coming_next_tales to anon;
revoke all on table public.coming_next_tales from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.coming_next_tales to authenticated;
revoke all on table public.coming_next_tales from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.coming_next_tales to service_role;
revoke all on table public.food from anon;
revoke all on table public.food from authenticated;
revoke all on table public.food from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.food to service_role;
revoke all on table public.food_items from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.food_items to anon;
revoke all on table public.food_items from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.food_items to authenticated;
revoke all on table public.food_items from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.food_items to service_role;
revoke all on table public.game_events from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.game_events to anon;
revoke all on table public.game_events from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.game_events to authenticated;
revoke all on table public.game_events from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.game_events to service_role;
revoke all on table public.guest_badges from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_badges to anon;
revoke all on table public.guest_badges from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_badges to authenticated;
revoke all on table public.guest_badges from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_badges to service_role;
revoke all on table public.guest_profiles from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_profiles to anon;
revoke all on table public.guest_profiles from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_profiles to authenticated;
revoke all on table public.guest_profiles from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_profiles to service_role;
revoke all on table public.guest_scan_events from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_scan_events to anon;
revoke all on table public.guest_scan_events from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_scan_events to authenticated;
revoke all on table public.guest_scan_events from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_scan_events to service_role;
revoke all on table public.guest_unlocks from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_unlocks to anon;
revoke all on table public.guest_unlocks from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_unlocks to authenticated;
revoke all on table public.guest_unlocks from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guest_unlocks to service_role;
revoke all on table public.guests from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guests to anon;
revoke all on table public.guests from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guests to authenticated;
revoke all on table public.guests from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.guests to service_role;
revoke all on table public.media_assets from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.media_assets to anon;
revoke all on table public.media_assets from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.media_assets to authenticated;
revoke all on table public.media_assets from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.media_assets to service_role;
revoke all on table public.qr_codes from anon;
grant REFERENCES, TRIGGER, TRUNCATE on table public.qr_codes to anon;
revoke all on table public.qr_codes from authenticated;
grant REFERENCES, TRIGGER, TRUNCATE on table public.qr_codes to authenticated;
revoke all on table public.qr_codes from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.qr_codes to service_role;
revoke all on table public.reward_tiers from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.reward_tiers to anon;
revoke all on table public.reward_tiers from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.reward_tiers to authenticated;
revoke all on table public.reward_tiers from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.reward_tiers to service_role;
revoke all on table public.scan_events from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.scan_events to anon;
revoke all on table public.scan_events from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.scan_events to authenticated;
revoke all on table public.scan_events from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.scan_events to service_role;
revoke all on table public.tales from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tales to anon;
revoke all on table public.tales from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tales to authenticated;
revoke all on table public.tales from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tales to service_role;
revoke all on table public.tap_list from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tap_list to anon;
revoke all on table public.tap_list from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tap_list to authenticated;
revoke all on table public.tap_list from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.tap_list to service_role;
revoke all on table public.unlock_events from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.unlock_events to anon;
revoke all on table public.unlock_events from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.unlock_events to authenticated;
revoke all on table public.unlock_events from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.unlock_events to service_role;
revoke all on table public.user_badges from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_badges to anon;
revoke all on table public.user_badges from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_badges to authenticated;
revoke all on table public.user_badges from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_badges to service_role;
revoke all on table public.user_tale_unlocks from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_tale_unlocks to anon;
revoke all on table public.user_tale_unlocks from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_tale_unlocks to authenticated;
revoke all on table public.user_tale_unlocks from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.user_tale_unlocks to service_role;
revoke all on table public.venues from anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.venues to anon;
revoke all on table public.venues from authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.venues to authenticated;
revoke all on table public.venues from service_role;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.venues to service_role;

-- ---------- function execute grants (exact captured matrix) ----------
revoke all on function public.fn_admin_archive_beer(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_archive_beer(uuid,text,text) to service_role;
revoke all on function public.fn_admin_archive_food(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_archive_food(uuid,text,text) to service_role;
revoke all on function public.fn_admin_archive_tale(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_archive_tale(uuid,text,text) to service_role;
revoke all on function public.fn_admin_assert_media_storage_path_safe(text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_assert_media_storage_path_safe(text,uuid,text) to service_role;
revoke all on function public.fn_admin_assign_beer_media(uuid,text,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_assign_beer_media(uuid,text,text,uuid,text) to service_role;
revoke all on function public.fn_admin_assign_food_media(uuid,text,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_assign_food_media(uuid,text,text,uuid,text) to service_role;
revoke all on function public.fn_admin_assign_tale_media(uuid,text,text,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_assign_tale_media(uuid,text,text,text,uuid,text) to service_role;
revoke all on function public.fn_admin_count_admins() from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_count_admins() to service_role;
revoke all on function public.fn_admin_create_qr(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_create_qr(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text) to service_role;
revoke all on function public.fn_admin_finalize_media_delete(uuid,text,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_finalize_media_delete(uuid,text,uuid,text,text) to service_role;
revoke all on function public.fn_admin_get_active_qr_artwork_source(uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_get_active_qr_artwork_source(uuid,text,uuid,text) to service_role;
revoke all on function public.fn_admin_list_orphan_media(text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_list_orphan_media(text) to service_role;
revoke all on function public.fn_admin_log_demote(uuid,text,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_demote(uuid,text,uuid,text,text) to service_role;
revoke all on function public.fn_admin_log_disable(uuid,text,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_disable(uuid,text,uuid,text,text,text) to service_role;
revoke all on function public.fn_admin_log_enable(uuid,text,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_enable(uuid,text,uuid,text,text) to service_role;
revoke all on function public.fn_admin_log_invite(uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_invite(uuid,text,text,text) to service_role;
revoke all on function public.fn_admin_log_media_delete_failed(uuid,text,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_media_delete_failed(uuid,text,uuid,text,text,text) to service_role;
revoke all on function public.fn_admin_log_mfa_reset(uuid,text,uuid,text,integer,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_mfa_reset(uuid,text,uuid,text,integer,integer,text) to service_role;
revoke all on function public.fn_admin_log_promote(uuid,text,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_promote(uuid,text,uuid,text,text) to service_role;
revoke all on function public.fn_admin_log_tale_preview(uuid,text,uuid,text,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_log_tale_preview(uuid,text,uuid,text,timestamp with time zone) to service_role;
revoke all on function public.fn_admin_prepare_media_delete(uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_prepare_media_delete(uuid,text,uuid,text) to service_role;
revoke all on function public.fn_admin_revoke_qr(uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_revoke_qr(uuid,text,uuid,text) to service_role;
revoke all on function public.fn_admin_rotate_qr(uuid,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_rotate_qr(uuid,text,uuid,text) to service_role;
revoke all on function public.fn_admin_upsert_beer(uuid,text,text,text,text,text,numeric,integer,text,text,text,boolean,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_upsert_beer(uuid,text,text,text,text,text,numeric,integer,text,text,text,boolean,text,integer) to service_role;
revoke all on function public.fn_admin_upsert_food(uuid,text,text,text,text,text,boolean,text,integer,integer,boolean) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_upsert_food(uuid,text,text,text,text,text,boolean,text,integer,integer,boolean) to service_role;
revoke all on function public.fn_admin_upsert_tale(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_upsert_tale(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,integer,text) to service_role;
revoke all on function public.fn_admin_upsert_tale_content(uuid,text,text,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.fn_admin_upsert_tale_content(uuid,text,text,jsonb,jsonb) to service_role;
revoke all on function public.fn_media_upload(uuid,text,text,text,text,bigint,integer,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_media_upload(uuid,text,text,text,text,bigint,integer,integer,text,text) to service_role;
revoke all on function public.fn_tap_edit_notes(uuid,text,text,timestamp with time zone,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_tap_edit_notes(uuid,text,text,timestamp with time zone,text) to anon;
grant execute on function public.fn_tap_edit_notes(uuid,text,text,timestamp with time zone,text) to authenticated;
grant execute on function public.fn_tap_edit_notes(uuid,text,text,timestamp with time zone,text) to service_role;
revoke all on function public.fn_tap_end(uuid,text,text,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.fn_tap_end(uuid,text,text,timestamp with time zone) to anon;
grant execute on function public.fn_tap_end(uuid,text,text,timestamp with time zone) to authenticated;
grant execute on function public.fn_tap_end(uuid,text,text,timestamp with time zone) to service_role;
revoke all on function public.fn_tap_start(uuid,text,text,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.fn_tap_start(uuid,text,text,integer,text) to anon;
grant execute on function public.fn_tap_start(uuid,text,text,integer,text) to authenticated;
grant execute on function public.fn_tap_start(uuid,text,text,integer,text) to service_role;

-- ---------- table comments (reviewed, documentation only) ----------
comment on table public.beers is 'All beers across all venues: Tales, resident pours, N/A, and future categories.';
comment on table public.coming_next_tales is 'Roadmap teaser entries for future Tales. Shown as locked/disabled cards in the TALES screen.';
comment on table public.food_items is 'Curated food highlights per venue. Used in the BEERS tap list and the compact kitchen section on the TALES screen.';
comment on table public.guests is 'Guest identity records. Phase 1: created manually/via Edge Function on first nickname save. Phase 2: linked to Supabase anonymous auth sessions.';
comment on table public.qr_codes is 'Registered QR codes. Validated server-side on scan in Phase 2. Demo codes (WM-*) are seeded here for testing the validation flow.';
comment on table public.reward_tiers is 'Stamp-collection reward milestones per venue. is_live controls whether the tier shows as redeemable or preview-only.';
comment on table public.scan_events is 'Immutable audit log of all QR scan events. guest_id is nullable for pre-auth anonymous scans. Used for analytics and duplicate-scan detection.';
comment on table public.tales is 'Collectible story experiences. Each Tale is linked to a beer and contains all narrative content, map data, and mini-game configuration.';
comment on table public.user_badges is 'Per-guest badge collection. Mirrors state.scanBadges and state.gameBadges. Used for Passport Book, rewards progress, and collectibles display.';
comment on table public.user_tale_unlocks is 'Per-guest Tale unlock records. The unique constraint mirrors the state.unlocked Set in the v3 frontend.';
comment on table public.venues is 'Physical taproom locations that host Trackside Tales.';

commit;
