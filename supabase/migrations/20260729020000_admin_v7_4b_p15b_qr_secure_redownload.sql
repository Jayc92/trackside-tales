-- ========= ADMIN/SUPABASE-v7.4B.P.15b — audited active-QR artwork re-download =========
--
-- Operators sometimes need to reprint the label artwork for a QR code
-- that is still secure (misplaced SVG, new can run). Before P.15b the
-- only recovery was rotation, which needlessly kills a valid printed
-- code. This migration adds ONE read pathway for the stored code:
--
--   fn_admin_get_active_qr_artwork_source(p_actor, p_email, p_qr_id, p_reason)
--
-- Semantics:
--   * READ-ONLY against qr_codes — no UPDATE, no rotation, no status
--     change, no row mutation of any kind.
--   * Eligibility fails closed (P0003) unless the row is CURRENTLY
--     usable by the public validator: status='active', is_active IS
--     TRUE, valid_from null-or-started, valid_until null-or-not-past,
--     max_uses IS NULL (mirrors validate-qr's fail-closed max_uses
--     posture). Revoked / inactive / expired / future-dated rows can
--     never be re-read — recovering those means rotation or a new
--     code.
--   * Requires a nonblank operator reason (P0004) and a resolvable
--     Tale association (P0007; slug-first, legacy tale_id fallback —
--     mirroring fn_admin_rotate_qr).
--   * Every successful call writes a `qr.download` audit row IN THE
--     SAME TRANSACTION as the read. The payload carries ids, status,
--     window, campaign/batch metadata, and the reason — NEVER the
--     code, never SVG/image data, never a token-bearing URL.
--   * The raw code is returned ONLY to the service-role caller (the
--     admin Server Action, which converts it to one-time SVG artwork
--     in memory). EXECUTE is revoked from public/anon/authenticated.
--
-- The admin app additionally gates this action behind a FRESH MFA
-- step-up (10-minute TOTP recency) — that policy lives client-side of
-- this RPC by design: the database boundary is service_role EXECUTE,
-- identical to every other fn_admin_* function.
--
-- Also extends admin_actions_action_check with 'qr.download' using
-- the P.14a live-definition-rebuild mechanism (never drops values it
-- doesn't know about).
--
-- No table ALTER. No row mutation on application. Idempotent: the
-- allowlist step skips itself when qr.download is present; the
-- function is CREATE OR REPLACE; grants are idempotent.
--
-- Explicit begin/commit (P.13b.1 precedent): atomicity holds whether
-- applied via `supabase db push` or pasted into the SQL Editor; any
-- failed pre/postcheck aborts and rolls back everything.
--
-- APPLY: operator-gated, after review, via SQL Editor. Requires the
-- P.14a migration to have been applied first.

begin;

-- ---- prechecks -------------------------------------------------------------
do $p15b_pre$
begin
  if to_regclass('public.qr_codes') is null then
    raise exception 'P.15b precheck: public.qr_codes does not exist';
  end if;
  if to_regclass('public.tales') is null then
    raise exception 'P.15b precheck: public.tales does not exist';
  end if;
  if to_regclass('public.admin_actions') is null then
    raise exception 'P.15b precheck: public.admin_actions does not exist';
  end if;

  -- The P.14a lifecycle family must already exist (same conventions,
  -- and its allowlist mechanism precedent).
  if to_regprocedure('public.fn_admin_rotate_qr(uuid, text, uuid, text)') is null then
    raise exception 'P.15b precheck: fn_admin_rotate_qr not found — apply the P.14a migration first';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_actions_action_check'
       and conrelid = 'public.admin_actions'::regclass
  ) then
    raise exception 'P.15b precheck: admin_actions_action_check constraint missing';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'P.15b precheck: service_role role missing';
  end if;

  raise notice 'P.15b PRECHECK OK';
end
$p15b_pre$;

-- ---- extend admin_actions_action_check with qr.download ---------------------
-- Same live-definition rebuild as P.14a: read the CURRENT constraint,
-- inject the new value, re-add (which re-validates existing rows).
do $p15b_check$
declare
  v_def text;
  v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;

  if v_def like '%qr.download%' then
    raise notice 'P.15b: qr.download already present in admin_actions_action_check — skipping rebuild';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 then
    raise exception 'P.15b: unexpected admin_actions_action_check shape (need exactly one ARRAY[): %', v_def;
  end if;
  if v_def not like '%tap.start%' or v_def not like '%qr.create%' then
    raise exception 'P.15b: admin_actions_action_check missing sentinel value(s) — refusing to rebuild: %', v_def;
  end if;

  v_new := replace(v_def, 'ARRAY[', 'ARRAY[''qr.download''::text, ');

  execute 'alter table public.admin_actions drop constraint admin_actions_action_check';
  execute 'alter table public.admin_actions add constraint admin_actions_action_check ' || v_new;

  raise notice 'P.15b: admin_actions_action_check extended with qr.download';
