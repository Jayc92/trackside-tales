-- ========= ADMIN/SUPABASE-v7.4B.P.14b — qr.rotate audit semantics cleanup =========
--
-- The P.14a fn_admin_rotate_qr audit payload wrote:
--
--     old_status = 'active', new_status = 'revoked'
--
-- Those keys describe the OLD row's transition, but the same payload
-- also carries new_qr_id — so a reader can reasonably misread
-- new_status as the REPLACEMENT row's status (the replacement is in
-- fact minted 'active'). This migration renames the audit keys so the
-- three statuses are unambiguous:
--
--     old_qr_id             (unchanged)
--     replacement_qr_id     (was: new_qr_id)
--     old_prior_status      = 'active'   (was: old_status)
--     old_resulting_status  = 'revoked'  (was: new_status)
--     replacement_status    = 'active'   (NEW — explicit)
--
-- plus the unchanged tale_id / tale_slug / reason / valid_from /
-- valid_until / campaign_key / batch_key fields. As before, the raw
-- code NEVER enters the payload.
--
-- Scope: CREATE OR REPLACE of fn_admin_rotate_qr ONLY, changing ONLY
-- the jsonb_build_object keys in the audit INSERT. Everything else is
-- byte-identical to P.14a: reason required (P0004), FOR UPDATE
-- locking, active-only rotation (P0003), revoked-terminal posture,
-- dual tale_slug/tale_id normalization (P0007 when unresolvable), old
-- row revoked + replacement inserted active in one transaction,
-- validity window + campaign/batch carried, max_uses NULL, 160-bit
-- tsqr_ token minting with bounded unique retry (P0006), one audit
-- row, same RETURNS TABLE signature (the return column name new_qr_id
-- is intentionally kept — the admin app's mutations read it, and a
-- return-signature change is out of scope; only the AUDIT keys were
-- ambiguous).
--
-- Historical admin_actions rows written by P.14a keep the old key
-- names — audit history is never rewritten. The admin audit page
-- renders payload JSON generically, so both shapes display correctly;
-- the runbook documents the field-name difference.
--
-- No table ALTER. No row mutation on application. Idempotent: safe to
-- re-run (CREATE OR REPLACE + idempotent grants + read-only checks).
--
-- Explicit begin/commit (P.13b.1 precedent): atomicity holds whether
-- this is applied via `supabase db push` or pasted into the Supabase
-- SQL Editor; any failed pre/postcheck aborts and rolls back.
--
-- APPLY: operator-gated, after review, via SQL Editor.

begin;

-- ---- prechecks -------------------------------------------------------------
do $p14b_pre$
begin
  if to_regclass('public.qr_codes') is null then
    raise exception 'P.14b precheck: public.qr_codes does not exist';
  end if;
  if to_regclass('public.tales') is null then
    raise exception 'P.14b precheck: public.tales does not exist';
  end if;
  if to_regclass('public.admin_actions') is null then
    raise exception 'P.14b precheck: public.admin_actions does not exist';
  end if;

  -- The P.14a function (same 4-arg signature) must already exist —
  -- this migration is a correction, not an initial install.
  if to_regprocedure('public.fn_admin_rotate_qr(uuid, text, uuid, text)') is null then
    raise exception 'P.14b precheck: fn_admin_rotate_qr(uuid, text, uuid, text) not found — apply the P.14a migration first';
  end if;

  -- qr.rotate must already be in the audit allowlist (P.14a step).
  if (select pg_get_constraintdef(oid)
        from pg_constraint
       where conname = 'admin_actions_action_check'
         and conrelid = 'public.admin_actions'::regclass) not like '%qr.rotate%' then
    raise exception 'P.14b precheck: admin_actions_action_check missing qr.rotate — apply the P.14a migration first';
  end if;

  raise notice 'P.14b PRECHECK OK';
end
$p14b_pre$;

-- ---- fn_admin_rotate_qr (audit-key correction only) -------------------------
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
$$;

