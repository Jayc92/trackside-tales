// ================== TRACKSIDE ADMIN — /admin/activity ==================
// Read-only merged activity feed across `unlock_events`,
// `badge_events`, and `game_events`. All three tables are service-role
// only — there are no anon read policies — so this page is the
// canonical staff-facing view of what's happening in the app.
//
// Merge strategy:
//   * Pull the 50 most recent rows from each of the three streams.
//   * Sort the combined list by created_at desc.
//   * Truncate to 50 in the UI.
//
// This may show fewer than 50 game/badge events on a high-unlock day
// (or vice versa) — that's the cost of a fixed per-stream cap. Real
// pagination + per-stream filters land later. For v7.2 the goal is
// just "is anything happening, and what kind?".

import {
  listRecentActivity,
  type ActivityRow,
  type ActivityEventType,
} from '@/lib/admin/queries';
import { StatusNotice } from '@/components/admin/StatusNotice';

function shortenGuestId(id: string): string {
  // Guest IDs are 'g_<rand>_<ts>' and quite long. Show first 14 chars
  // for visual scan; full ID is in the title attribute for copy/paste.
  return id.length <= 14 ? id : id.slice(0, 14) + '…';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const typeLabel: Record<ActivityEventType, string> = {
  unlock: 'unlock',
  badge:  'badge',
  game:   'game',
};

const typeBadgeClass: Record<ActivityEventType, string> = {
  unlock: 'bg-brass/20 text-rail',
  badge:  'bg-parchment text-ink',
  game:   'bg-ink/10 text-ink',
};

export default async function AdminActivityPage() {
  const result = await listRecentActivity();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-xl text-rail">Activity</h2>
        <p className="text-sm text-ink/60">
          Most recent unlock, badge, and game events from{' '}
          <code className="text-xs">public.unlock_events</code>,{' '}
          <code className="text-xs">public.badge_events</code>, and{' '}
          <code className="text-xs">public.game_events</code>. Read-only.
        </p>
      </header>

      {!result.ok ? (
        <StatusNotice tone="error">{result.error}</StatusNotice>
      ) : result.data.length === 0 ? (
        <StatusNotice>No activity yet.</StatusNotice>
      ) : (
        <div className="overflow-x-auto rounded-md border border-brass/30 bg-white/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-parchment/60 text-xs uppercase tracking-widest text-ink/60">
              <tr>
                <th className="px-3 py-2">when</th>
                <th className="px-3 py-2">type</th>
                <th className="px-3 py-2">guest</th>
                <th className="px-3 py-2">tale_slug</th>
                <th className="px-3 py-2">detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brass/20">
              {result.data.map((row: ActivityRow, idx: number) => (
                <tr
                  // No natural composite key across streams; index is
                  // safe because the list is fully re-rendered per
                  // request (force-dynamic) and never reordered client-side.
                  key={`${row.type}-${row.created_at}-${idx}`}
                  className="align-top text-ink/80"
                >
                  <td className="px-3 py-2 text-xs text-ink/70">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[11px] uppercase tracking-widest ${typeBadgeClass[row.type]}`}
                    >
                      {typeLabel[row.type]}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2 font-mono text-xs"
                    title={row.guest_id}
                  >
                    {shortenGuestId(row.guest_id)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.tale_slug ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink/70">
                    {row.detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
