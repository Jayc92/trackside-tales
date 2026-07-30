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
  v_fn         record;
  v_def        text;
  v_sig        text := 'public.fn_admin_log_tale_preview(uuid, text, uuid, text, timestamptz)';
  v_args_start int;
  v_args_end   int;
  v_args       text;
  v_parts      text[];
  v_idx        int;
  v_key        text;
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

  -- The audit payload must not carry a token KEY of any kind.
  --
  -- P.15c.1 correction: the original check scanned the ENTIRE source
  -- for the quoted literal 'token', which false-positived on the
  -- harmless payload VALUE in `'mode', 'token'` and rolled back the
  -- whole migration on first application. jsonb_build_object takes
  -- alternating key/value arguments, so we now parse the audit
  -- construction's argument list and reject forbidden literals only
  -- in KEY (odd) positions. Anything that defeats the simple parse —
  -- missing construction, nested parentheses, an odd argument count —
  -- fails CLOSED rather than silently passing.
  v_args_start := position('jsonb_build_object(' in v_fn.prosrc);
  if v_args_start = 0 then
    raise exception 'P.15c postcheck: no jsonb_build_object audit construction found';
  end if;
  v_args := substr(v_fn.prosrc, v_args_start + length('jsonb_build_object('));
  v_args_end := position(')' in v_args);
  if v_args_end = 0 then
    raise exception 'P.15c postcheck: unterminated audit construction';
  end if;
  v_args := substr(v_args, 1, v_args_end - 1);
  if position('(' in v_args) > 0 then
    -- A nested call would break the comma-split key/value alignment;
    -- fail closed so the check can never be silently defeated.
    raise exception 'P.15c postcheck: nested expression in audit arguments — cannot verify key positions';
  end if;
  v_parts := string_to_array(v_args, ',');
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) % 2 <> 0 then
    raise exception 'P.15c postcheck: unexpected audit argument shape (need alternating key/value pairs)';
  end if;
  for v_idx in 1..array_length(v_parts, 1) loop
    if v_idx % 2 = 1 then -- KEY position (1st, 3rd, 5th, …)
      v_key := btrim(v_parts[v_idx]);
      if v_key in ('''token''', '''preview_token''') then
        raise exception 'P.15c postcheck: forbidden audit payload KEY % — the preview token must never be audited', v_key;
      end if;
    end if;
  end loop;

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