end
$p15b_check$;

-- ---- fn_admin_get_active_qr_artwork_source ----------------------------------
create or replace function public.fn_admin_get_active_qr_artwork_source(
  p_actor   uuid,
  p_email   text,
  p_qr_id   uuid,
  p_reason  text
)
returns table (
  qr_id        uuid,
  code         text,
  tale_slug    text,
  valid_from   timestamptz,
  valid_until  timestamptz
)
language plpgsql
security invoker
set search_path = public, extensions
as $$
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
$$;

-- ---- grants ----------------------------------------------------------------
revoke execute on function public.fn_admin_get_active_qr_artwork_source(uuid, text, uuid, text) from public;
revoke execute on function public.fn_admin_get_active_qr_artwork_source(uuid, text, uuid, text) from anon;
revoke execute on function public.fn_admin_get_active_qr_artwork_source(uuid, text, uuid, text) from authenticated;
grant  execute on function public.fn_admin_get_active_qr_artwork_source(uuid, text, uuid, text) to service_role;

-- ---- postchecks ------------------------------------------------------------
do $p15b_post$
declare
  v_fn          record;
  v_def         text;
  v_src         text;
  v_audit_pos   int;
  v_return_pos  int;
  v_audit_slice text;
  v_sig         text := 'public.fn_admin_get_active_qr_artwork_source(uuid, text, uuid, text)';
begin
  select p.prosecdef,
         array_to_string(coalesce(p.proconfig, array[]::text[]), ',') as config,
         p.prosrc
    into v_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_admin_get_active_qr_artwork_source';
  if v_fn is null then
    raise exception 'P.15b postcheck: fn_admin_get_active_qr_artwork_source missing';
  end if;
  if v_fn.prosecdef then
    raise exception 'P.15b postcheck: function is SECURITY DEFINER (expected INVOKER)';
  end if;
  if v_fn.config not like '%search_path=public, extensions%' then
    raise exception 'P.15b postcheck: search_path not locked to public, extensions (got %)', v_fn.config;
  end if;

  v_src := v_fn.prosrc;

  -- The function must be read-only against qr_codes: no UPDATE/DELETE
  -- statements may target it.
  if v_src ~* 'update\s+public\.qr_codes' or v_src ~* 'delete\s+from\s+public\.qr_codes' then
    raise exception 'P.15b postcheck: function mutates qr_codes — must be read-only';
  end if;

  -- The audit INSERT (between 'admin_actions' and 'return query') must
  -- not reference the code column — the raw secret never enters an
  -- audit payload. Checks both the quoted jsonb key form and the
  -- column reference form.
  v_audit_pos := position('admin_actions' in v_src);
  if v_audit_pos = 0 then
    raise exception 'P.15b postcheck: function writes no audit row';
  end if;
  v_return_pos := position('return query' in substr(v_src, v_audit_pos));
  if v_return_pos = 0 then
    v_return_pos := length(v_src) - v_audit_pos + 1;
  end if;
  v_audit_slice := substr(v_src, v_audit_pos, v_return_pos);
  if position('''code''' in v_audit_slice) > 0 then
    raise exception 'P.15b postcheck: audit construction contains a ''code'' key (raw secret!)';
  end if;
  if position('v_row.code' in v_audit_slice) > 0 then
    raise exception 'P.15b postcheck: audit construction references v_row.code (raw secret!)';
  end if;

  -- Privilege matrix: service_role yes; client roles no.
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'P.15b postcheck: service_role cannot execute %', v_sig;
  end if;
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'P.15b postcheck: anon can execute %', v_sig;
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'P.15b postcheck: authenticated can execute %', v_sig;
  end if;

  -- Allowlist must now contain qr.download plus the existing sentinels.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;
  if v_def is null then
    raise exception 'P.15b postcheck: admin_actions_action_check vanished';
  end if;
  if v_def not like '%qr.download%' then
    raise exception 'P.15b postcheck: allowlist missing qr.download: %', v_def;
  end if;
  if v_def not like '%tap.start%' or v_def not like '%qr.create%' then
    raise exception 'P.15b postcheck: allowlist lost sentinel value(s): %', v_def;
  end if;

  raise notice 'P.15b POSTCHECK OK: read-only audited artwork-source function, SECURITY INVOKER, service_role-only EXECUTE, allowlist extended, no raw code in audit construction';
end
$p15b_post$;

commit;
