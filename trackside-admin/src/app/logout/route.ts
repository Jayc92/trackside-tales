// ================== TRACKSIDE ADMIN — /logout ==================
// POST-only logout handler. Signs out the current Supabase session
// and redirects to /login.
//
// POST-only on purpose:
//   * GET-triggered logout enables CSRF "log victim out" griefing,
//     including via prefetch hovers and link previews.
//   * Browsers can't issue cross-origin POSTs without an explicit
//     form submission, so a same-origin form button is the right
//     trigger surface. The admin layout's "Sign out" control is a
//     proper <form action="/logout" method="post"> button.
//
// We sign out from the auth client (which writes the cleared cookies
// via the SSR cookie bridge) and then 303-redirect to /login so the
// browser performs a fresh GET against the login page rather than
// re-submitting on refresh.

import { NextResponse, type NextRequest } from 'next/server';
import { createAuthClient } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createAuthClient();
    await supabase.auth.signOut();
  } catch {
    // Sign-out failure is silent: the cookies will be re-validated on
    // the next request and the user lands on /login regardless.
  }
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
