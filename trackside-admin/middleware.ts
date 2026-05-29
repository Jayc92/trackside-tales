// ================== TRACKSIDE ADMIN — middleware ==================
// Session-refresh middleware for the admin app. Runs on (almost)
// every request; calls `supabase.auth.getUser()` so @supabase/ssr can
// re-issue the auth cookies before they expire.
//
// IMPORTANT: this middleware DOES NOT gate routes. Gating is handled
// at the layout level via `requireAdmin()` so that the gate logic
// lives next to the data it protects, the role check is exercised by
// every request to /admin (not just first-paint), and we never have
// to keep the middleware allowlist in sync with the route tree.
//
// Hard rules:
//
//   * Anon key only. The service-role key is NEVER read here.
//
//   * No DB queries. `getUser()` calls Supabase auth (auth.users +
//     JWT verification) but issues no PostgREST traffic.
//
//   * No throws escape. Missing env vars → no-op response. The pages
//     themselves will surface a clearer error via `requireAdmin()`.
//
//   * The matcher excludes static assets so we don't pay a Supabase
//     auth call to serve favicons.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Without env vars there is no session to refresh. Pass through.
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the JWT cookie if needed. Result intentionally ignored —
  // the gate runs in the layout, not here.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip Next internals and common static asset extensions. Everything
  // else passes through so /admin, /login, /auth/callback, /logout all
  // get a fresh session refresh attempt.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)',
  ],
};
