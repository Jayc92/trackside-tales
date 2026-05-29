// ================== TRACKSIDE ADMIN — auth client factory ==================
// Server-only Supabase client wired to the Next.js cookie store via
// @supabase/ssr. This is the SESSION client — it reads cookies, calls
// auth.getUser(), exchanges magic-link codes for sessions, signs out.
//
// IMPORTANT: this factory uses the ANON key, not the service-role key.
// User identity must be verified via the standard Supabase auth flow,
// not by impersonating the database. The service-role client lives in
// `./server.ts` and exists only for admin-scope reads/writes AFTER
// `requireAdmin()` has approved the request.
//
// HARD RULES:
//
//   1. `import 'server-only'` is the FIRST line of executable code.
//      `cookies()` from `next/headers` would already fail at build
//      time in a Client Component, but the explicit guard is cheap
//      and makes the intent unambiguous.
//
//   2. Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
//      only. NEVER reads SUPABASE_SERVICE_ROLE_KEY here.
//
//   3. Constructs a fresh client per call. The per-request cookie
//      store is captured at construction time, and Next.js does not
//      let us safely cache the resulting client across requests.
//
//   4. The `setAll` callback swallows the "called from a Server
//      Component" error — Next forbids cookie writes in RSCs, but
//      the middleware in `middleware.ts` refreshes sessions on every
//      request anyway, so a missed write here is harmless.

import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Construct a per-request Supabase client bound to the current Next.js
 * cookie store. Use this ONLY for auth-related work (sign-in,
 * sign-out, code exchange, getUser). For admin-scope DB reads / writes
 * use `createServiceRoleClient()` from `./server.ts` AFTER
 * `requireAdmin()` has resolved.
 */
export function createAuthClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      '[trackside-admin] NEXT_PUBLIC_SUPABASE_URL or ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Both must be ' +
        'present in .env.local (development) or in Vercel env vars.',
    );
  }

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `cookies().set()` is illegal in Server Components in Next
          // 14. Middleware refreshes sessions on every request, so a
          // missed write here cannot strand a session — it just gets
          // re-issued on the next navigation.
        }
      },
    },
  });
}
