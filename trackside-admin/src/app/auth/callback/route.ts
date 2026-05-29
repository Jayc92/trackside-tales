// ================== TRACKSIDE ADMIN — magic-link callback ==================
// Handles the redirect Supabase sends users to after they click their
// magic link. The URL contains a `code` query param which we exchange
// for a session via the SSR client; @supabase/ssr writes the resulting
// auth cookies via the cookie bridge in `lib/supabase/auth.ts`.
//
// Flow:
//   /auth/callback?code=<otp>
//     → exchangeCodeForSession(code)
//         success: redirect(303, '/admin')   — requireAdmin() will
//                                               then enforce role.
//         failure: redirect(303, '/login?status=expired')
//
// Notes:
//   * We don't pass the code through to /admin or /login. The whole
//     point of the exchange is to convert a single-use code into a
//     long-lived session cookie; the code itself is consumed and
//     should not appear anywhere downstream.
//   * `redirectTo` query param is intentionally NOT honored here —
//     allowing arbitrary post-auth redirects opens an open-redirect
//     attack surface. v7.1 always lands on /admin. If a deep-link
//     return-to-after-login UX is needed later, validate the param
//     against a strict same-origin allowlist before honoring it.

import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth';

// Route Handlers using the cookies() bridge are dynamic by nature,
// but declaring it explicitly keeps Next from attempting any static
// optimization here.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?status=expired', url));
  }

  const supabase = createAuthClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?status=expired', url));
  }

  return NextResponse.redirect(new URL('/admin', url));
}
