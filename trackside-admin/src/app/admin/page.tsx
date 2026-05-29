// ================== TRACKSIDE ADMIN — /admin dashboard ==================
// Server Component. Read-only overview tiles powered by the
// service-role Supabase client via `lib/admin/queries.ts`.
//
// Auth posture:
//   * The parent layout calls `requireAdmin()` before this page
//     renders. Reaching this view at all means the request is a
//     verified admin.
//   * This page imports server-only helpers; ESLint + the
//     `server-only` package + the absence of `'use client'` here all
//     conspire to keep service-role code off the browser.
//
// Failure posture:
//   * If the dashboard query fails, the page renders a single error
//     card via <StatusNotice> rather than throwing — staff still get
//     a usable shell with sign-out + nav.
//   * If a count is genuinely zero, the tile shows 0. Tables being
//     empty is a normal state, not an error.

import {
  getDashboardCounts,
  type DashboardCounts,
} from '@/lib/admin/queries';
import { StatusNotice } from '@/components/admin/StatusNotice';

interface Tile {
  label: string;
  value: number;
  hint?: string;
}

function buildTiles(counts: DashboardCounts): Tile[] {
  return [
    { label: 'Tales · total',      value: counts.talesTotal },
    { label: 'Tales · published',  value: counts.talesPublished },
    { label: 'Tales · draft',      value: counts.talesDraft },
    { label: 'Beers · total',      value: counts.beersTotal },
    { label: 'QR codes · active',  value: counts.qrActive },
    { label: 'Unlock events',      value: counts.unlockEventsTotal },
    { label: 'Badge events',       value: counts.badgeEventsTotal },
    { label: 'Game events',        value: counts.gameEventsTotal },
    { label: 'Activity (7d)',      value: counts.recentActivity7d, hint: 'unlock + badge + game events' },
  ];
}

export default async function AdminDashboardPage() {
  const result = await getDashboardCounts();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-xl text-rail">Dashboard</h2>
        <p className="text-sm text-ink/60">
          Read-only overview. Counts include drafts and inactive rows
          where applicable; service-role queries bypass RLS.
        </p>
      </header>

      {!result.ok ? (
        <StatusNotice tone="error">{result.error}</StatusNotice>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {buildTiles(result.data).map((tile) => (
            <li
              key={tile.label}
              className="rounded-md border border-brass/30 bg-white/40 p-4"
            >
              <div className="text-xs uppercase tracking-widest text-ink/50">
                {tile.label}
              </div>
              <div className="mt-1 font-serif text-3xl text-rail">
                {tile.value.toLocaleString()}
              </div>
              {tile.hint && (
                <div className="mt-1 text-[11px] text-ink/40">{tile.hint}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
