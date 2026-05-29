# Trackside Tales — Admin Portal

Private admin portal for Trackside Tales. **Not for customer use.**

This is the admin/back-office companion to the public Vite SPA. For
v7.0–v7.2 the admin scaffold lives nested inside the public-app repo
at `trackside-app/trackside-admin/` for cheap iteration; it will be
extracted to its own private GitHub repo before the first
write-capable phase (likely v7.3 or v7.4). The two apps share a
Supabase project but have different deploy targets, different auth
models, and different security postures.

| | Public app (`trackside-app/`) | Admin app (`trackside-app/trackside-admin/`) |
|---|---|---|
| Stack | Vite + React | Next.js 14 (App Router) |
| Auth | Anonymous guest IDs | Supabase Auth (magic link, v7.1) |
| Supabase keys | Anon only | Anon **and** service-role |
| Deploy | GitHub Pages (static) | Vercel (server runtime) |
| Repo | Public (`trackside-tales`) | Currently nested in the public repo; private repo after v7.3 split |

---

## ADMIN-v7.1 status

This is the **auth checkpoint**. The shell now authenticates and
gates, but reads no data:

- Authentication — magic-link sign-in via Supabase Auth. `/admin/**`
  is gated by `requireAdmin()` which validates the JWT and confirms
  `app_metadata.role === 'admin'`. Unauthenticated or non-admin users
  are redirected to `/login`.
- No data reads — `lib/supabase/server.ts` (service-role) is wired
  but still unused. `lib/supabase/auth.ts` (anon-key session client)
  exists only for sign-in / sign-out / `getUser` / code exchange.
- No CRUD, no dashboard data, no analytics.

Real surfaces arrive in subsequent phases:

| Phase | Adds |
|---|---|
| ADMIN-v7.2 | Read-only dashboard: overview tiles, content lists, activity feed |
| ADMIN-v7.3 | Tap-list management |
| ADMIN-v7.4 | Beer / menu CRUD |
| ADMIN-v7.5 | Tale CRUD with Zod validation mirroring `contentService.ts` |
| ADMIN-v7.6 | QR management |
| ADMIN-v7.7 | Media uploads (Supabase Storage) |
| ADMIN-v7.8 | Analytics views |
| ADMIN-v7.9 | Rewards / tiers + audit log |

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

- Phase 1 (v7.0–v7.2): the admin app lives nested inside the existing
  public `trackside-tales` repo at `trackside-app/trackside-admin/`
  for cheap iteration. No deploy infrastructure is wired here yet.
- Phase 2 (v7.3+): extract into a new private repo
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
      page.tsx                 placeholder dashboard (gated)
  lib/
    supabase/
      server.ts                service-role factory — `import 'server-only'`
      browser.ts               anon factory — Client Components only
      auth.ts                  per-request session client (anon key,
                               cookie-bound) — `import 'server-only'`
    auth/
      requireAdmin.ts          gate: getUser + app_metadata.role check
```

**The `server` / `browser` split is the single most important security
boundary in this app.** Do not "consolidate" them. Do not make
`lib/supabase/server.ts` re-export from `lib/supabase/browser.ts` or
vice versa. They run in different worlds and hold different secrets.
