// ================== TRACKSIDE ADMIN — public landing ==================
// Server Component. Public-facing placeholder for the bare admin
// origin. The real auth-gated experience lives behind /admin (gated
// by the layout-level `requireAdmin()` since v7.1). Unauthenticated
// visitors who hit `/admin` are redirected to /login; this page
// just gives them a friendly entry point.
//
// Deliberately neutral copy: no project secrets, no row counts, no
// hint that the database is even reachable. Anyone with the URL can
// see this; treat it as part of the public attack surface.

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-serif text-3xl text-rail">
        Trackside Tales — Admin
      </h1>
      <p className="text-base text-ink/80">
        Sign-in required. This portal is for Trackside Tales staff only.
      </p>
      <Link
        href="/login"
        className="rounded bg-rail px-4 py-2 text-sm font-medium uppercase tracking-widest text-parchment transition hover:bg-ink"
      >
        Sign in
      </Link>
    </main>
  );
}
