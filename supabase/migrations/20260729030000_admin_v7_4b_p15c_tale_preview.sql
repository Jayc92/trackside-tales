-- ========= ADMIN/PUBLIC-v7.4B.P.15c — Tale draft-preview audit support =========
--
-- P.15c adds an operator draft-preview workflow: the admin app mints a
-- short-lived signed token (HMAC key DERIVED from the service-role
-- key — no stored secret, no new table, no schema change) and the
-- public app resolves it through the preview-tale Edge Function.
--
-- The database's only involvement is AUDIT: every preview mint writes
-- a `tale.preview.create` row. This migration:
--   * extends admin_actions_action_check with 'tale.preview.create'
--     (P.14a live-definition rebuild — never drops unknown values),
--   * adds fn_admin_log_tale_preview, a service-role-only SECURITY
--     INVOKER insert helper (same posture as the fn_admin_log_*
--     user-management family).
--
-- The audit payload carries tale_id / tale_slug / expires_at / mode —
-- NEVER the preview token (and no token-bearing URL).
--
-- No table ALTER. No content-row mutation. No public/anon access to
-- drafts is granted anywhere. Idempotent: allowlist step skips itself
-- when present; function is CREATE OR REPLACE; grants idempotent.
-- Explicit begin/commit (P.13b.1 precedent).
--
-- APPLY: operator-gated, after review, via SQL Editor.

begin;

-- ---- prechecks -------------------------------------------------------------
do $p15c_pre$
begin
  if to_regclass('public.tales') is null then
    raise exception 'P.15c precheck: public.tales does not exist';
  end if;
  if to_regclass('public.admin_actions') is null then
    raise exception 'P.15c precheck: public.admin_actions does not exist';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_actions_action_check'
       and conrelid = 'public.admin_actions'::regclass
  ) then
    raise exception 'P.15c precheck: admin_actions_action_check constraint missing';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'P.15c precheck: service_role role missing';
  end if;
  raise notice 'P.15c PRECHECK OK';
end
$p15c_pre$;

-- ---- extend admin_actions_action_check with tale.preview.create -------------
do $p15c_check$
declare
  v_def text;
  v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;

  if v_def like '%tale.preview.create%' then
    raise notice 'P.15c: tale.preview.create already present — skipping rebuild';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 then
    raise exception 'P.15c: unexpected admin_actions_action_check shape (need exactly one ARRAY[): %', v_def;
  end if;
  if v_def not like '%tap.start%' or v_def not like '%tale.update%' then
    raise exception 'P.15c: admin_actions_action_check missing sentinel value(s) — refusing to rebuild: %', v_def;
  end if;

  v_new := replace(v_def, 'ARRAY[', 'ARRAY[''tale.preview.create''::text, ');

  execute 'alter table public.admin_actions drop constraint admin_actions_action_check';
  execute 'alter table public.admin_actions add constraint admin_actions_action_check ' || v_new;

  raise notice 'P.15c: admin_actions_action_check extended with tale.preview.create';
end
$p15c_check$;

-- ---- fn_admin_log_tale_preview ----------------------------------------------
create or replace function public.fn_admin_log_tale_preview(
  p_actor       uuid,
  p_email       text,
  p_tale_id     uuid,
  p_tale_slug   text,
  p_expires_at  timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public, extensions
as $$
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
$$;

-- ---- grants ----------------------------------------------------------------
revoke execute on function public.fn_admin_log_tale_preview(uuid, text, uuid, text, timestamptz) from public;
revoke execute on function public.fn_admin_log_tale_preview(uuid, text, uuid, text, timestamptz) from anon;
revoke execute on function public.fn_admin_log_tale_preview(uuid, text, uuid, text, timestamptz) from authenticated;
grant  execute on function public.fn_admin_log_tale_preview(uuid, text, uuid, text, timestamptz) to service_role;

-- ---- postchecks ------------------------------------------------------------
do $p15c_post$
declare
  v_fn  record;
  v_def text;
  v_sig text := 'public.fn_admin_log_tale_preview(uuid, text, uuid, text, timestamptz)';
begin
  select p.prosecdef,
         array_to_string(coalesce(p.proconfig, array[]::text[]), ',') as config,
         p.prosrc
    into v_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_admin_log_tale_preview';
  if v_fn is null then
    raise exception 'P.15c postcheck: fn_admin_log_tale_preview missing';
  end if;
  if v_fn.prosecdef then
    raise exception 'P.15c postcheck: function is SECURITY DEFINER (expected INVOKER)';
  end if;
  if v_fn.config not like '%search_path=public, extensions%' then
    raise exception 'P.15c postcheck: search_path not locked (got %)', v_fn.config;
  end if;
  -- The audit payload must not carry a token key of any kind.
  if position('''token''' in v_fn.prosrc) > 0 or position('''preview_token''' in v_fn.prosrc) > 0 then
    raise exception 'P.15c postcheck: audit construction references a token key';
  end if;

  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'P.15c postcheck: service_role cannot execute %', v_sig;
  end if;
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'P.15c postcheck: anon can execute %', v_sig;
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'P.15c postcheck: authenticated can execute %', v_sig;
  end if;

  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;
  if v_def not like '%tale.preview.create%' then
    raise exception 'P.15c postcheck: allowlist missing tale.preview.create: %', v_def;
  end if;
  if v_def not like '%tap.start%' or v_def not like '%qr.create%' then
    raise exception 'P.15c postcheck: allowlist lost sentinel value(s): %', v_def;
  end if;

  raise notice 'P.15c POSTCHECK OK: tale.preview.create allowlisted; service_role-only audited log function; no token in audit construction';
end
$p15c_post$;

commit;
