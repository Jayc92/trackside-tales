// ================== TRACKSIDE ADMIN — /admin layout ==================
// Server Component. Single auth checkpoint for every /admin/** route.
//
// `requireAdmin()` runs on every request to any descendant page. It
// validates the Supabase session via auth.getUser() and confirms the
// user carries `app_metadata.role === 'admin'`. On failure it
// redirects to /login server-side; the page never renders.
//
// IMPORTANT: every nested route inherits this gate by virtue of being
// inside the layout. Do NOT bypass it via `dynamic = 'force-static'`,
// route groups that escape the layout, or parallel routes outside
// /admin. If any future feature needs an admin-scope route outside
// /admin/**, it MUST call requireAdmin() at the top of its own
// Server Component / Route Handler / Server Action.
//
// Visible nav:
//   * Brand text + scaffold/version label
//   * "Dashboard" link to /admin
//   * Logged-in email
//   * Sign-out button (POST <form> to /logout — POST-only, see route)

import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/requireAdmin';

// Force dynamic rendering for the entire /admin/** subtree. The
// layout reads request cookies via `requireAdmin()` -> `getUser()`,
// which is fundamentally per-request. Marking the layout dynamic
// prevents Next from attempting to prerender any descendant route at
// build time (which would throw on missing env vars and, more
// importantly, would cache an authenticated render).
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // requireAdmin redirects to /login if unauthenticated or not on the
  // app_metadata.role='admin' allowlist. From this point onward the
  // user is a verified admin.
  const user = await requireAdmin();

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-brass/30 pb-4">
        <div className="flex items-baseline gap-6">
          <h1 className="font-serif text-2xl text-rail">
            Trackside Tales · Admin
          </h1>
          <nav aria-label="Admin">
            <Link
              href="/admin"
              className="text-sm uppercase tracking-widest text-ink/70 hover:text-rail"
            >
              Dashboard
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink/60" title={user.id}>
            {user.email || 'admin'}
          </span>
          <form action="/logout" method="post">
            <button
              type="submit"
              className="rounded border border-brass/40 bg-white/40 px-3 py-1.5 text-xs uppercase tracking-widest text-ink/80 hover:bg-white/70"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section>{children}</section>

      <footer className="mt-auto border-t border-brass/20 pt-4 text-xs text-ink/50">
        Internal staff portal. Do not share URLs externally.
      </footer>
    </div>
  );
}
