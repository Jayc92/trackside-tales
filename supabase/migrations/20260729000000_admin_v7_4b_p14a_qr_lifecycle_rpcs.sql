-- ============== ADMIN/SUPABASE-v7.4B.P.14a — audited QR lifecycle RPCs ==============
--
-- Adds the three operator QR lifecycle functions:
--
--   * fn_admin_create_qr — mint a high-entropy opaque code for one
--     published+active Tale (optional validity window and
--     campaign/batch metadata).
--   * fn_admin_rotate_qr — atomically revoke an active code and mint
--     its replacement with the same Tale association.
--   * fn_admin_revoke_qr — terminally revoke an active code
--     (status='revoked', is_active=false). Revoked is TERMINAL:
--     there is deliberately no reactivation function — a compromised
--     printed code must never come back; replacement is rotation.
--
-- Follows the established fn_admin_* conventions (v7.3 tap fns,
-- v7.4B.C/G/M families): SECURITY INVOKER, locked search_path,
-- EXECUTE revoked from public/anon/authenticated and granted only to
-- service_role, audit row written into public.admin_actions in the
-- SAME transaction as the data mutation, stable P000x errcodes for
-- the admin app's sanitized error mapping.
--
-- Token contract:
--   * code = 'tsqr_' || encode(gen_random_bytes(20), 'hex')
--     → 160 bits of CSPRNG entropy, 45 chars, hex (unambiguous,
--     URL/filename-safe). Never operator-supplied; never derived
--     from slug/timestamp/id/campaign/batch.
--   * The raw code appears ONLY in the create/rotate RETURN values.
--     It is never written to admin_actions payloads, never included
--     in exception text, and never selectable by client roles (the
--     P.13b lockdown keeps qr_codes service-role-only).
--   * qr_codes.code UNIQUE remains authoritative; minting retries a
--     bounded number of times on the (astronomically unlikely)
--     collision.
--
-- max_uses stays NULL on every row this migration's functions write:
-- the deployed validate-qr function fails closed on non-null
-- max_uses because no redemption ledger exists. Nothing here changes
-- that posture.
--
-- No table ALTER. No existing row is modified. The only DDL besides
-- the three functions is the admin_actions_action_check extension.
--
-- Errcodes raised (for src/lib/admin/mutations.ts mapping):
--   P0001 — tale missing / not published+active (create)
--   P0002 — QR row not found (rotate/revoke)
--   P0003 — QR row not active (rotate/revoke refuse non-active rows)
--   P0004 — reason required (rotate/revoke)
--   P0005 — invalid validity window (create)
--   P0006 — code mint failed after bounded retries (create/rotate)
--   P0007 — tale association unresolvable (rotate)
--
-- SUPABASE-v7.4B.P.13b.1 precedent: the file is EXPLICITLY wrapped in
-- begin/commit so atomicity holds whether it is applied via
-- `supabase db push` or pasted into the Supabase SQL Editor. Any
-- failed pre/postcheck aborts and rolls back everything.
--
-- APPLY: operator-gated. Review, then run manually. Safe to re-run:
-- prechecks pass, the allowlist step skips itself when qr.* values
-- are already present, functions are CREATE OR REPLACE, grants are
-- idempotent.

begin;

-- ---- prechecks -------------------------------------------------------------
do $p14a_pre$
declare
  v_missing_cols text := '';
  v_col text;
begin
  if to_regclass('public.qr_codes') is null then
    raise exception 'P.14a precheck: public.qr_codes does not exist';
  end if;
  if to_regclass('public.tales') is null then
    raise exception 'P.14a precheck: public.tales does not exist';
  end if;
  if to_regclass('public.admin_actions') is null then
    raise exception 'P.14a precheck: public.admin_actions does not exist';
  end if;

  -- Confirmed production qr_codes columns this migration depends on.
  foreach v_col in array array[
    'id','code','tale_id','tale_slug','status','is_active',
    'valid_from','valid_until','campaign_key','batch_key','max_uses',
    'created_at','updated_at'
  ] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='qr_codes'
         and column_name = v_col
    ) then
      v_missing_cols := v_missing_cols || ' ' || v_col;
    end if;
  end loop;
  if v_missing_cols <> '' then
    raise exception 'P.14a precheck: qr_codes missing column(s):%', v_missing_cols;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_actions_action_check'
       and conrelid = 'public.admin_actions'::regclass
  ) then
    raise exception 'P.14a precheck: admin_actions_action_check constraint missing';
  end if;

  -- pgcrypto's gen_random_bytes must resolve from public or
  -- extensions (Supabase installs pgcrypto into either depending on
  -- project vintage — the functions below set search_path to cover
  -- both trusted schemas).
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'gen_random_bytes'
       and n.nspname in ('public', 'extensions')
  ) then
    raise exception 'P.14a precheck: gen_random_bytes (pgcrypto) not found in public/extensions';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'P.14a precheck: service_role role missing';
  end if;

  raise notice 'P.14a PRECHECK OK';
