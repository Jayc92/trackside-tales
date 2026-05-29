// ================== TRACKSIDE ADMIN — requireAdmin ==================
// Server-only authorization gate for every admin route. Wired into
// the /admin layout in v7.1; future protected route handlers and
// server actions also call it before doing any work.
//
// Allowlist mechanism:
//   * `auth.users.raw_app_meta_data.role === 'admin'`
//   * `app_metadata` is server-controlled — users cannot edit it via
//     the client SDK. NEVER use `user_metadata` for the role check;
//     `user_metadata` is user-editable.
//   * Bootstrap the first admin via Supabase SQL editor (see README).
//
// Why getUser, not getSession:
//   * `getSession()` returns whatever the cookie says without
//     verifying signatures, which is fine for "are we logged in"
//     UX hints but not for an authorization gate.
//   * `getUser()` calls Supabase auth and validates the JWT, which
//     is what a security boundary needs.
//
// Why redirect, not throw:
//   * Throwing inside a Server Component renders the Next 500 page,
//     which leaks more than we want and breaks the user flow.
//   * `redirect()` from `next/navigation` short-circuits the render
//     and produces a clean navigation to /login. The thrown
//     `NEXT_REDIRECT` exception is caught by Next's framework
//     boundary; tests that need to assert on it can use
//     `isRedirectError`.
//
// What this function does NOT do:
//   * Does NOT touch the service-role client. The service-role
//     factory is independent and is only used AFTER this gate has
//     resolved.
//   * Does NOT log denials. Auth telemetry is deferred to a later
//     phase; the layout-level gate is the single chokepoint where
//     such logging would land.

import 'server-only';
import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase/auth';

export interface AdminUser {
  id:    string;
  email: string;
}

/**
 * Server-side admin gate. Returns the authenticated admin user, or
 * redirects (server-side) to /login if the request is unauthenticated
 * or the user is not on the `app_metadata.role='admin'` allowlist.
 *
 * Callers can rely on the return value being a valid admin — the
 * function never returns null/undefined; it either resolves to a
 * concrete `AdminUser` or terminates rendering via `redirect`.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    redirect('/login');
  }

  const user = data.user;
  // app_metadata is server-controlled. user_metadata is user-editable
  // and MUST NOT be used for role checks.
  const role = (user.app_metadata as { role?: unknown } | null)?.role;
  if (role !== 'admin') {
    redirect('/login');
  }

  return {
    id:    user.id,
    email: user.email ?? '',
  };
}
