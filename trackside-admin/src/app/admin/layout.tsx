// ================== TRACKSIDE ADMIN — /admin layout ==================
// Server Component placeholder for the gated admin shell. v7.1 will
// add `requireAdmin()` here as the single auth checkpoint covering
// every nested route. Keep this file intentionally bare so reviewers
// in v7.1 see exactly one place where the gate is added.
//
// Today this layout enforces NOTHING. The /admin tree is reachable
// by anyone who knows the URL. That is acceptable for v7.0 because:
//   * No data is read or written.
//   * No service-role calls are issued.
//   * The pages are static placeholder text with no secrets.
// The instant we wire either real data reads or writes, v7.1 must
// land first.

import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-6">
      <header className="flex items-baseline justify-between border-b border-brass/30 pb-4">
        <h1 className="font-serif text-2xl text-rail">
          Trackside Tales · Admin
        </h1>
        <span className="text-xs uppercase tracking-widest text-ink/60">
          v7.0 scaffold
        </span>
      </header>
      <section>{children}</section>
      <footer className="mt-auto border-t border-brass/20 pt-4 text-xs text-ink/50">
        Internal staff portal. Do not share URLs externally.
      </footer>
    </div>
  );
}
