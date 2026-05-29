// ================== TRACKSIDE ADMIN — /admin/beers ==================
// Read-only list of `public.beers` and `public.food`, in two stacked
// tables. Drafts and inactive rows are visible (service-role read).
//
// Schema deviation note: the v7.2 brief listed `description` and
// `price` columns for food, but the canonical schema in
// supabase/migrations/20260601000000_init.sql does not define those
// columns on `public.food`. We render only fields that exist; adding
// those columns is a schema change and is out of scope here.

import { listBeers, listFood } from '@/lib/admin/queries';
import { StatusNotice } from '@/components/admin/StatusNotice';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default async function AdminBeersPage() {
  const [beersResult, foodResult] = await Promise.all([listBeers(), listFood()]);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h2 className="font-serif text-xl text-rail">Beers / Menu</h2>
        <p className="text-sm text-ink/60">
          Beers and food rows from <code className="text-xs">public.beers</code>{' '}
          and <code className="text-xs">public.food</code>. Read-only.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-lg text-rail">Beers</h3>
        {!beersResult.ok ? (
          <StatusNotice tone="error">{beersResult.error}</StatusNotice>
        ) : beersResult.data.length === 0 ? (
          <StatusNotice>No beers yet.</StatusNotice>
        ) : (
          <div className="overflow-x-auto rounded-md border border-brass/30 bg-white/40">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-parchment/60 text-xs uppercase tracking-widest text-ink/60">
                <tr>
                  <th className="px-3 py-2">slug</th>
                  <th className="px-3 py-2">name</th>
                  <th className="px-3 py-2">category</th>
                  <th className="px-3 py-2">style</th>
                  <th className="px-3 py-2">abv</th>
                  <th className="px-3 py-2">ibu</th>
                  <th className="px-3 py-2">status</th>
                  <th className="px-3 py-2">active</th>
                  <th className="px-3 py-2">updated_at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brass/20">
                {beersResult.data.map((row) => (
                  <tr key={row.slug} className="align-top text-ink/80">
                    <td className="px-3 py-2 font-mono text-xs">{row.slug}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.category}</td>
                    <td className="px-3 py-2">{row.style ?? '—'}</td>
                    <td className="px-3 py-2">{row.abv ?? '—'}</td>
                    <td className="px-3 py-2">{row.ibu ?? '—'}</td>
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
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-serif text-lg text-rail">Food</h3>
        <p className="text-xs text-ink/50">
          The canonical <code className="text-xs">public.food</code> table
          does not store description or price. Adding those columns is a
          schema change and is out of scope for v7.2.
        </p>
        {!foodResult.ok ? (
          <StatusNotice tone="error">{foodResult.error}</StatusNotice>
        ) : foodResult.data.length === 0 ? (
          <StatusNotice>No food items yet.</StatusNotice>
        ) : (
          <div className="overflow-x-auto rounded-md border border-brass/30 bg-white/40">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-parchment/60 text-xs uppercase tracking-widest text-ink/60">
                <tr>
                  <th className="px-3 py-2">slug</th>
                  <th className="px-3 py-2">name</th>
                  <th className="px-3 py-2">status</th>
                  <th className="px-3 py-2">active</th>
                  <th className="px-3 py-2">updated_at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brass/20">
                {foodResult.data.map((row) => (
                  <tr key={row.slug} className="align-top text-ink/80">
                    <td className="px-3 py-2 font-mono text-xs">{row.slug}</td>
                    <td className="px-3 py-2">{row.name}</td>
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
      </section>
    </div>
  );
}
