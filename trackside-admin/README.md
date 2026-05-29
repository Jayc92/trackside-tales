# Trackside Tales — Admin Portal

Private admin portal for Trackside Tales. **Not for customer use.**

This is the admin/back-office companion to the public Vite SPA. For
v7.0–v7.3 the admin scaffold lives nested inside the public-app repo
at `trackside-app/trackside-admin/` for cheap iteration; it will be
extracted to its own private GitHub repo at ADMIN-v7.4A, before the
Beer / Menu CRUD phase. The two apps share a Supabase project but
have different deploy targets, different auth models, and different
security postures.

| | Public app (`trackside-app/`) | Admin app (`trackside-app/trackside-admin/`) |
|---|---|---|
| Stack | Vite + React | Next.js 14 (App Router) |
| Auth | Anonymous guest IDs | Supabase Auth (magic link, v7.1) |
| Supabase keys | Anon only | Anon **and** service-role |
| Deploy | GitHub Pages (static) | Vercel (server runtime) |
| Repo | Public (`trackside-tales`) | Currently nested in the public repo; private repo at ADMIN-v7.4A split |

---

## ADMIN-v7.3 status

This is the **first write-capable phase** and the audit-log
checkpoint. The admin app can now mutate one tightly-scoped slice
of operational state — the live tap list — and every successful
mutation is recorded in a transactional audit log.

What's new in v7.3:

- **Tap-list management** — at `/admin/tap-list`:
  - Pour a beer (start a row in `public.tap_list`)
  - End a live pour (set `ended_at`)
  - Edit notes on a live pour
- **Audit log** — new `public.admin_actions` table. Every
  successful tap-list mutation writes one row here in the **same
  database transaction** as the mutation itself. Service-role only
  (RLS enabled, no policies). Append-only.
- **Transactional Postgres functions** — `fn_tap_start`,
  `fn_tap_end`, `fn_tap_edit_notes`. All mutations route through
  these via `supabase.rpc(...)` so audit drift is impossible.
- **Server Actions** — three new actions in
  `src/app/admin/tap-list/actions.ts`. Each calls `requireAdmin()`
  first, Zod-validates the FormData, calls the mutation helper,
  and redirects back with `?ok=...` / `?err=...` for banner state.
- **No new client components.** Forms POST to Server Actions; the
  page is a Server Component; banner state lives in the URL.

What v7.3 does **not** introduce:
- No DELETE on tap_list (pour history is append-only).
- No retroactive `started_at` editing (`fn_tap_start` always uses
  `now()` server-side).
- No mutations on any table other than `tap_list` and
  `admin_actions`.
- No public-app changes; no RLS changes on existing tables; no
  Edge Function changes; no QR / localStorage / badge-key changes.

Real surfaces arrive in subsequent phases:

| Phase | Adds |
|---|---|
| ADMIN-v7.2 | Read-only dashboard: overview tiles, content lists, activity feed (DONE) |
| ADMIN-v7.3 | Tap-list management + transactional `admin_actions` audit log (DONE) |
| ADMIN-v7.4A | Repo split: extract `trackside-admin/` into private GitHub repo |
| ADMIN-v7.4B | Beer / menu CRUD |
| ADMIN-v7.5 | Tale CRUD with Zod validation mirroring `contentService.ts` |
| ADMIN-v7.6 | QR management |
| ADMIN-v7.7 | Media uploads (Supabase Storage) |
| ADMIN-v7.8 | Analytics views |
| ADMIN-v7.9 | Rewards / tiers + audit-log viewer (`/admin/audit`) |

### v7.3 migration

A single new migration was added at
`supabase/migrations/20260602000000_admin_actions_and_tap_fns.sql`.
It:

1. Creates `public.admin_actions`:
   ```sql
   create table public.admin_actions (
     id           bigserial primary key,
     actor_id     uuid not null references auth.users(id) on delete restrict,
     actor_email  text not null,
     action       text not null check (action in ('tap.start', 'tap.end', 'tap.edit_notes')),
     target_kind  text not null,
     target_key   text not null,
     payload      jsonb not null default '{}'::jsonb,
     created_at   timestamptz not null default now()
   );
   ```
   - RLS enabled with **no policies** (service-role only, same
     posture as `qr_codes`, `media_assets`, and the `*_events`
     tables).
   - Indexes on `(actor_id, created_at desc)`,
     `(action, created_at desc)`, and `(created_at desc)` for the
     v7.9 audit viewer.
   - `actor_email` is denormalized at action time so audit history
     stays readable even if the user later changes email or is
     hidden from `auth.users`.
   - `actor_id` uses `on delete restrict`: an admin cannot be
     deleted while audit history references them. Audit-trail
     integrity outranks user-row tidiness.

