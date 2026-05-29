// ================== TRACKSIDE ADMIN — requireAdmin (placeholder) ==================
// v7.0 scaffold stub. The real implementation lands in ADMIN-v7.1 and
// will:
//
//   1. Read the Supabase session from request cookies via @supabase/ssr.
//   2. Reject (redirect to /login) if no session is present.
//   3. Reject (403) if `user.app_metadata.role !== 'admin'`.
//   4. Return the resolved user object so callers can show "logged in
//      as <email>".
//
// `app_metadata` is server-controlled and cannot be edited by users —
// that's the whole reason it (not user_metadata) is the allowlist
// surface. First admin is bootstrapped via a one-time SQL update on
// auth.users.raw_app_meta_data, documented in the v7.1 prompt.
//
// In v7.0 there is intentionally no fallback "let everyone in" path.
// Calling this function MUST throw — we want any caller that
// accidentally lands in v7.0 to surface as a hard error during
// development, not as a silently-permissive admin route.

export interface AdminUser {
  id:    string;
  email: string;
}

/**
 * Placeholder. Always throws in v7.0.
 *
 * The export shape (Promise<AdminUser>) matches the v7.1 contract so
 * the call sites we'll add in v7.2+ can be written today and not
 * rewritten when v7.1 lands.
 */
export async function requireAdmin(): Promise<AdminUser> {
  throw new Error(
    '[trackside-admin] requireAdmin() is not wired yet. ' +
      'Authentication lands in ADMIN-v7.1. Do not gate any route on ' +
      'this function in v7.0 — it will fail every request by design.',
  );
}
