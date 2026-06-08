-- ============================================================
-- Trackside Tales — admin user-management RPCs
-- (ADMIN-v7.4B.G.1 — schema_migrations version 20260608000000)
--
-- Why this exists:
--   v7.4B.G adds an in-app admin user management surface
--   (/admin/users) so staff don't need Supabase Dashboard access
--   to invite, promote, demote, disable, or enable admin users.
--   The admin app calls Supabase's auth.admin.* HTTPS API to
--   mutate auth.users, then calls these RPCs to record an
--   audit row in public.admin_actions. SQL never mutates
--   auth.users — that's an HTTPS-only path.
--
-- What's new:
--   1. admin_actions.action CHECK constraint expanded to admit
--      5 new values (admin.invite / admin.promote / admin.demote /
--      admin.disable / admin.enable) alongside the existing 9
--      (tap.* + beer.* + food.*).
--
--   2. Five INSERT-only audit-log functions, one per new action
--      value. Each writes a single admin_actions row with a
--      fixed action and a structured payload. They do NOT mutate
--      auth.users — that's done by the admin app via Supabase's
--      auth.admin.* API before these RPCs are called.
--
--   3. One read-only counting function (fn_admin_count_admins)
--      used by the admin app's last-admin safety guard. Counts
--      auth.users rows where raw_app_meta_data->>'role'='admin'
--      AND (banned_until is null OR banned_until <= now()).
--      "Active admins only" — banned admins do not count, since a
--      tool with only banned admins is already locked out.
--
--   4. EXECUTE grants for all 6 functions are revoked from
--      public/anon/authenticated and granted only to service_role.
--
-- HARD CONSTRAINTS:
--   * No mutation of auth.users from SQL. The Supabase auth.admin.*
--     HTTPS API is the only path that touches auth.users in
--     v7.4B.G; these RPCs are audit-log-only (insert into
--     admin_actions) plus one read-only count.
--   * Idempotent: every DDL uses IF EXISTS / OR REPLACE / DO-block
--     guards. Re-running on a fully-applied database is a no-op.
--   * No new RLS policies. admin_actions already has its v7.3
--     RLS posture; new rows inherit it.
--   * Functions use security invoker so the caller's permissions
--     apply. The EXECUTE grant restriction (service_role only)
--     is the access boundary; even a leaked grant would fail at
--     auth.users SELECT for fn_admin_count_admins because
--     non-service-role lacks that grant.
--   * Self-demotion / self-disable protection is enforced in the
--     admin app's Server Action (G.3), NOT in SQL. The application
--     layer compares target_user_id against the actor's id from
--     requireAdmin(); SQL doesn't have a clean way to know "the
--     actor's identity" beyond what's passed as a parameter
--     (which the application could spoof without the Server Action
--     guard). Defense-in-depth: the guard in G.3 is the only
--     thing protecting against self-demotion regardless.
--   * Last-admin protection is also enforced in the admin app's
--     Server Action. SQL provides fn_admin_count_admins as the
--     read primitive; the policy ("refuse if count <= 1") lives
--     in JS where it can return a clean error message to the
--     admin user.
--   * Apply path: Supabase Dashboard SQL Editor only, not CLI
--     (CLI blocked by corporate Zscaler TLS interception).
--
-- Errcodes raised:
--   * Preflight raises plain `raise exception` if expected pre-
--     state is missing — these abort the migration cleanly.
--   * The 5 audit-log functions don't raise application errors.
--     They will surface Postgres errors (23514 if the CHECK
--     constraint is somehow bypassed, 23505 only if a uniqueness
--     constraint exists on admin_actions which it doesn't today).
--     Admin app maps these via sanitizeRpcError.
--   * fn_admin_count_admins doesn't raise; returns 0 if no admins
--     match (which would indicate a misconfigured allowlist).
--
-- Rollback (full unwind):
--   begin;
--   alter table public.admin_actions
--     drop constraint if exists admin_actions_action_check;
--   alter table public.admin_actions
--     add constraint admin_actions_action_check
--     check (action in (
--       'tap.start', 'tap.end', 'tap.edit_notes',
--       'beer.create', 'beer.update', 'beer.archive',
--       'food.create', 'food.update', 'food.archive'
--     ));
--   drop function if exists public.fn_admin_log_invite(uuid, text, text, text);
--   drop function if exists public.fn_admin_log_promote(uuid, text, uuid, text, text);
--   drop function if exists public.fn_admin_log_demote(uuid, text, uuid, text, text);
--   drop function if exists public.fn_admin_log_disable(uuid, text, uuid, text, text, text);
--   drop function if exists public.fn_admin_log_enable(uuid, text, uuid, text, text);
--   drop function if exists public.fn_admin_count_admins();
--   delete from supabase_migrations.schema_migrations where version='20260608000000';
--   commit;
--
--   CAVEAT: any admin_actions rows already written with admin.*
--   values would block the original 9-value CHECK from re-adding.
--   If genuine rollback is needed, also:
--     delete from admin_actions where action like 'admin.%';
--   The audit trail loses those rows; admin staff lose history.
--   Don't roll back unless absolutely necessary.
-- ============================================================

begin;

do $bgg_pre$
declare
  v_admin_actions_present  boolean;
  v_action_check_present   boolean;
  v_service_role_present   boolean;
  v_auth_users_present     boolean;
begin
  select exists(
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relname='admin_actions'
       and c.relkind='r'
  ) into v_admin_actions_present;

  select exists(
    select 1 from pg_constraint
     where conname='admin_actions_action_check'
       and conrelid = 'public.admin_actions'::regclass
  ) into v_action_check_present;

  select exists(
    select 1 from pg_roles where rolname='service_role'
  ) into v_service_role_present;

  select exists(
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='auth' and c.relname='users'
       and c.relkind='r'
  ) into v_auth_users_present;

  if not v_admin_actions_present then
    raise exception 'PREFLIGHT FAILED: public.admin_actions table missing (v7.3 not applied?)';
  end if;
  if not v_action_check_present then
    raise exception 'PREFLIGHT FAILED: admin_actions_action_check constraint missing (v7.4B.C.1 not applied?)';
  end if;
  if not v_service_role_present then
    raise exception 'PREFLIGHT FAILED: service_role does not exist (unusual Supabase environment?)';
  end if;
  if not v_auth_users_present then
    raise exception 'PREFLIGHT FAILED: auth.users table missing (unusual Supabase environment?)';
  end if;

  raise notice
    'PREFLIGHT OK: admin_actions present, action CHECK present, service_role present, auth.users present';
end
$bgg_pre$;

alter table public.admin_actions
  drop constraint if exists admin_actions_action_check;

alter table public.admin_actions
  add constraint admin_actions_action_check
  check (action in (
    'tap.start',
    'tap.end',
    'tap.edit_notes',
    'beer.create',
    'beer.update',
    'beer.archive',
    'food.create',
    'food.update',
    'food.archive',
    'admin.invite',
    'admin.promote',
    'admin.demote',
    'admin.disable',
    'admin.enable'
  ));

create or replace function public.fn_admin_log_invite(
  p_actor          uuid,
  p_email          text,
  p_target_email   text,
  p_invited_role   text
)
returns void
language plpgsql
security invoker
set search_path = public
as $body$
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
$body$;

create or replace function public.fn_admin_log_promote(
  p_actor          uuid,
  p_email          text,
  p_target_user_id uuid,
  p_target_email   text,
  p_before_role    text
)
returns void
language plpgsql
security invoker
set search_path = public
as $body$
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
$body$;

create or replace function public.fn_admin_log_demote(
  p_actor          uuid,
  p_email          text,
  p_target_user_id uuid,
  p_target_email   text,
  p_before_role    text
)
returns void
language plpgsql
security invoker
set search_path = public
as $body$
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
$body$;

create or replace function public.fn_admin_log_disable(
  p_actor          uuid,
  p_email          text,
  p_target_user_id uuid,
  p_target_email   text,
  p_reason         text,
  p_ban_duration   text
)
returns void
language plpgsql
security invoker
set search_path = public
as $body$
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
$body$;

create or replace function public.fn_admin_log_enable(
  p_actor                  uuid,
  p_email                  text,
  p_target_user_id         uuid,
  p_target_email           text,
  p_ban_duration_before    text
)
returns void
language plpgsql
security invoker
set search_path = public
as $body$
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
$body$;

create or replace function public.fn_admin_count_admins()
returns integer
language sql
security invoker
set search_path = public, auth
stable
as $body$
  select count(*)::integer
    from auth.users
   where raw_app_meta_data->>'role' = 'admin'
     and (banned_until is null or banned_until <= now());
$body$;

revoke execute on function public.fn_admin_log_invite(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.fn_admin_log_promote(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.fn_admin_log_demote(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.fn_admin_log_disable(uuid, text, uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.fn_admin_log_enable(uuid, text, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.fn_admin_count_admins()
  from public, anon, authenticated;

grant execute on function public.fn_admin_log_invite(uuid, text, text, text)
  to service_role;
grant execute on function public.fn_admin_log_promote(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.fn_admin_log_demote(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.fn_admin_log_disable(uuid, text, uuid, text, text, text)
  to service_role;
grant execute on function public.fn_admin_log_enable(uuid, text, uuid, text, text)
  to service_role;
grant execute on function public.fn_admin_count_admins()
  to service_role;

do $bgg_post$
declare
  v_check_def         text;
  v_log_invite_oid    oid;
  v_log_promote_oid   oid;
  v_log_demote_oid    oid;
  v_log_disable_oid   oid;
  v_log_enable_oid    oid;
  v_count_admins_oid  oid;
  v_bad_grants        integer;
begin
  select pg_get_constraintdef(oid)
    into v_check_def
    from pg_constraint
   where conname = 'admin_actions_action_check'
     and conrelid = 'public.admin_actions'::regclass;
  if v_check_def is null then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check vanished';
  end if;
  if v_check_def !~ 'admin\.invite' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing admin.invite: %', v_check_def;
  end if;
  if v_check_def !~ 'admin\.promote' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing admin.promote: %', v_check_def;
  end if;
  if v_check_def !~ 'admin\.demote' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing admin.demote: %', v_check_def;
  end if;
  if v_check_def !~ 'admin\.disable' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing admin.disable: %', v_check_def;
  end if;
  if v_check_def !~ 'admin\.enable' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check missing admin.enable: %', v_check_def;
  end if;
  if v_check_def !~ 'tap\.start' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check lost tap.start: %', v_check_def;
  end if;
  if v_check_def !~ 'beer\.create' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check lost beer.create: %', v_check_def;
  end if;
  if v_check_def !~ 'food\.create' then
    raise exception 'POSTCHECK FAILED: admin_actions_action_check lost food.create: %', v_check_def;
  end if;

  select to_regprocedure('public.fn_admin_log_invite(uuid, text, text, text)')
    into v_log_invite_oid;
  if v_log_invite_oid is null then
    raise exception 'POSTCHECK FAILED: public.fn_admin_log_invite not created';
  end if;

  select to_regprocedure('public.fn_admin_log_promote(uuid, text, uuid, text, text)')
    into v_log_promote_oid;
  if v_log_promote_oid is null then
    raise exception 'POSTCHECK FAILED: public.fn_admin_log_promote not created';
  end if;

  select to_regprocedure('public.fn_admin_log_demote(uuid, text, uuid, text, text)')
    into v_log_demote_oid;
  if v_log_demote_oid is null then
    raise exception 'POSTCHECK FAILED: public.fn_admin_log_demote not created';
  end if;

  select to_regprocedure('public.fn_admin_log_disable(uuid, text, uuid, text, text, text)')
    into v_log_disable_oid;
  if v_log_disable_oid is null then
    raise exception 'POSTCHECK FAILED: public.fn_admin_log_disable not created';
  end if;

  select to_regprocedure('public.fn_admin_log_enable(uuid, text, uuid, text, text)')
    into v_log_enable_oid;
  if v_log_enable_oid is null then
    raise exception 'POSTCHECK FAILED: public.fn_admin_log_enable not created';
  end if;

  select to_regprocedure('public.fn_admin_count_admins()')
    into v_count_admins_oid;
  if v_count_admins_oid is null then
    raise exception 'POSTCHECK FAILED: public.fn_admin_count_admins not created';
  end if;

  select count(*) into v_bad_grants
  from (
    values
      ('anon',          v_log_invite_oid),
      ('authenticated', v_log_invite_oid),
      ('anon',          v_log_promote_oid),
      ('authenticated', v_log_promote_oid),
      ('anon',          v_log_demote_oid),
      ('authenticated', v_log_demote_oid),
      ('anon',          v_log_disable_oid),
      ('authenticated', v_log_disable_oid),
      ('anon',          v_log_enable_oid),
      ('authenticated', v_log_enable_oid),
      ('anon',          v_count_admins_oid),
      ('authenticated', v_count_admins_oid)
  ) as t(role_name, fn_oid)
  where has_function_privilege(role_name, fn_oid, 'EXECUTE');

  if v_bad_grants > 0 then
    raise exception
      'POSTCHECK FAILED: % unexpected EXECUTE grant(s) on v7.4B.G.1 functions to anon/authenticated',
      v_bad_grants;
  end if;

  if not has_function_privilege('service_role', v_log_invite_oid,   'EXECUTE') then
    raise exception 'POSTCHECK FAILED: service_role missing EXECUTE on fn_admin_log_invite';
  end if;
  if not has_function_privilege('service_role', v_log_promote_oid,  'EXECUTE') then
    raise exception 'POSTCHECK FAILED: service_role missing EXECUTE on fn_admin_log_promote';
  end if;
  if not has_function_privilege('service_role', v_log_demote_oid,   'EXECUTE') then
    raise exception 'POSTCHECK FAILED: service_role missing EXECUTE on fn_admin_log_demote';
  end if;
  if not has_function_privilege('service_role', v_log_disable_oid,  'EXECUTE') then
    raise exception 'POSTCHECK FAILED: service_role missing EXECUTE on fn_admin_log_disable';
  end if;
  if not has_function_privilege('service_role', v_log_enable_oid,   'EXECUTE') then
    raise exception 'POSTCHECK FAILED: service_role missing EXECUTE on fn_admin_log_enable';
  end if;
  if not has_function_privilege('service_role', v_count_admins_oid, 'EXECUTE') then
    raise exception 'POSTCHECK FAILED: service_role missing EXECUTE on fn_admin_count_admins';
  end if;

  raise notice
    'POSTCHECK OK: ADMIN-v7.4B.G.1 — admin_actions CHECK extended (14 values), 5 audit-log RPCs created, fn_admin_count_admins created, EXECUTE grants restricted to service_role';
end
$bgg_post$;

commit;
