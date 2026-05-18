-- ============================================================
-- Trackside Tales · v4.3 QR Validation Schema
-- ============================================================
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor).
-- All statements are idempotent — safe to re-run.
--
-- This file adds/extends the `qr_codes` table with server-side
-- validation columns and seeds the three demo QR tokens.
-- ============================================================

-- ── 1. Extend qr_codes table ─────────────────────────────────
-- Add columns defensively. If they already exist, the IF NOT EXISTS
-- guards prevent errors.

create table if not exists public.qr_codes (
  id           uuid        primary key default gen_random_uuid(),
  code         text        unique not null,
  tale_slug    text,
  tale_id      uuid,
  beer_id      text,
  venue_id     uuid,
  campaign_key text,
  batch_key    text,
  is_active    boolean     default true,
  valid_from   timestamptz,
  valid_until  timestamptz,
  max_uses     integer,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Add columns that may be missing on an existing table.
do $$ begin
  begin alter table public.qr_codes add column tale_slug    text;        exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column beer_id      text;        exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column venue_id     uuid;        exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column campaign_key text;        exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column batch_key    text;        exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column is_active    boolean;     exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column valid_from   timestamptz; exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column valid_until  timestamptz; exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column max_uses     integer;     exception when duplicate_column then null; end;
  begin alter table public.qr_codes add column updated_at   timestamptz default now(); exception when duplicate_column then null; end;
end $$;


-- ── 2. RLS ───────────────────────────────────────────────────
alter table public.qr_codes enable row level security;

-- Demo SELECT policy: anon key can read active codes directly.
-- Long-term, remove this policy once Edge Function is the only validator.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'qr_codes' and policyname = 'demo_qr_codes_select'
  ) then
    create policy "demo_qr_codes_select"
      on public.qr_codes
      for select
      to anon
      using (is_active = true);
  end if;
end $$;


-- ── 3. Seed demo QR tokens (upsert) ──────────────────────────
insert into public.qr_codes (code, tale_slug, is_active, campaign_key)
values
  ('ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5',       'wa-lager',            true, 'demo-v4-3'),
  ('ts_demo_PACKER_N4F8Z2Q9L6C1Y7A3T5K0',   'packer-pilsner',      true, 'demo-v4-3'),
  ('ts_demo_WM_AMBER_Q8R2M5T1B6R3P0D5',     'wooden-match-amber',  true, 'demo-v4-3')
on conflict (code) do update
  set tale_slug    = excluded.tale_slug,
      is_active    = excluded.is_active,
      campaign_key = excluded.campaign_key,
      updated_at   = now();


-- ── Done ─────────────────────────────────────────────────────
-- After running:
--   1. Verify in Table Editor that qr_codes has three demo rows.
--   2. Deploy the Edge Function: supabase functions deploy validate-qr
--   3. Open the app and scan a demo URL:
--      https://jayc92.github.io/trackside-tales/?code=ts_demo_WA_7G9KQ4M2V8X1B6R3P0D5