2. Creates three stored functions:
   - `fn_tap_start(p_actor, p_email, p_beer_slug, p_tap_number, p_notes)` —
     INSERT tap_list + INSERT admin_actions in one transaction.
     Raises `P0001` if the beer is not active or does not exist.
     `started_at` is always `now()` (no retroactive starts).
   - `fn_tap_end(p_actor, p_email, p_beer_slug, p_started_at)` —
     UPDATE tap_list (only where `ended_at is null`) + INSERT
     admin_actions. Raises `P0002` if no live row matches.
   - `fn_tap_edit_notes(p_actor, p_email, p_beer_slug, p_started_at, p_notes)` —
     UPDATE tap_list notes + INSERT admin_actions, with the
     pre-edit value captured under a `for update` row lock so two
     concurrent editors can't interleave.
   - All three are `security invoker` with `set search_path =
     public` (lock down schema-shadowing).

### Audit table contract

- Append-only. **No UPDATE, no DELETE** on `admin_actions` is ever
  performed by the app. Future audit retention policies (if any)
  will land at the database / migration level, not in app code.
- Service-role only. The table has RLS enabled with no policies,
  and there is no anon-readable surface. The v7.9 audit viewer
  will read it through the same service-role admin query layer
  used for other admin-only tables.
- Actor identity comes ONLY from `requireAdmin()` server-side.
  The Server Actions pass `{ id, email }` from the verified JWT
  into the mutation helpers; any `actor_id` arriving in a form
  field is a privilege-escalation attempt and is ignored.
- Every successful tap-list mutation writes exactly one
  `admin_actions` row in the same transaction. There is no path
  in app code that writes `tap_list` without also writing
  `admin_actions` — the contract is enforced by the Postgres
  functions, not by application convention.

### v7.3 rollback plan

Full unwind, in reverse dependency order:

```sql
drop function if exists public.fn_tap_edit_notes(uuid, text, text, timestamptz, text);
drop function if exists public.fn_tap_end(uuid, text, text, timestamptz);
drop function if exists public.fn_tap_start(uuid, text, text, int, text);
drop table if exists public.admin_actions;
```

All four objects are introduced in
`20260602000000_admin_actions_and_tap_fns.sql` and nothing earlier
references them, so the unwind is safe.

App-side rollback, if ever needed:
1. Revert the migration (above).
2. Remove `src/app/admin/tap-list/` (page + actions).
3. Remove `src/lib/admin/mutations.ts`.
4. Remove the three tap-list helpers from `src/lib/admin/queries.ts`
   (`listLiveTapList`, `listRecentEndedTapList`,
   `listActiveBeerOptions`).
5. Remove the `Tap List` nav link from `src/app/admin/layout.tsx`.

The other admin surfaces (v7.2 dashboard / lists) are read-only
and do not depend on v7.3 objects.

---

## Setup

From the public-app root (`trackside-app/`):

```bash
cd trackside-admin
npm install
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY in .env.local
npm run dev
# → http://localhost:3000
```

Coexists with the public Vite app on `localhost:5173`. No port
collision. The admin app has its own `package.json`,
`node_modules/`, and TypeScript config; it does not share
dependencies with the public app, and the public app's
GitHub Pages deploy never enters this folder.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | ESLint via `next lint` |
| `npm run typecheck` | `tsc --noEmit` strict check |

---

## Environment variables

| Var | Scope | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | yes | Inlined into the browser bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | yes | Inlined into the browser bundle |
| `NEXT_PUBLIC_SITE_URL` | client + server | prod-required | Origin used for magic-link `redirectTo`. Must match a Supabase "Redirect URLs" entry. Falls back to request host in dev. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | yes (for any data work) | **NEVER** prefix with `NEXT_PUBLIC_`. Bypasses RLS. |

### Service-role key — critical security note

The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security on the
Supabase project. It is the equivalent of a database admin password.

**Rules:**

1. Never commit it. `.env.local` and `.env*.local` are gitignored.
2. Never prefix it with `NEXT_PUBLIC_`. That would inline it into the
   browser bundle.
3. Never import `lib/supabase/server.ts` from a Client Component (any
   file with `'use client'` at the top). The `server-only` package will
   fail the build if you try.
4. On Vercel, scope the env var to **Production** only — preview
   deployments and previews from forks must not receive it. Until a
   staging Supabase project exists, preview deploys run read-only.
