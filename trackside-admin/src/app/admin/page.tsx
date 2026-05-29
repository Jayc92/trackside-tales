// ================== TRACKSIDE ADMIN — /admin page ==================
// Server Component placeholder. Auth gating is now active (v7.1) via
// the parent `/admin` layout, which calls `requireAdmin()` before any
// descendant page renders. Reaching this view at all means the request
// has been authenticated as an admin user.
//
// The real read-only dashboard arrives in ADMIN-v7.2 (overview tiles,
// content lists, activity feed, basic counts). This page still renders
// nothing data-driven so v7.1 can ship without touching the database.
//
// Important: do NOT add service-role Supabase calls here without first
// adding query code that respects the admin scope. The gate authorizes
// the *request*; data fetches still need their own care.

export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink/70">
        Placeholder dashboard. Read-only data wiring lands in
        ADMIN-v7.2.
      </p>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          'Tales',
          'Beers / Menu',
          'QR Codes',
          'Recent Activity',
        ].map((label) => (
          <li
            key={label}
            className="rounded-md border border-brass/30 bg-white/40 p-4 text-sm text-ink/70"
          >
            <div className="text-xs uppercase tracking-widest text-ink/50">
              {label}
            </div>
            <div className="mt-1 font-serif text-rail">— v7.2</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
