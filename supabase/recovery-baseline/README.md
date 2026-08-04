# Trackside — Canonical Recovery Baseline (P.24a)

**`production-public-schema-20260804.sql` is a schema-only snapshot of
the production `public` schema, captured 2026-08-04.**

> ## ⚠️ NEVER apply this file to the existing production project
> (`uuuugwfkequtgytwuuat`). Every object in it already exists there —
> applying it would fail at best and destroy grants/policies at worst.
> It exists **only** for blank recovery targets: a fresh Supabase
> project or a disposable local stack.

## Why this exists

The P.24 restore drill proved the 28 historical migration files cannot
rebuild production from a blank database (replay fails at 6/28; the
earliest three migrations are an idealized v6 bootstrap, and
production's own migration registry stops at 2026-06-29 because all
later SQL was operator-applied via the SQL Editor). This baseline is
the deterministic replacement: **baseline + any migrations dated after
2026-08-04 = current schema.**

## Recovery architecture (selected in P.24a: squashed baseline)

* **Baseline (this directory):** full `public` schema as of the cutoff
  — tables, constraints, sequences, views (incl. `security_invoker`),
  all 31 functions verbatim (incl. `SECURITY DEFINER` + pinned
  `search_path` posture), 49 standalone indexes, RLS enablement on all
  18 tables, the exact 11 production policies, the exact
  anon/authenticated/service_role grant matrix, and the 11 reviewed
  table comments.
* **Historical migrations (both repos):** provenance only. Marked
  historical/apply-once in `migration-manifest.json`. Never replay
  them onto this baseline or onto production.
* **Future migrations:** dated after the cutoff, live in
  `supabase/migrations/` as usual, apply on top of the baseline in a
  recovery. This directory is outside `supabase/migrations/`, so
  `supabase migration up` / `db push` can never pick the baseline up.

## Verified (2026-08-04)

Applied to a blank disposable local Supabase Postgres in a single
transaction, **zero errors, zero manual corrections**. Field-level
catalog diff against production: **100% parity** across tables (18),
columns (166), constraints (66), indexes (49), views (9), functions
(31, byte-identical definitions), function grants (93), table grants
(489), policies (11), sequences, comments, triggers (0). A post-cutoff
test migration then applied with deterministic ordering.

## How to recover onto a blank target

1. Create the blank target (new Supabase project, or
   `supabase init` + `supabase db start` in an empty directory).
2. Apply the baseline with the guarded helper — run it with **no
   arguments**; it prompts for the connection string with hidden
   input (P.24a.1: the URL must never appear on a command line,
   because argv leaks into shell history and process listings):

   ```
   ./restore-to-blank-target.sh
   ```

   The helper refuses production identifiers, shows only the parsed
   target host, requires a typed confirmation phrase, and hands the
   secret to psql via the environment so it never enters any argv.
   If you must use bare `psql` instead, supply the connection through
   libpq component environment variables (never as a psql argument —
   and note libpq does *not* expand a URL placed in `PGDATABASE`):
   `PGHOST=… PGPORT=… PGUSER=… PGPASSWORD=… PGDATABASE=… psql -v ON_ERROR_STOP=1 -f production-public-schema-20260804.sql`
   set them in an interactive shell that does not persist the values.
3. Apply any migrations dated after `2026-08-04` from
   `supabase/migrations/`, in filename order.
4. Restore data from the most recent logical backup (separate
   artifact — this file contains **no data**).
5. Recreate platform config that is not in SQL (see Exclusions).

## Exclusions — recover separately

* **All data rows** (content, drafts, qr_codes, admin_actions, …) —
  from a logical backup or platform backup.
* **Auth users / MFA factors** — platform backup, or re-invite +
  re-enroll (note: `admin_actions.actor_id` FKs `auth.users`, so Auth
  must restore before audit data).
* **Storage** — the `media` bucket is dashboard-created (public,
  5 MiB limit); object blobs are never in database backups.
* **Edge Functions** (`validate-qr`, `preview-tale`) — deploy from
  this repo: `supabase functions deploy <name>`.
* **Secrets / SMTP / DNS / Vercel env** — provider dashboards. The
  preview HMAC key is derived from the service-role key; no separate
  secret exists.
* **Platform defaults** — `pg_stat_statements`, `supabase_vault`,
  realtime publication: present on any new project; deliberately not
  in the baseline.

## Transformation log (raw capture → this file)

The raw capture was read-only Management-API catalog queries (never a
credentialed pg_dump; the DB password was not used). Transformations:

1. Assembled DDL from catalogs (`pg_get_constraintdef`,
   `pg_get_functiondef`, `pg_indexes.indexdef`, `pg_views.definition`,
   `pg_policies`) — function bodies are verbatim.
2. Excluded platform-managed objects: `supabase_realtime` publication,
   `supabase_vault`/`pg_stat_statements`/`plpgsql` extensions,
   `supabase_migrations` registry, all non-`public` schemas.
3. Normalized ownership: no `ALTER ... OWNER` statements (objects are
   owned by the applying role; production ACL strings that embed the
   owner role are represented as explicit revoke/grant pairs instead).
4. Grants emitted as deterministic revoke-then-grant per
   (object, role) for `anon`/`authenticated`/`service_role`, matching
   the captured matrix exactly.
5. Retained deliberately (faithful production state, flagged for a
   future hardening gate — do NOT "fix" silently in a recovery):
   the four legacy `demo_*` anon-write policies on
   `guest_badges`/`guest_profiles`/`guest_scan_events`/`guest_unlocks`;
   anon EXECUTE on the three `fn_tap_*` functions (SECURITY INVOKER —
   RLS blocks actual writes); content read policies filtering only
   `is_active` (the public app adds `status=eq.published` in queries).
6. Secret review: zero credentials, tokens, JWTs, emails, QR values,
   or UUID literals (verified by pattern scan; comments reviewed
   individually — documentation only).

## Files

* `production-public-schema-20260804.sql` — the baseline.
* `migration-manifest.json` — all 28 historical migration files
  (both repos), SHA-256, production-registry status, cutoff.
* `restore-to-blank-target.sh` — guarded apply helper (no-argument,
  hidden-prompt interface; refuses production identifiers; keeps the
  connection string out of argv, history, and process listings).
