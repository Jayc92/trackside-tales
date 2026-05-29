// ================== TRACKSIDE ADMIN — /admin/tales ==================
// Read-only list of every row in `public.tales` — including drafts
// and soft-deleted (is_active = false). RLS is bypassed by the
// service-role client; the parent layout's requireAdmin() gate is
// the sole authorization boundary.
//
// No edit links yet. CRUD lands in v7.5.

import { listTales } from '@/lib/admin/queries';
import { StatusNotice } from '@/components/admin/StatusNotice';

function formatDate(iso: string): string {
  // Render in en-US for staff; the underlying timestamp is timestamptz.
  // We don't pin to a fixed timezone — staff want to see "when did this
  // change in our local time" rather than UTC.
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function AdminTalesPage() {
  const result = await listTales();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-xl text-rail">Tales</h2>
        <p className="text-sm text-ink/60">
          All rows in <code className="text-xs">public.tales</code> —
          drafts and inactive rows included. Read-only.
        </p>
      </header>

      {!result.ok ? (
        <StatusNotice tone="error">{result.error}</StatusNotice>
      ) : result.data.length === 0 ? (
        <StatusNotice>No tales yet.</StatusNotice>
      ) : (
        <div className="overflow-x-auto rounded-md border border-brass/30 bg-white/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-parchment/60 text-xs uppercase tracking-widest text-ink/60">
              <tr>
                <th className="px-3 py-2">slug</th>
                <th className="px-3 py-2">name</th>
                <th className="px-3 py-2">title</th>
                <th className="px-3 py-2">year</th>
                <th className="px-3 py-2">tap_status</th>
                <th className="px-3 py-2">status</th>
                <th className="px-3 py-2">active</th>
                <th className="px-3 py-2">updated_at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brass/20">
              {result.data.map((row) => (
                <tr key={row.slug} className="align-top text-ink/80">
                  <td className="px-3 py-2 font-mono text-xs">{row.slug}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.title}</td>
                  <td className="px-3 py-2">{row.year ?? '—'}</td>
                  <td className="px-3 py-2">{row.tap_status}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.is_active ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2 text-xs text-ink/60">
                    {formatDate(row.updated_at)}
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