-- ---- grants (re-asserted; CREATE OR REPLACE preserves ACLs, this is
-- ---- belt-and-suspenders and idempotent) ------------------------------------
revoke execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) from public;
revoke execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) from anon;
revoke execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) from authenticated;
grant  execute on function public.fn_admin_rotate_qr(uuid, text, uuid, text) to service_role;

-- ---- postchecks ------------------------------------------------------------
do $p14b_post$
declare
  v_fn          record;
  v_src         text;
  v_audit_pos   int;
  v_return_pos  int;
  v_sig         text := 'public.fn_admin_rotate_qr(uuid, text, uuid, text)';
  v_key         text;
begin
  select p.prosecdef,
         array_to_string(coalesce(p.proconfig, array[]::text[]), ',') as config,
         p.prosrc
    into v_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'fn_admin_rotate_qr';
  if v_fn is null then
    raise exception 'P.14b postcheck: fn_admin_rotate_qr missing';
  end if;
  if v_fn.prosecdef then
    raise exception 'P.14b postcheck: fn_admin_rotate_qr is SECURITY DEFINER (expected INVOKER)';
  end if;
  if v_fn.config not like '%search_path=public, extensions%' then
    raise exception 'P.14b postcheck: search_path not locked to public, extensions (got %)', v_fn.config;
  end if;

  v_src := v_fn.prosrc;

  -- Corrected audit keys must be present (as quoted jsonb key
  -- literals in the source).
  foreach v_key in array array[
    '''replacement_qr_id''',
    '''old_prior_status''',
    '''old_resulting_status''',
    '''replacement_status'''
  ] loop
    if position(v_key in v_src) = 0 then
      raise exception 'P.14b postcheck: audit construction missing key %', v_key;
    end if;
  end loop;

  -- Deprecated ambiguous keys must be absent AS QUOTED JSONB KEY
  -- LITERALS. The quoted form is deliberate: the UNQUOTED identifier
  -- new_qr_id legitimately remains as a RETURNS TABLE column name
  -- (signature unchanged), and a bare substring check could also
  -- false-positive elsewhere; only the quoted literal form can be a
  -- payload key. ('new_qr_id' is not a substring of
  -- 'replacement_qr_id', so no false match in either direction.)
  foreach v_key in array array[
    '''old_status''',
    '''new_status''',
    '''new_qr_id'''
  ] loop
    if position(v_key in v_src) > 0 then
      raise exception 'P.14b postcheck: deprecated audit key % still present in source', v_key;
    end if;
  end loop;

  -- The audit INSERT (between 'admin_actions' and the final 'return
  -- query') must not reference v_code — the raw secret never enters
  -- an audit payload. Same check shape as the P.14a postcheck.
  v_audit_pos := position('admin_actions' in v_src);
  if v_audit_pos = 0 then
    raise exception 'P.14b postcheck: fn_admin_rotate_qr writes no audit row';
  end if;
  v_return_pos := position('return query' in substr(v_src, v_audit_pos));
  if v_return_pos = 0 then
    v_return_pos := length(v_src) - v_audit_pos + 1;
  end if;
  if position('v_code' in substr(v_src, v_audit_pos, v_return_pos)) > 0 then
    raise exception 'P.14b postcheck: audit construction references v_code (raw secret!)';
  end if;

  -- Privilege matrix unchanged: service_role yes; client roles no.
  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception 'P.14b postcheck: service_role cannot execute %', v_sig;
  end if;
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception 'P.14b postcheck: anon can execute %', v_sig;
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception 'P.14b postcheck: authenticated can execute %', v_sig;
  end if;

  raise notice 'P.14b POSTCHECK OK: fn_admin_rotate_qr replaced — corrected audit keys present, deprecated keys absent, SECURITY INVOKER, locked search_path, service_role-only EXECUTE, no raw code in audit construction';
end
$p14b_post$;

commit;