end
$p14a_pre$;

-- ---- extend admin_actions_action_check with qr.* ---------------------------
-- DELIBERATE deviation from the literal-list rebuild used by earlier
-- migrations: production's allowlist has been extended across many
-- gates (tap/beer/food/tale/media/admin families) and a hardcoded
-- rebuild would silently drop any value this repo doesn't know about.
-- Instead we read the LIVE constraint definition and inject the three
-- qr.* values into its ARRAY list, preserving everything already
-- there. ADD CONSTRAINT re-validates existing rows, so a mangled
-- definition fails loudly and rolls back.
do $p14a_check$
declare
  v_def text;
  v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;

  if v_def like '%qr.create%' and v_def like '%qr.rotate%' and v_def like '%qr.revoke%' then
    raise notice 'P.14a: qr.* values already present in admin_actions_action_check — skipping rebuild';
    return;
  end if;

  -- Expected normalized shape: CHECK ((action = ANY (ARRAY['…'::text, …])))
  if (length(v_def) - length(replace(v_def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 then
    raise exception 'P.14a: unexpected admin_actions_action_check shape (need exactly one ARRAY[): %', v_def;
  end if;
  if v_def not like '%tap.start%' then
    raise exception 'P.14a: admin_actions_action_check missing sentinel tap.start — refusing to rebuild: %', v_def;
  end if;

  v_new := replace(
    v_def,
    'ARRAY[',
    'ARRAY[''qr.create''::text, ''qr.rotate''::text, ''qr.revoke''::text, '
  );

  execute 'alter table public.admin_actions drop constraint admin_actions_action_check';
  execute 'alter table public.admin_actions add constraint admin_actions_action_check ' || v_new;

  raise notice 'P.14a: admin_actions_action_check extended with qr.create / qr.rotate / qr.revoke';
end
$p14a_check$;

-- ---- fn_admin_create_qr -----------------------------------------------------
create or replace function public.fn_admin_create_qr(
  p_actor         uuid,
  p_email         text,
  p_tale_slug     text,
  p_valid_from    timestamptz,
  p_valid_until   timestamptz,
  p_campaign_key  text,
  p_batch_key     text
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
-- `extensions` appended to the usual `public` so gen_random_bytes
-- resolves regardless of which trusted schema hosts pgcrypto.
set search_path = public, extensions
as $$
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
$$;

-- ---- fn_admin_rotate_qr -----------------------------------------------------
create or replace function public.fn_admin_rotate_qr(
  p_actor   uuid,
  p_email   text,
  p_qr_id   uuid,
  p_reason  text
)
returns table (
  old_qr_id    uuid,
  new_qr_id    uuid,
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
  insert into public.admin_actions
    (actor_id, actor_email, action, target_kind, target_key, payload)
  values
    (p_actor, p_email, 'qr.rotate', 'qr_codes', v_old.id::text,
     jsonb_build_object(
       'old_qr_id',    v_old.id,
       'new_qr_id',    v_new_id,
       'tale_id',      v_tale_id,
       'tale_slug',    v_tale_slug,
       'old_status',   'active',
       'new_status',   'revoked',
       'reason',       v_reason,
       'valid_from',   v_old.valid_from,
       'valid_until',  v_old.valid_until,
       'campaign_key', v_old.campaign_key,
       'batch_key',    v_old.batch_key
     ));

  return query select v_old.id, v_new_id, v_code, v_tale_slug,
                      v_old.valid_from, v_old.valid_until;
end;
$$;

-- ---- fn_admin_revoke_qr -----------------------------------------------------
create or replace function public.fn_admin_revoke_qr(
  p_actor   uuid,
  p_email   text,
  p_qr_id   uuid,
  p_reason  text
)
returns table (
  qr_id         uuid,
  tale_slug     text,
  prior_status  text,
  new_status    text
)
language plpgsql
security invoker
set search_path = public, extensions
as $$
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
$$;

-- ---- grants ----------------------------------------------------------------
-- Same posture as every fn_admin_*: service_role only.
revoke execute on function public.fn_admin_create_qr(uuid, text, text, timestamptz, timestamptz, text, text) from public;
revoke execute on function public.fn_admin_create_qr(uuid, text, text, timestamptz, timestamptz, text, text) from anon;
revoke execute on function public.fn_admin_create_qr(uuid, text, text, timestamptz, timestamptz, text, text) from authenticated;
grant  execute on function public.fn_admin_create_qr(uuid, text, text, timestamptz, timestamptz, text, text) to service_role;

revoke execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) from public;
revoke execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) from anon;
revoke execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) from authenticated;
grant  execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) to service_role;

revoke execute on function public.fn_admin_revoke_qr(uuid, text, uuid, text) from public;
revoke execute on function public.fn_admin_revoke_qr(uuid, text, uuid, text) from anon;
revoke execute on function public.fn_admin_revoke_qr(uuid, text, uuid, text) from authenticated;
grant  execute on function public.fn_admin_revoke_qr(uuid, text, uuid, text) to service_role;

-- ---- postchecks ------------------------------------------------------------
do $p14a_post$
declare
  v_fn          record;
  v_def         text;
  v_src         text;
  v_audit_pos   int;
  v_return_pos  int;
  v_sig         text;
begin
  -- All three functions present, SECURITY INVOKER, locked search_path.
  for v_fn in
    select p.proname, p.pronargs, p.prosecdef,
           array_to_string(coalesce(p.proconfig, array[]::text[]), ',') as config,
           p.prosrc,
           p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_admin_create_qr', 'fn_admin_rotate_qr', 'fn_admin_revoke_qr')
  loop
    if v_fn.prosecdef then
      raise exception 'P.14a postcheck: % is SECURITY DEFINER (expected INVOKER)', v_fn.proname;
    end if;
    if v_fn.config not like '%search_path=public, extensions%' then
      raise exception 'P.14a postcheck: % search_path not locked to public, extensions (got %)',
        v_fn.proname, v_fn.config;
    end if;

    -- The audit INSERT (between 'admin_actions' and the final
    -- 'return query') must not reference v_code — the raw secret
    -- never enters an audit payload.
    v_src := v_fn.prosrc;
    v_audit_pos := position('admin_actions' in v_src);
    if v_audit_pos = 0 then
      raise exception 'P.14a postcheck: % writes no audit row', v_fn.proname;
    end if;
    v_return_pos := position('return query' in substr(v_src, v_audit_pos));
    if v_return_pos = 0 then
      v_return_pos := length(v_src) - v_audit_pos + 1;
    end if;
    if position('v_code' in substr(v_src, v_audit_pos, v_return_pos)) > 0 then
      raise exception 'P.14a postcheck: % audit construction references v_code (raw secret!)', v_fn.proname;
    end if;
  end loop;

  if (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public'
         and p.proname in ('fn_admin_create_qr','fn_admin_rotate_qr','fn_admin_revoke_qr')) <> 3 then
    raise exception 'P.14a postcheck: expected exactly 3 qr lifecycle functions';
  end if;

  -- Grants: service_role yes; public/anon/authenticated no.
  foreach v_sig in array array[
    'public.fn_admin_create_qr(uuid, text, text, timestamptz, timestamptz, text, text)',
    'public.fn_admin_rotate_qr(uuid, text, uuid, text)',
    'public.fn_admin_revoke_qr(uuid, text, uuid, text)'
  ] loop
    if not has_function_privilege('service_role', v_sig, 'execute') then
      raise exception 'P.14a postcheck: service_role cannot execute %', v_sig;
    end if;
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception 'P.14a postcheck: anon can execute %', v_sig;
    end if;
    if has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'P.14a postcheck: authenticated can execute %', v_sig;
    end if;
  end loop;

  -- Allowlist must now contain all three qr.* values plus a sentinel.
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;
  if v_def is null then
    raise exception 'P.14a postcheck: admin_actions_action_check vanished';
  end if;
  if v_def not like '%qr.create%' or v_def not like '%qr.rotate%' or v_def not like '%qr.revoke%' then
    raise exception 'P.14a postcheck: allowlist missing qr.* value(s): %', v_def;
  end if;
  if v_def not like '%tap.start%' then
    raise exception 'P.14a postcheck: allowlist lost sentinel tap.start: %', v_def;
  end if;

  raise notice 'P.14a POSTCHECK OK: 3 SECURITY INVOKER functions, service_role-only EXECUTE, allowlist extended, no raw code in audit construction';
end
$p14a_post$;

commit;