5. If you ever suspect the key has leaked — even for a moment — rotate
   it immediately in the Supabase dashboard (Settings → API → "Reset
   service role secret"). It's revocable.

---

## Local dev

```bash
npm run dev
```

The pages should render at:

- `/` — public landing ("Trackside Tales — Admin · Sign-in required")
- `/login` — magic-link sign-in form
- `/auth/callback` — exchanges the magic-link code for a session, then
  redirects to `/admin`
- `/admin` — gated placeholder dashboard. Hitting it without an admin
  session redirects to `/login`.
- `/logout` — POST-only endpoint; the layout's "Sign out" button is
  the only intended trigger.

---

## Auth setup

The admin shell uses Supabase Auth magic-link sign-in. There is no
self-service sign-up; users are added by SQL bootstrap (below) and the
`shouldCreateUser: false` flag on `signInWithOtp` ensures the public
sign-in form cannot create new `auth.users` rows.

### 1. Configure Supabase redirect URLs

Supabase will refuse to issue a magic link unless the `redirectTo`
value matches an entry in its allowlist.

Supabase dashboard → **Authentication → URL Configuration → Redirect
URLs** → add:

```
http://localhost:3000/auth/callback
https://your-admin-domain.example.com/auth/callback
```

Replace the production line with the real Vercel domain once known.
The `/auth/callback` path is required — Supabase matches the full URL.

### 2. Set `NEXT_PUBLIC_SITE_URL`

- Local dev: optional (the login page falls back to the request host).
- Production (Vercel, scope = Production): **required**, e.g.
  `https://your-admin-domain.example.com`. No trailing slash.

### 3. Bootstrap the first admin

Authentication is allowlist-only via
`auth.users.raw_app_meta_data.role = 'admin'`. There is no admin UI to
manage this yet — granting and revoking admin happens via SQL. Use
the Supabase dashboard SQL editor (or `psql` against the project) and
run as the project owner:

```sql
-- 1. Create the auth.users row by inviting the email from the
--    Supabase dashboard → Authentication → Users → "Invite user".
--    The invite email is itself a magic link; the user can click it
--    to land in /auth/callback. (You can also create the row by
--    running an initial signInWithOtp from psql, but the dashboard
--    invite is the simplest path.)
--
-- 2. Promote that user to admin:

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin')
where email = 'you@example.com';

-- 3. Verify:

select email, raw_app_meta_data ->> 'role' as role
from auth.users
where email = 'you@example.com';
```

`raw_app_meta_data` is server-controlled and cannot be modified via
the client SDK. Do **not** use `raw_user_meta_data` for the role
flag — that field is user-editable and a privilege-escalation hazard.

To revoke admin, set the role back to null:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data - 'role'
where email = 'you@example.com';
```

The user's existing JWT will continue to claim `role = 'admin'` until
it expires (~1 hour by default). For immediate revocation, also
delete their refresh tokens from `auth.refresh_tokens` or invalidate
their session via Supabase admin API.

---

## Deployment notes (deferred to v7.0 commit decision)

**Hosting target:** Vercel.

**GitHub repo strategy:**

- Phase 1 (v7.0–v7.3): the admin app lives nested inside the existing
  public `trackside-tales` repo at `trackside-app/trackside-admin/`
  for cheap iteration. No deploy infrastructure is wired here yet.
- Phase 2 (v7.4A+): extract into a new private repo
  `Jayc92/trackside-admin` via `git filter-repo`, preserving history.
  The public-app repo (`trackside-tales`) must stay public on the
  free GitHub Pages tier; admin is **private from day one of the
  split**.

The GitHub Pages workflow at the public app's
`.github/workflows/deploy.yml` builds from the public-app root and
does not enter `trackside-admin/`. Adding the admin scaffold to the
repo therefore has zero effect on the public-app deploy pipeline.

Vercel project configuration (set up at v7.1 / v7.2):

- Project: `trackside-admin-prod`
- Build command: `npm run build` (default)
- Output directory: `.next` (default)
- Install command: `npm install` (default)
- Env vars (Production scope only initially):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` is added at v7.1 for magic-link `redirectTo`.

---

## Architecture boundaries

```
middleware.ts                  session-refresh middleware (anon key only)
src/
  app/
    layout.tsx                 root layout
    page.tsx                   public landing → /login
    login/
      page.tsx                 magic-link sign-in (Server Component +
                               server action; enumeration-resistant)
    auth/
      callback/
        route.ts               exchanges OTP code for session
    logout/
      route.ts                 POST-only sign-out
    admin/
      layout.tsx               gate: calls requireAdmin() before render
      page.tsx                 dashboard (read-only, v7.2)
      tales/page.tsx           tales list (read-only, v7.2)
      beers/page.tsx           beers + food lists (read-only, v7.2)
      tap-list/
        page.tsx               tap-list management UI (v7.3, write)
        actions.ts             Server Actions: tap.start / end / edit-notes (v7.3)
      qr/page.tsx              QR codes list (read-only, v7.2)
      activity/page.tsx        merged activity feed (read-only, v7.2)
  lib/
    supabase/
      server.ts                service-role factory — `import 'server-only'`
      browser.ts               anon factory — Client Components only
      auth.ts                  per-request session client (anon key,
                               cookie-bound) — `import 'server-only'`
    admin/
      queries.ts               read helpers (service-role) — `import 'server-only'`
      mutations.ts             write helpers (service-role, RPC-only) —
                               `import 'server-only'` (v7.3)
    auth/
      requireAdmin.ts          gate: getUser + app_metadata.role check
```

**The `server` / `browser` split is the single most important security
boundary in this app.** Do not "consolidate" them. Do not make
`lib/supabase/server.ts` re-export from `lib/supabase/browser.ts` or
vice versa. They run in different worlds and hold different secrets.
