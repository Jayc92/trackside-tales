// ================== TRACKSIDE ADMIN — /admin/qr ==================
// Read-only list of `public.qr_codes`. This table is service-role only
// (RLS enabled with NO policies in the canonical schema), so the admin
// app is the only legitimate read path. The public app resolves QR
// codes via the validate-qr edge function — never directly.
//
// No edit / rotate / activate controls yet. QR management lands in v7.6.

import { listQrCodes } from '@/lib/admin/queries';
import { StatusNotice } from '@/components/admin/StatusNotice';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function AdminQrCodesPage() {
  const result = await listQrCodes();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-xl text-rail">QR codes</h2>
        <p className="text-sm text-ink/60">
          All rows in <code className="text-xs">public.qr_codes</code> —
          including inactive / rotated codes. Read-only.
        </p>
      </header>

      {!result.ok ? (
        <StatusNotice tone="error">{result.error}</StatusNotice>
      ) : result.data.length === 0 ? (
        <StatusNotice>No QR codes yet.</StatusNotice>
      ) : (
        <div className="overflow-x-auto rounded-md border border-brass/30 bg-white/40">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-parchment/60 text-xs uppercase tracking-widest text-ink/60">
              <tr>
                <th className="px-3 py-2">code</th>
                <th className="px-3 py-2">tale_slug</th>
                <th className="px-3 py-2">purpose</th>
                <th className="px-3 py-2">location_label</th>
                <th className="px-3 py-2">active</th>
                <th className="px-3 py-2">rotated_at</th>
                <th className="px-3 py-2">created_at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brass/20">
              {result.data.map((row) => (
                <tr key={row.code} className="align-top text-ink/80">
                  <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.tale_slug}</td>
                  <td className="px-3 py-2">{row.purpose ?? '—'}</td>
                  <td className="px-3 py-2">{row.location_label ?? '—'}</td>
                  <td className="px-3 py-2">{row.is_active ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2 text-xs text-ink/60">
                    {formatDate(row.rotated_at)}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink/60">
                    {formatDate(row.created_at)}
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
