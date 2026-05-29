// ================== TRACKSIDE ADMIN — public landing ==================
// Server Component. Public-facing placeholder for the bare admin
// origin. The real auth-gated experience lives behind /admin and is
// wired in v7.1; today this page exists only so a hit on `/` doesn't
// 404 and so deploy smoke-tests have something predictable to target.
//
// Deliberately neutral copy: no project secrets, no row counts, no
// hint that the database is even reachable. Anyone with the URL can
// see this; treat it as part of the public attack surface.

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-serif text-3xl text-rail">
        Trackside Tales — Admin
      </h1>
      <p className="text-base text-ink/80">
        Sign-in required. This portal is for Trackside Tales staff only.
      </p>
      <p className="text-sm text-ink/60">
        ADMIN-v7.0 scaffold checkpoint · no auth or data wired yet.
      </p>
    </main>
  );
}
