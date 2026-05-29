-- ============================================================
-- Trackside Admin — admin_actions audit log + tap-list functions
-- (ADMIN-v7.3)
--
-- Adds:
--   * public.admin_actions: append-only audit log keyed by actor +
--     action + target. Service-role only (RLS enabled, no policies).
--     Every successful admin mutation MUST insert one row here in
--     the same transaction as the mutation itself. The audit log is
--     introduced in v7.3 (not deferred to v7.9) so we never have a
--     historical gap in admin write traffic.
--
--   * public.fn_tap_start, fn_tap_end, fn_tap_edit_notes: stored
--     functions that perform a tap_list mutation AND its audit row
--     atomically. v7.3 callers go through these via supabase.rpc()
--     instead of writing tap_list directly. The atomicity is the
--     entire reason these exist — a Server Action that "wrote
--     tap_list, then wrote admin_actions" would be racy.
--
-- HARD CONSTRAINTS (encoded in SQL or comments below):
--   * No DELETE on tap_list, ever. Pour history is append-only;
--     bad pours get ended (and optionally annotated) instead.
--   * No retroactive started_at editing. fn_tap_start always uses
--     now(); the function takes no started_at parameter on insert.
--   * No mutation of beer_slug or started_at after insert. End the
--     row and start a new one.
--   * Idempotent DDL. Re-running this migration on a partially-
--     applied database does not error.
--
-- Rollback (full v7.3 unwind):
--   drop function if exists public.fn_tap_edit_notes(uuid, text, text, timestamptz, text);
--   drop function if exists public.fn_tap_end(uuid, text, text, timestamptz);
--   drop function if exists public.fn_tap_start(uuid, text, text, int, text);
--   drop table if exists public.admin_actions;
--
-- All four objects are introduced in this migration; nothing earlier
-- references them, so the unwind is safe.
-- ============================================================

-- ---------- admin_actions audit log -------------------------------

create table if not exists public.admin_actions (
  id            bigserial    primary key,
  -- Hard FK to auth.users + restrict on delete: an admin cannot be
  -- deleted while audit history references them. This is the right
  -- failure mode — audit trail integrity outranks user-row tidiness.
  actor_id      uuid         not null references auth.users (id) on delete restrict,
  -- Snapshot of the actor's email at action time. Denormalized on
  -- purpose so "who did this" stays readable even if the user later
  -- changes their email or is hidden from auth.users.
  actor_email   text         not null,
  action        text         not null check (action in ('tap.start', 'tap.end', 'tap.edit_notes')),
  target_kind   text         not null,
  target_key    text         not null,
  payload       jsonb        not null default '{}'::jsonb,
  created_at    timestamptz  not null default now()
);

create index if not exists admin_actions_actor_idx
  on public.admin_actions (actor_id, created_at desc);
create index if not exists admin_actions_action_idx
  on public.admin_actions (action, created_at desc);
create index if not exists admin_actions_recent_idx
  on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;
-- Intentionally NO policies. Service-role only. Same posture as
-- qr_codes, media_assets, and the *_events tables. Future
-- /admin/audit reads (v7.9) will go through the service-role admin
-- query layer; we never expose this stream to anon/authenticated.

-- ---------- fn_tap_start ------------------------------------------
-- Begin a new pour. Inserts a tap_list row + an admin_actions row
-- in one transaction. Raises a stable errcode on:
--   * P0001 — beer_slug doesn't exist or beer.is_active = false
--   * 23505 — tap_number unique violation (DB-level guard against
--             two beers on one physical handle, via the existing
--             tap_list_one_live_per_tap_idx partial unique index)
--   * 23503 — FK violation on beer_slug (race: beer was deleted
--             between dropdown render and submit)
--
-- The mutations.ts wrapper translates these into UI messages.
-- started_at is set to now(); v7.3 does not allow retroactive starts.
create or replace function public.fn_tap_start(
  p_actor       uuid,
  p_email       text,
  p_beer_slug   text,
  p_tap_number  int,
  p_notes       text
)
returns public.tap_list
language plpgsql
-- security invoker (default): the caller's role determines what
-- this function can read/write. We call it from service-role
-- contexts only, so RLS is bypassed. Calling from anon/authed
-- would still be blocked by tap_list's RLS posture even if
-- somehow reachable.
security invoker
-- Lock search_path so a future schema-confused caller can't shadow
-- public.tap_list / public.admin_actions / public.beers with a
-- malicious same-named object in another schema.
set search_path = public
as $$
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
$$;

-- ---------- fn_tap_end --------------------------------------------
-- End the live pour identified by (beer_slug, started_at). Only
-- mutates rows where ended_at is null, so a double-submit can't
-- "re-end" a finished pour. Raises P0002 if no live row matches.
create or replace function public.fn_tap_end(
  p_actor       uuid,
  p_email       text,
  p_beer_slug   text,
  p_started_at  timestamptz
)
returns public.tap_list
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

-- ---------- fn_tap_edit_notes -------------------------------------
-- Replace notes on the live pour. Captures before/after values in
-- the audit payload so "who changed what" is recoverable. Refuses
-- to edit notes on a non-live pour (forces "end + restart" if staff
-- need to retroactively annotate a finished pour).
create or replace function public.fn_tap_edit_notes(
  p_actor       uuid,
  p_email       text,
  p_beer_slug   text,
  p_started_at  timestamptz,
  p_notes       text
)
returns public.tap_list
language plpgsql
security invoker
set search_path = public
as $$
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
$$;
